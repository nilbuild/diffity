//! Live check: a steer that contradicts a half-done change. Asks for a rename across five files, cancels after the first
//! edit, then says "call it something else". Passes when no file is left with the first name or the original one.
//! `cargo build --features mcp --bin diffity-mcp && cargo run --example steer_conflict -- [claude|codex|pi]`. Costs tokens.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use diffity_desktop_lib::agents::{AgentAction, AgentEvent, AgentManager, AgentMode, ChatKind, RunModel, SentAs, StartChat};
use diffity_desktop_lib::core::Store;

const FILES: [&str; 5] = ["math.js", "a.js", "b.js", "c.js", "d.js"];

fn mcp_binary() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().and_then(|d| d.parent()).map(|d| d.join("diffity-mcp")))
        .unwrap_or_else(|| PathBuf::from("diffity-mcp"))
}

fn has_word(text: &str, word: &str) -> bool {
    text.split(|c: char| !c.is_alphanumeric() && c != '_').any(|token| token == word)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let agent = std::env::args().nth(1).unwrap_or_else(|| "claude".into());
    let adding = std::env::args().nth(2).as_deref() == Some("add");
    let detail = if adding {
        "Also add a one-line JSDoc comment above the function in math.js."
    } else {
        "Actually, call it `avg`, not `mean`."
    };
    let steer = detail.to_string();
    let tmp = tempfile::tempdir()?;
    let repo = tmp.path().canonicalize()?;
    std::process::Command::new("git").args(["init", "-q"]).current_dir(&repo).status()?;
    std::fs::write(repo.join("math.js"), "export function average(xs) {\n  return xs.reduce((a, b) => a + b, 0) / xs.length;\n}\n")?;
    for name in &FILES[1..] {
        std::fs::write(repo.join(name), "import { average } from './math.js';\nexport const x = average([1, 2]);\n")?;
    }
    let repo_path = repo.to_string_lossy().into_owned();
    let data = tempfile::Builder::new().prefix("dconflict").tempdir_in("/tmp")?;
    let store = Arc::new(Store::open(data.path().join("diffity.db"))?);
    let manager = Arc::new(AgentManager::new(store.clone(), data.path().to_path_buf(), mcp_binary()));
    let session = store.get_or_create_session(&repo_path, "work")?;
    let chat = manager
        .start_chat(StartChat { repo_path, agent_id: agent.clone(), mode: AgentMode::Resolve, session_id: session.id, title: Some("conflict".into()), kind: ChatKind::Conversation })
        .await?;
    let model = RunModel { model: None, effort: None };

    let edited = Arc::new(AtomicBool::new(false));
    let seen = edited.clone();
    let sink = Box::new(move |event: AgentEvent| {
        if let AgentEvent::ToolCall { title, kind, .. } = &event {
            println!("  [tool] {kind}: {title}");
            if kind == "edit" {
                seen.store(true, Ordering::SeqCst);
            }
        }
    });
    let canceller = manager.clone();
    let chat_id = chat.id.clone();
    tokio::spawn(async move {
        for _ in 0..1200 {
            if edited.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(1500)).await;
                println!("  [cancelling]");
                let _ = canceller.cancel_prompt(&chat_id).await;
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    });
    let first = "Rename the function `average` to `mean` everywhere: math.js, a.js, b.js, c.js and d.js. Edit one file at a time.";
    let _ = tokio::time::timeout(Duration::from_secs(240), manager.send_prompt(&chat.id, first.into(), vec![], None, AgentAction::Chat, model.clone(), vec![], sink)).await;
    let mut midway = 0;
    for name in FILES {
        if has_word(&std::fs::read_to_string(repo.join(name))?, "mean") {
            midway += 1;
        }
    }
    println!("[files renamed to `mean` before the steer] {midway} of {}", FILES.len());

    println!("[steer] {steer}");
    let sink = Box::new(|event: AgentEvent| match &event {
        AgentEvent::Text { delta, .. } => print!("{delta}"),
        AgentEvent::ToolCall { title, kind, .. } => println!("\n  [tool] {kind}: {title}"),
        _ => {}
    });
    let _ = tokio::time::timeout(Duration::from_secs(300), manager.send_prompt(&chat.id, steer, vec![], Some(SentAs::Steer), AgentAction::Chat, model, vec![], sink)).await;
    manager.shutdown().await;

    let mut all = String::new();
    for name in FILES {
        let body = std::fs::read_to_string(repo.join(name))?;
        println!("\n[{name}] {}", body.lines().next().unwrap_or(""));
        all.push_str(&body);
    }
    let math = std::fs::read_to_string(repo.join("math.js"))?;
    let pass = if adding {
        let renamed = FILES.iter().all(|name| std::fs::read_to_string(repo.join(name)).map(|body| has_word(&body, "mean")).unwrap_or(false));
        println!("\n[all 5 files renamed to `mean`] {renamed}");
        println!("[no `average` left] {}", !has_word(&all, "average"));
        println!("[JSDoc added in math.js] {}", math.contains("/**"));
        renamed && !has_word(&all, "average") && math.contains("/**")
    } else {
        println!("\n[no `mean` left] {}", !has_word(&all, "mean"));
        println!("[no `average` left] {}", !has_word(&all, "average"));
        !has_word(&all, "mean") && !has_word(&all, "average") && has_word(&all, "avg")
    };
    println!("[{}]", if pass { "PASS" } else { "FAIL" });
    Ok(())
}
