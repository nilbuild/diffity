//! Agents the user runs in their own terminal (`diffity-mcp --terminal`, registered from Settings → Terminal).
//! They have no per-run token: each request names the repository it works in, and the bridge picks the review
//! session the user most likely means. Allowed only while Settings → Terminal → Allow terminal agents is on.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use serde::Deserialize;
use serde_json::Value;

use crate::agents::backend::ReviewBackend;
use crate::agents::tools::Binding;
use crate::agents::types::AgentMode;
use crate::core::store::session_scope;
use crate::core::types::{Thread, ThreadStatus};
use crate::core::{AppError, Result};

/// Settings key for Allow terminal agents: `"1"` when on.
pub const TERMINAL_SETTING: &str = "terminal.allowed";

pub const NOT_ALLOWED: &str =
    "Diffity isn't accepting terminal agents. Turn on Diffity → Settings → Terminal → Allow terminal agents.";

/// Who is asking and for which repository. `repo` is the git top level, resolved by `diffity-mcp` the way the
/// `diffity` command resolves it.
#[derive(Deserialize, Clone, Debug)]
pub struct TerminalClient {
    #[serde(default)]
    pub client: String,
    pub repo: String,
}

/// "Claude Code (terminal)" for `claude-code`; unknown clients keep their own name.
pub fn display_name(client: &str) -> String {
    let lower = client.to_ascii_lowercase();
    let name = if lower.contains("claude") {
        "Claude Code"
    } else if lower.contains("codex") {
        "Codex"
    } else if lower.contains("opencode") {
        "OpenCode"
    } else if lower.contains("cursor") {
        "Cursor"
    } else if client.trim().is_empty() {
        "Agent"
    } else {
        client.trim()
    };
    format!("{name} (terminal)")
}

/// What the user calls a view in the app.
pub fn ref_label(r#ref: &str) -> String {
    match r#ref {
        "work" => "Uncommitted changes".into(),
        "staged" => "Staged changes".into(),
        "unstaged" => "Unstaged changes".into(),
        other => other.into(),
    }
}

fn is_safe_ref(value: &str) -> bool {
    !value.is_empty() && !value.starts_with('-') && !value.chars().any(|c| c.is_whitespace() || c.is_control())
}

fn is_draft(thread: &Thread) -> bool {
    thread.pending || thread.comments.iter().any(|c| c.pending)
}

fn plural(count: usize, word: &str) -> String {
    format!("{count} {word}{}", if count == 1 { "" } else { "s" })
}

/// The binding a terminal request runs with, and the line every answer starts with, naming what was read.
pub struct Resolved {
    pub binding: Binding,
    pub header: String,
}

pub async fn resolve(backend: &dyn ReviewBackend, client: &TerminalClient, args: &Value) -> Result<Resolved> {
    let repo = client.repo.trim();
    if !repo.starts_with('/') || !std::path::Path::new(repo).is_dir() {
        return Err(AppError::invalid(format!("{repo} isn't inside a git repository.")));
    }
    let asked = args.get("ref").and_then(Value::as_str).map(str::trim).filter(|r| !r.is_empty());
    if let Some(r) = asked.filter(|r| !is_safe_ref(r)) {
        return Err(AppError::invalid(format!("invalid ref `{r}`")));
    }
    let threads: Vec<_> = backend
        .repo_threads(repo)
        .await?
        .into_iter()
        .filter(|(session, _)| session.scope == session_scope(repo, &session.r#ref))
        .collect();
    // The view whose open threads changed last: the one the user just commented in.
    let picked = asked.map(String::from).or_else(|| {
        threads
            .iter()
            .find(|(_, t)| t.status == ThreadStatus::Open && !t.pending)
            .map(|(session, _)| session.r#ref.clone())
    });
    let r#ref = picked.unwrap_or_else(|| "work".to_string());
    let session = backend.get_or_create_session(repo, &r#ref).await?;

    let mine: Vec<&Thread> = threads.iter().filter(|(s, _)| s.id == session.id).map(|(_, t)| t).collect();
    let open = mine.iter().filter(|t| t.status == ThreadStatus::Open && !t.pending).count();
    let drafts = mine.iter().filter(|t| is_draft(t)).count();
    let name = std::path::Path::new(repo).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let mut header = format!("{name} · {} · {}", ref_label(&r#ref), plural(open, "open thread"));
    if drafts > 0 {
        header.push_str(&format!(" · {} not submitted (Finish review in Diffity to share them)", plural(drafts, "draft")));
    }
    if open == 0 && asked.is_none() {
        let elsewhere = threads
            .iter()
            .filter(|(s, t)| s.id != session.id && t.status == ThreadStatus::Open && !t.pending)
            .map(|(s, _)| s.r#ref.clone())
            .next();
        if let Some(other) = elsewhere {
            header.push_str(&format!(". There are open threads in {}; pass ref: \"{other}\"", ref_label(&other)));
        }
    }

    Ok(Resolved {
        binding: Binding {
            repo_path: repo.to_string(),
            session_id: session.id,
            r#ref,
            mode: AgentMode::Resolve,
            agent_name: display_name(&client.client),
            edit_rejected: Arc::new(AtomicBool::new(false)),
            paths: Vec::new(),
        },
        header,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_known_clients_and_keeps_others() {
        assert_eq!(display_name("claude-code"), "Claude Code (terminal)");
        assert_eq!(display_name("codex-mcp-client"), "Codex (terminal)");
        assert_eq!(display_name("zed"), "zed (terminal)");
        assert_eq!(display_name(""), "Agent (terminal)");
    }

    fn thread(session_id: &str, pending: bool) -> crate::core::types::NewThread {
        crate::core::types::NewThread {
            session_id: session_id.into(),
            file_path: "a.rs".into(),
            side: crate::core::types::Side::New,
            start_line: 1,
            end_line: 1,
            body: "fix this".into(),
            severity: None,
            anchor_content: None,
            author_type: None,
            author_name: None,
            pending: Some(pending),
            view_ref: None,
            promoted_from: None,
        }
    }

    #[tokio::test]
    async fn picks_the_view_with_recent_open_threads_and_counts_drafts() {
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().to_string_lossy().into_owned();
        let store = std::sync::Arc::new(crate::core::Store::open_in_memory().unwrap());
        let backend = crate::agents::core_backend::CoreBackend::new(store.clone());
        let branch = store.get_or_create_session(&repo, "main...HEAD").unwrap();
        let work = store.get_or_create_session(&repo, "work").unwrap();
        store.create_thread(&thread(&branch.id, false)).unwrap();
        store.create_thread(&thread(&work.id, true)).unwrap();
        let client = TerminalClient { client: "claude-code".into(), repo: repo.clone() };

        let picked = resolve(&backend, &client, &Value::Null).await.unwrap();
        assert_eq!(picked.binding.r#ref, "main...HEAD");
        assert_eq!(picked.binding.agent_name, "Claude Code (terminal)");
        assert!(picked.header.ends_with("main...HEAD · 1 open thread"), "{}", picked.header);

        let work_view = resolve(&backend, &client, &serde_json::json!({ "ref": "work" })).await.unwrap();
        assert!(work_view.header.contains("Uncommitted changes · 0 open threads · 1 draft not submitted"), "{}", work_view.header);

        let bad = resolve(&backend, &client, &serde_json::json!({ "ref": "--output=/tmp/x" })).await;
        assert!(bad.is_err());
    }

    #[test]
    fn labels_working_tree_views() {
        assert_eq!(ref_label("work"), "Uncommitted changes");
        assert_eq!(ref_label("main...HEAD"), "main...HEAD");
    }
}
