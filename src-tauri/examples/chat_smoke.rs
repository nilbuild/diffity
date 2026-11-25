//! Live check of the Claude panel's chat against an installed agent. Costs tokens.
//! `cargo build --features mcp --bin diffity-mcp && cargo run --example chat_smoke -- [claude|codex|opencode]`
//! Runs one chat in a throwaway repo, turn by turn, the way the panel does (same chat, `chat` action), and checks
//! after each turn whether the agent changed files or comments: a question must change nothing, a request must.
//! Then a chat on a past commit (read-only) is asked for a change, which must land as a comment, not an edit.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use std::time::Duration;

use diffity_desktop_lib::agents::{AgentAction, AgentEvent, AgentManager, AgentMode, ChatKind, ContextChip, RunModel, StartChat};
use diffity_desktop_lib::core::types::Side;
use diffity_desktop_lib::core::Store;

const ORIGINAL: &str = "export function average(xs) {\n  let sum = 0;\n  for (const x of xs) sum += x;\n  return sum / xs.length;\n}\n";
const CHANGED: &str = "export function average(xs) {\n  let sum = 0;\n  for (let i = 0; i <= xs.length; i++) sum += xs[i];\n  return sum / xs.length;\n}\n";

fn git(repo: &Path, args: &[&str]) -> anyhow::Result<String> {
    let out = Command::new("git")
        .args(["-c", "user.name=smoke", "-c", "user.email=smoke@example.com", "-c", "commit.gpgsign=false"])
        .args(args)
        .current_dir(repo)
        .output()?;
    anyhow::ensure!(out.status.success(), "git {args:?} failed");
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn mcp_binary() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().and_then(|d| d.parent()).map(|d| d.join("diffity-mcp")))
        .unwrap_or_else(|| PathBuf::from("diffity-mcp"))
}

struct Turn {
    text: &'static str,
    chips: Vec<ContextChip>,
    expect_edit: bool,
    expect_new_thread: bool,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let agent = std::env::args().nth(1).unwrap_or_else(|| "claude".into());
    let tmp = tempfile::tempdir()?;
    let repo = tmp.path().canonicalize()?;
    git(&repo, &["init", "-q"])?;
    std::fs::write(repo.join("math.js"), ORIGINAL)?;
    git(&repo, &["add", "."])?;
    git(&repo, &["commit", "-q", "-m", "init"])?;
    std::fs::write(repo.join("math.js"), CHANGED)?;
    let repo_path = repo.to_string_lossy().into_owned();

    let data = tempfile::Builder::new().prefix("dchat").tempdir_in("/tmp")?;
    let store = Arc::new(Store::open(data.path().join("diffity.db"))?);
    let manager = Arc::new(AgentManager::new(store.clone(), data.path().to_path_buf(), mcp_binary()));
    let model = RunModel { model: std::env::var("SMOKE_MODEL").ok(), effort: None };
    let mut failures: Vec<String> = Vec::new();

    let session = store.get_or_create_session(&repo_path, "work")?;
    let chat = manager
        .start_chat(StartChat {
            repo_path: repo_path.clone(),
            agent_id: agent.clone(),
            mode: AgentMode::Resolve,
            session_id: session.id.clone(),
            title: Some("smoke".into()),
            kind: ChatKind::Conversation,
        })
        .await?;

    let line3 = ContextChip {
        file_path: "math.js".into(),
        side: Some(Side::New),
        start_line: Some(3),
        end_line: Some(3),
        snippet: Some("  for (let i = 0; i <= xs.length; i++) sum += xs[i];".into()),
    };
    let turns = [
        Turn { text: "Why does this loop use <= ? Keep it to two sentences.", chips: vec![line3], expect_edit: false, expect_new_thread: false },
        Turn { text: "Given what you just said, what does average([]) return? One sentence.", chips: vec![], expect_edit: false, expect_new_thread: false },
        Turn { text: "Fix the loop bound. Change nothing else.", chips: vec![], expect_edit: true, expect_new_thread: false },
        Turn {
            text: "Leave one short review comment on line 4 of math.js about what happens for an empty array. Don't change code.",
            chips: vec![],
            expect_edit: false,
            expect_new_thread: true,
        },
    ];

