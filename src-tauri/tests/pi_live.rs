//! Runs the real pi (pi.dev) through Diffity, with pi's scripted model standing in for a provider. Needs pi 1.0+:
//! `DIFFITY_TEST_PI=$(which pi) cargo test --test pi_live -- --nocapture`. Skipped when the variable is unset.

mod common;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use common::Repo;
use diffity_desktop_lib::agents::{AgentAction, AgentEvent, AgentManager, AgentMode, RunModel, StartChat};
use diffity_desktop_lib::core::Store;
use tokio::sync::mpsc;

/// pi's own test model. What it does depends on the word in the prompt: REVIEW comments and tries to change things,
/// FIX edits a file, SLOW talks for a long time.
const SCRIPT: &str = r#"
import { fauxProvider, fauxAssistantMessage, fauxToolCall, fauxText } from "@earendil-works/pi-ai";

function prompt(context: any): string {
  const users = (context.messages ?? []).filter((m: any) => m.role === "user");
  return JSON.stringify(users[users.length - 1]?.content ?? "");
}

export default function (pi: any) {
  const faux = fauxProvider({ provider: "faux", models: [{ id: "faux-1", name: "Faux One", reasoning: true }], tokensPerSecond: 400 });
  const first = (context: any) => {
    if (prompt(context).includes("SLOW")) {
      return fauxAssistantMessage("word ".repeat(4000));
    }
    if (prompt(context).includes("REVIEW")) {
      return fauxAssistantMessage([
        fauxText("Reviewing."),
        fauxToolCall("mcp__diffity__add_general_comment", { body: "Looks fine to me" }),
        fauxToolCall("edit", { path: "a.txt", edits: [{ oldText: "hello", newText: "HACKED" }] }),
        fauxToolCall("bash", { command: "touch hacked" }),
      ], { stopReason: "toolUse" });
    }
    return fauxAssistantMessage([
      fauxToolCall("edit", { path: "a.txt", edits: [{ oldText: "hello", newText: "bye" }] }),
      fauxToolCall("write", { path: "~/escape.txt", content: "outside" }),
    ], { stopReason: "toolUse" });
  };
  faux.setResponses([first, fauxAssistantMessage("Done.")]);
  pi.registerProvider(faux.provider);
}
"#;

struct Setup {
    _home: tempfile::TempDir,
    _data: tempfile::TempDir,
    repo: Repo,
    store: Arc<Store>,
    manager: Arc<AgentManager>,
}

fn setup(pi: &str) -> Setup {
    let home = tempfile::tempdir().unwrap();
    let script = home.path().join("faux.ts");
    std::fs::write(&script, SCRIPT).unwrap();
    let settings = serde_json::json!({
        "extensions": [script],
        "defaultProvider": "faux",
        "defaultModel": "faux-1",
    });
    std::fs::write(home.path().join("settings.json"), settings.to_string()).unwrap();
    std::env::set_var("PI_CODING_AGENT_DIR", home.path());
    std::env::set_var("HOME", home.path());
    std::env::set_var("PI_OFFLINE", "1");
    for (key, _) in std::env::vars() {
        if key.ends_with("_API_KEY") {
            std::env::remove_var(key);
        }
    }

    let repo = Repo::with_commit();
    repo.write("a.txt", "hello world\n");
    let data = tempfile::tempdir().unwrap();
    let store = Arc::new(Store::open(data.path().join("db.sqlite")).unwrap());
    store.set_setting("agent.pi.path", pi).unwrap();
    let mcp = PathBuf::from(env!("CARGO_BIN_EXE_diffity-mcp"));
    let manager = Arc::new(AgentManager::new(store.clone(), data.path().to_path_buf(), mcp));
    Setup {
        _home: home,
        _data: data,
        repo,
        store,
        manager,
    }
}

async fn chat(s: &Setup, mode: AgentMode) -> String {
    s.manager.start_bridge().await.unwrap();
    let session = s.store.get_or_create_session(&s.repo.path.to_string_lossy(), "work").unwrap();
    let chat = s
        .manager
        .start_chat(StartChat {
            repo_path: s.repo.path.to_string_lossy().into_owned(),
            agent_id: "pi".into(),
            mode,
            session_id: session.id,
            title: None,
        })
        .await
        .unwrap();
    chat.id
}

fn pi_bin() -> Option<String> {
    let pi = std::env::var("DIFFITY_TEST_PI").ok().filter(|p| Path::new(p).exists());
    if pi.is_none() {
        eprintln!("skipped: set DIFFITY_TEST_PI to a pi 1.0+ binary");
    }
    pi
}

