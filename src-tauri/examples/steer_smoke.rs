//! Live check: after a turn is cancelled mid-way, does the next turn in the same chat still know what was said and done?
//! `cargo build --features mcp --bin diffity-mcp && cargo run --example steer_smoke -- [claude|codex|pi]`. Costs tokens.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use diffity_desktop_lib::agents::{AgentAction, AgentEvent, AgentManager, AgentMode, ChatKind, RunModel, SentAs, StartChat};
use diffity_desktop_lib::core::Store;

fn mcp_binary() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().and_then(|d| d.parent()).map(|d| d.join("diffity-mcp")))
        .unwrap_or_else(|| PathBuf::from("diffity-mcp"))
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let agent = std::env::args().nth(1).unwrap_or_else(|| "claude".into());
    let tmp = tempfile::tempdir()?;
    let repo = tmp.path().canonicalize()?;
    std::process::Command::new("git").args(["init", "-q"]).current_dir(&repo).status()?;
    for (name, body) in [("alpha.txt", "The alpha secret is ORCHID.\n"), ("beta.txt", "beta\n"), ("gamma.txt", "gamma\n"), ("delta.txt", "delta\n")] {
        std::fs::write(repo.join(name), body)?;
    }
    let repo_path = repo.to_string_lossy().into_owned();
    let data = tempfile::Builder::new().prefix("dsteer").tempdir_in("/tmp")?;
    let store = Arc::new(Store::open(data.path().join("diffity.db"))?);
    let manager = Arc::new(AgentManager::new(store.clone(), data.path().to_path_buf(), mcp_binary()));
    let session = store.get_or_create_session(&repo_path, "work")?;
    let chat = manager
        .start_chat(StartChat { repo_path, agent_id: agent.clone(), mode: AgentMode::Resolve, session_id: session.id, title: Some("steer".into()), kind: ChatKind::Conversation })
        .await?;
    let model = RunModel { model: None, effort: None };

    println!("===== turn 1 (will be cancelled after its first tool call)");
    let first_tool = Arc::new(AtomicBool::new(false));
    let seen = first_tool.clone();
    let sink = Box::new(move |event: AgentEvent| match &event {
        AgentEvent::Text { delta, .. } => print!("{delta}"),
        AgentEvent::ToolCall { title, .. } => {
            println!("\n  [tool] {title}");
            seen.store(true, Ordering::SeqCst);
        }
        _ => {}
    });
    let text = "Remember the codeword PELICAN. Then read alpha.txt, beta.txt, gamma.txt and delta.txt one at a time, \
                and after all four write a long, detailed essay about each file's contents.";
    let canceller = manager.clone();
    let chat_id = chat.id.clone();
    let watch = first_tool.clone();
    tokio::spawn(async move {
        for _ in 0..600 {
            if watch.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_secs(4)).await;
                println!("\n  [cancelling]");
                let _ = canceller.cancel_prompt(&chat_id).await;
                return;
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    });
    let result = tokio::time::timeout(Duration::from_secs(240), manager.send_prompt(&chat.id, text.into(), vec![], None, vec![], AgentAction::Chat, model.clone(), vec![], sink)).await;
    println!("\n  [turn 1 ended: {:?}]", result.as_ref().map(|r| r.as_ref().map(|_| "ok").map_err(|e| e.message.clone())));

    println!("===== turn 2 (the steer, with nothing repeated)");
    let reply = Arc::new(std::sync::Mutex::new(String::new()));
    let sink_reply = reply.clone();
    let sink = Box::new(move |event: AgentEvent| {
        if let AgentEvent::Text { delta, .. } = &event {
            print!("{delta}");
            if let Ok(mut text) = sink_reply.lock() {
                text.push_str(delta);
            }
        }
    });
    let steer = "Stop that, no essay. Answer in one line: what codeword did my previous message give you, and what is the alpha secret? Don't use any tools.";
    let _ = tokio::time::timeout(Duration::from_secs(240), manager.send_prompt(&chat.id, steer.into(), vec![], Some(SentAs::Steer), vec![], AgentAction::Chat, model, vec![], sink)).await;
    let reply = reply.lock().map(|text| text.to_uppercase()).unwrap_or_default();
    manager.shutdown().await;
    println!("\n\n[remembers previous message] {}", reply.contains("PELICAN"));
    println!("[remembers work before cancel] {}", reply.contains("ORCHID"));
    Ok(())
}