    for (index, turn) in turns.iter().enumerate() {
        let before_file = std::fs::read_to_string(repo.join("math.js"))?;
        let before_threads = store.list_threads(&session.id, None)?.len();
        println!("\n===== turn {} : {}", index + 1, turn.text);
        let reply = run_turn(&manager, &chat.id, turn.text, turn.chips.clone(), model.clone()).await;
        let after_file = std::fs::read_to_string(repo.join("math.js"))?;
        let after_threads = store.list_threads(&session.id, None)?.len();
        let edited = before_file != after_file;
        let new_thread = after_threads > before_threads;
        println!("\n[check] edited={edited} new_thread={new_thread} reply_chars={}", reply.len());
        if edited != turn.expect_edit {
            failures.push(format!("turn {}: edited={edited}, expected {}", index + 1, turn.expect_edit));
        }
        if new_thread != turn.expect_new_thread {
            failures.push(format!("turn {}: new_thread={new_thread}, expected {}", index + 1, turn.expect_new_thread));
        }
        if reply.trim().is_empty() {
            failures.push(format!("turn {}: empty reply", index + 1));
        }
    }
    let fixed = std::fs::read_to_string(repo.join("math.js"))?;
    if fixed.contains("<= xs.length") {
        failures.push("loop bound still <= after the fix turn".into());
    }
    let messages = manager.get_chat_messages(&chat.id).await?;
    println!("\n[persisted messages] {}", messages.len());
    if messages.len() != turns.len() * 2 {
        failures.push(format!("expected {} persisted messages, got {}", turns.len() * 2, messages.len()));
    }

    // Read-only: a chat on the past commit, asked for a change.
    git(&repo, &["add", "."])?;
    git(&repo, &["commit", "-q", "-m", "loop"])?;
    std::fs::write(repo.join("other.js"), "export const x = 1;\n")?;
    git(&repo, &["add", "."])?;
    git(&repo, &["commit", "-q", "-m", "other"])?;
    let past = git(&repo, &["rev-parse", "HEAD~1"])?;
    let past_session = store.get_or_create_session(&repo_path, &past)?;
    let readonly = manager
        .start_chat(StartChat {
            repo_path: repo_path.clone(),
            agent_id: agent.clone(),
            mode: AgentMode::Review,
            session_id: past_session.id.clone(),
            title: Some("readonly".into()),
            kind: ChatKind::Conversation,
        })
        .await?;
    let before_file = std::fs::read_to_string(repo.join("math.js"))?;
    let before_threads = store.list_threads(&past_session.id, None)?.len();
    println!("\n===== read-only turn on {}", &past[..8]);
    let reply = run_turn(&manager, &readonly.id, "Rename `x` to `answer` in other.js.", vec![], model.clone()).await;
    let edited = std::fs::read_to_string(repo.join("math.js"))? != before_file;
    let new_thread = store.list_threads(&past_session.id, None)?.len() > before_threads;
    println!("\n[check] edited={edited} new_thread={new_thread} reply_chars={}", reply.len());
    if edited {
        failures.push("read-only chat edited a file".into());
    }
    if !new_thread {
        failures.push("read-only chat didn't leave the change as a comment".into());
    }

    for thread in store.list_threads(&session.id, None)?.into_iter().chain(store.list_threads(&past_session.id, None)?) {
        let first = thread.comments.first();
        println!("[thread] {}:{} by {}: {}", thread.file_path, thread.start_line, first.map(|c| c.author_name.as_str()).unwrap_or(""), first.map(|c| c.body.as_str()).unwrap_or(""));
    }
    println!("[math.js]\n{}", std::fs::read_to_string(repo.join("math.js"))?);
    manager.shutdown().await;

    if failures.is_empty() {
        println!("\nPASS");
        return Ok(());
    }
    println!("\nFAIL");
    for failure in &failures {
        println!("  - {failure}");
    }
    std::process::exit(1);
}

async fn run_turn(manager: &Arc<AgentManager>, chat_id: &str, text: &str, chips: Vec<ContextChip>, model: RunModel) -> String {
    let reply = Arc::new(std::sync::Mutex::new(String::new()));
    let sink_reply = reply.clone();
    let sink = Box::new(move |event: AgentEvent| match &event {
        AgentEvent::Text { delta, .. } => {
            print!("{delta}");
            if let Ok(mut text) = sink_reply.lock() {
                text.push_str(delta);
            }
        }
        AgentEvent::ToolCall { title, kind, .. } => println!("\n  [tool] {kind}: {title}"),
        AgentEvent::Error { message, .. } => println!("\n  [error] {message}"),
        _ => {}
    });
    let run = manager.send_prompt(chat_id, text.to_string(), chips, None, AgentAction::Chat, model, vec![], sink);
    match tokio::time::timeout(Duration::from_secs(240), run).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => println!("\n  [turn error] {error}"),
        Err(_) => {
            println!("\n  [timeout]");
            let _ = manager.cancel_prompt(chat_id).await;
        }
    }
    let text = reply.lock().map(|text| text.clone()).unwrap_or_default();
    text
}