#[tokio::test(flavor = "multi_thread")]
async fn pi_reviews_without_changing_anything_then_edits_with_approval() {
    let Some(pi) = pi_bin() else {
        return;
    };
    let s = setup(&pi);

    let agents = s.manager.list_agents(true).await.unwrap();
    let info = agents.iter().find(|a| a.id == "pi").unwrap();
    assert!(info.installed, "pi not usable: {:?}", info.note);

    let catalog = s.manager.model_catalog("pi", true).await.unwrap().unwrap();
    let faux = catalog.models.iter().find(|m| m.value == "faux/faux-1").expect("faux model listed");
    assert_eq!(faux.name, "faux/Faux One");
    assert!(faux.efforts.iter().any(|e| e.value == "high"));

    // A review: Diffity's comment tool works; edits and commands don't happen.
    let review = chat(&s, AgentMode::Review).await;
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let model = RunModel { model: Some("faux/faux-1".into()), effort: Some("low".into()) };
    s.manager
        .send_prompt(&review, "REVIEW this".into(), vec![], AgentAction::Chat, model, vec![], Box::new(move |e| sink.lock().unwrap().push(e)))
        .await
        .unwrap();
    let events = events.lock().unwrap().clone();
    assert!(matches!(events.last(), Some(AgentEvent::Done { stop_reason }) if stop_reason == "end_turn"));
    assert!(events.iter().any(|e| matches!(e, AgentEvent::Text { delta, .. } if delta.contains("Reviewing"))));
    assert!(events.iter().any(|e| matches!(e, AgentEvent::ToolCall { title, .. } if title == "mcp__diffity__add_general_comment")));
    assert!(!events.iter().any(|e| matches!(e, AgentEvent::PermissionRequest { .. })), "reviews never ask");
    assert_eq!(s.repo.read("a.txt"), "hello world\n");
    assert!(!s.repo.path.join("hacked").exists());
    let session = s.store.get_or_create_session(&s.repo.path.to_string_lossy(), "work").unwrap();
    let threads = s.store.list_threads(&session.id, None).unwrap();
    assert!(threads.iter().any(|t| t.comments.iter().any(|c| c.body == "Looks fine to me")), "comment saved");

    // A fix that asks before each edit: the edit waits for the user's answer.
    s.store.set_setting("agent.permissions", "askEach").unwrap();
    let fix = chat(&s, AgentMode::Resolve).await;
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let answers = s.manager.clone();
    tokio::spawn(async move {
        while let Some(request_id) = rx.recv().await {
            answers.respond_permission(&request_id, Some("allow".into()), false, false).await.unwrap();
        }
    });
    let asked = Arc::new(Mutex::new(Vec::new()));
    let seen = asked.clone();
    s.manager
        .send_prompt(
            &fix,
            "FIX it".into(),
            vec![],
            AgentAction::Chat,
            RunModel { model: Some("faux/faux-1".into()), effort: None },
            vec![],
            Box::new(move |e| {
                if let AgentEvent::PermissionRequest { request_id, diff, .. } = &e {
                    seen.lock().unwrap().push(diff.clone());
                    let _ = tx.send(request_id.clone());
                }
            }),
        )
        .await
        .unwrap();
    let asked = asked.lock().unwrap().clone();
    assert_eq!(asked.len(), 2, "one approval per file change");
    let diff = asked[0].clone().expect("the approval shows the change");
    assert_eq!(diff.old_text.as_deref(), Some("hello world\n"));
    assert_eq!(diff.new_text, "bye world\n");
    assert_eq!(s.repo.read("a.txt"), "bye world\n");
    // `~` is resolved the way pi resolves it, so the approval names the file pi really writes.
    let escape = s._home.path().join("escape.txt");
    let diff = asked[1].clone().expect("the approval shows the new file");
    assert_eq!(std::fs::canonicalize(&diff.path).unwrap(), std::fs::canonicalize(&escape).unwrap());
    assert!(!s.repo.path.join("~").exists());

    // Stopping a run mid-answer ends it as cancelled, and the chat answers the next prompt.
    let ask = chat(&s, AgentMode::Ask).await;
    let stopper = s.manager.clone();
    let chat_id = ask.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        stopper.cancel_prompt(&chat_id).await.unwrap();
    });
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let started = std::time::Instant::now();
    s.manager
        .send_prompt(&ask, "SLOW please".into(), vec![], AgentAction::Chat, model_faux(), vec![], Box::new(move |e| sink.lock().unwrap().push(e)))
        .await
        .unwrap();
    assert!(started.elapsed() < std::time::Duration::from_secs(8), "cancel stops the run");
    let last = events.lock().unwrap().last().cloned();
    assert!(matches!(last, Some(AgentEvent::Done { ref stop_reason }) if stop_reason == "cancelled"), "{last:?}");
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    s.manager
        .send_prompt(&ask, "and now?".into(), vec![], AgentAction::Chat, model_faux(), vec![], Box::new(move |e| sink.lock().unwrap().push(e)))
        .await
        .unwrap();
    let events = events.lock().unwrap().clone();
    assert!(events.iter().any(|e| matches!(e, AgentEvent::Text { delta, .. } if delta.contains("Done"))), "{events:?}");

    s.manager.shutdown().await;
}

fn model_faux() -> RunModel {
    RunModel { model: Some("faux/faux-1".into()), effort: None }
}
