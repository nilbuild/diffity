//! Live smoke test against an installed agent. Costs tokens.
//! `cargo build -p diffity-mcp && cargo run -p diffity-agents --example smoke -- <claude|codex|gemini> [repo] [review|ask]`

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use diffity_agents::{AgentAction, AgentEvent, AgentManager, AgentMode, StartChat};
use diffity_core::Store;

fn git(repo: &Path, args: &[&str]) -> anyhow::Result<()> {
    let status = Command::new("git")
        .args([
            "-c",
            "user.name=smoke",
            "-c",
            "user.email=smoke@example.com",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(repo)
        .status()?;
    anyhow::ensure!(status.success(), "git {args:?} failed");
    Ok(())
}

fn make_repo(dir: &Path) -> anyhow::Result<PathBuf> {
    git(dir, &["init", "-q"])?;
    std::fs::write(dir.join("math.js"), "export function average(xs) {\n  let sum = 0;\n  for (const x of xs) sum += x;\n  return sum / xs.length;\n}\n")?;
    git(dir, &["add", "."])?;
    git(dir, &["commit", "-q", "-m", "init"])?;
    std::fs::write(
        dir.join("math.js"),
        "export function average(xs) {\n  let sum = 0;\n  for (let i = 0; i <= xs.length; i++) sum += xs[i];\n  return sum / xs.length;\n}\n",
    )?;
    Ok(dir.canonicalize()?)
}

fn mcp_binary() -> PathBuf {
    if let Ok(p) = std::env::var("DIFFITY_MCP_BIN") {
        return PathBuf::from(p);
    }
    std::env::current_exe()
        .ok()
        .and_then(|p| {
            p.parent()
                .and_then(|d| d.parent())
                .map(|d| d.join("diffity-mcp"))
        })
        .unwrap_or_else(|| PathBuf::from("diffity-mcp"))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .try_init();
    let mut args = std::env::args().skip(1);
    let agent = args.next().unwrap_or_else(|| "claude".into());
    let tmp = tempfile::tempdir()?;
    let repo = match args.next().filter(|a| a != "-") {
        Some(r) => PathBuf::from(r).canonicalize()?,
        None => make_repo(tmp.path())?,
    };
    let mode = match args.next().as_deref() {
        Some("ask") => AgentMode::Ask,
        Some("edit") => AgentMode::Edit,
        _ => AgentMode::Review,
    };
    let repo_path = repo.to_string_lossy().into_owned();

    let data = tempfile::Builder::new()
        .prefix("dsmoke")
        .tempdir_in("/tmp")?;
    let store = Arc::new(Store::open(data.path().join("diffity.db"))?);
    let manager = Arc::new(AgentManager::new(
        store.clone(),
        data.path().to_path_buf(),
        mcp_binary(),
    ));
    manager.on_threads_changed(Arc::new(|sid: &str| println!("[threads-changed] {sid}")));

    for info in manager.list_agents().await? {
        println!("[agent] {info:?}");
    }
    let session = store.get_or_create_session(&repo_path, "work")?;
    let chat = manager
        .start_chat(StartChat {
            repo_path: repo_path.clone(),
            agent_id: agent.clone(),
            mode,
            session_id: session.id.clone(),
            title: None,
        })
        .await?;

    let (perm_tx, mut perm_rx) = tokio::sync::mpsc::unbounded_channel::<(String, Option<String>)>();
    let sink = Box::new(move |ev: AgentEvent| {
        match &ev {
            AgentEvent::Text { delta, .. } => print!("{delta}"),
            AgentEvent::Thought { .. } => {}
            other => println!(
                "\n[event] {}",
                serde_json::to_string(other).unwrap_or_default()
            ),
        }
        if let AgentEvent::PermissionRequest {
            request_id,
            options,
            ..
        } = &ev
        {
            let allow = options
                .iter()
                .find(|o| o.kind.starts_with("allow") && o.kind.ends_with("once"))
                .map(|o| o.id.clone());
            let _ = perm_tx.send((request_id.clone(), allow));
        }
    });
    let responder = manager.clone();
    tokio::spawn(async move {
        while let Some((id, option)) = perm_rx.recv().await {
            println!("[auto-permission] {id} -> {option:?}");
            let _ = responder.respond_permission(&id, option).await;
        }
    });

    let custom = args.next();
    let (text, action) = match mode {
        AgentMode::Ask => ("In one sentence: what does math.js do? Use no tools except reading that file.".to_string(), AgentAction::Chat),
        _ => (
            "Keep this very short: this diff is one tiny file. Leave at most one inline comment and one short general comment, then stop.".to_string(),
            AgentAction::Review { r#ref: "work".into(), focus: None },
        ),
    };
    let (text, action) = match custom {
        Some(c) => (c, AgentAction::Chat),
        None => (text, action),
    };
    let run = manager.send_prompt(&chat.id, text, vec![], action, sink);
    let outcome = tokio::time::timeout(Duration::from_secs(170), run).await;
    match outcome {
        Ok(Ok(())) => println!("\n[turn finished]"),
        Ok(Err(e)) => println!("\n[turn error] {e}"),
        Err(_) => {
            println!("\n[timeout] cancelling");
            manager.cancel_prompt(&chat.id).await?;
        }
    }

    for thread in store.list_threads(&session.id, None)? {
        let first = thread.comments.first();
        println!(
            "[thread] {} {}:{}-{} {:?} {:?} by {:?}/{}: {}",
            &thread.id[..8],
            thread.file_path,
            thread.start_line,
            thread.end_line,
            thread.side,
            thread.severity,
            first.map(|c| c.author_type),
            first.map(|c| c.author_name.as_str()).unwrap_or(""),
            first.map(|c| c.body.as_str()).unwrap_or("")
        );
    }
    if let Ok(contents) = std::fs::read_to_string(repo.join("math.js")) {
        println!("[math.js]\n{contents}");
    }
    let messages = manager.get_chat_messages(&chat.id).await?;
    println!("[persisted messages] {}", messages.len());
    manager.shutdown().await;
    Ok(())
}
