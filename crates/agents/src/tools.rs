use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};

use diffity_core::types::{
    AuthorType, NewThread, Severity, Side, Thread, ThreadStatus, GENERAL_FILE_PATH,
};
use diffity_core::{AppError, Result};

use crate::backend::ReviewBackend;
use crate::patch;
use crate::types::AgentMode;

#[derive(Debug, Clone)]
pub struct Binding {
    pub repo_path: String,
    pub session_id: String,
    pub r#ref: String,
    pub mode: AgentMode,
    pub agent_name: String,
    /// Set when the user rejected a file edit during the current turn; `resolve` is refused while set.
    pub edit_rejected: Arc<AtomicBool>,
}

pub const EDIT_REJECTED: &str = "The user rejected a file edit in this run, so this thread cannot be marked resolved. \
Do not retry the edit and do not call `resolve`. Use `reply` on the thread to explain what you would change \
(and anything you did change) and leave it open for the user to decide.";

pub fn is_mutating(tool: &str) -> bool {
    crate::policy::WRITE_TOOLS.contains(&tool)
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListArgs {
    status: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommentArgs {
    file: String,
    #[serde(alias = "line")]
    start_line: u32,
    end_line: Option<u32>,
    side: Option<String>,
    body: String,
    severity: Option<String>,
}

#[derive(Deserialize)]
struct GeneralArgs {
    body: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ThreadArgs {
    #[serde(alias = "id")]
    thread_id: String,
    body: Option<String>,
    summary: Option<String>,
    reason: Option<String>,
}

fn args<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T> {
    let value = if value.is_null() { json!({}) } else { value };
    serde_json::from_value(value).map_err(|e| AppError::invalid(format!("invalid arguments: {e}")))
}

pub fn parse_severity(raw: Option<&str>) -> Result<Option<Severity>> {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let normalized = raw
        .trim_matches(|c| c == '[' || c == ']')
        .to_ascii_lowercase()
        .replace(['_', ' '], "-");
    match normalized.as_str() {
        "must-fix" | "mustfix" => Ok(Some(Severity::MustFix)),
        "suggestion" => Ok(Some(Severity::Suggestion)),
        "nit" => Ok(Some(Severity::Nit)),
        "question" => Ok(Some(Severity::Question)),
        _ => Err(AppError::invalid(format!(
            "invalid severity `{raw}`; use one of must-fix, suggestion, nit, question"
        ))),
    }
}

fn parse_side(raw: Option<&str>) -> Result<Side> {
    match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        None | Some("") | Some("new") | Some("right") => Ok(Side::New),
        Some("old") | Some("left") => Ok(Side::Old),
        Some(other) => Err(AppError::invalid(format!(
            "invalid side `{other}`; use `new` or `old`"
        ))),
    }
}

fn parse_status(raw: Option<&str>) -> Result<Option<ThreadStatus>> {
    match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        None | Some("") | Some("all") => Ok(None),
        Some("open") => Ok(Some(ThreadStatus::Open)),
        Some("resolved") => Ok(Some(ThreadStatus::Resolved)),
        Some("dismissed") => Ok(Some(ThreadStatus::Dismissed)),
        Some(other) => Err(AppError::invalid(format!("invalid status `{other}`"))),
    }
}

fn thread_json(t: &Thread) -> Value {
    json!({
        "id": t.id,
        "shortId": t.id.chars().take(8).collect::<String>(),
        "filePath": t.file_path,
        "side": t.side,
        "startLine": t.start_line,
        "endLine": t.end_line,
        "status": t.status,
        "severity": t.severity,
        "comments": t.comments.iter().map(|c| json!({
            "authorType": c.author_type,
            "authorName": c.author_name,
            "body": c.body,
            "createdAt": c.created_at,
        })).collect::<Vec<_>>(),
    })
}

/// What agents may see of a thread: pending (draft) threads are hidden and draft replies stripped.
pub fn visible(thread: Thread) -> Option<Thread> {
    if thread.pending {
        return None;
    }
    let comments = thread.comments.into_iter().filter(|c| !c.pending).collect();
    Some(Thread { comments, ..thread })
}

async fn find_thread(backend: &dyn ReviewBackend, session_id: &str, id: &str) -> Result<Thread> {
    let id = id.trim();
    if id.is_empty() {
        return Err(AppError::invalid("threadId is required"));
    }
    let thread = backend.find_thread(session_id, id).await?;
    visible(thread).ok_or_else(|| AppError::not_found(format!("thread '{id}' not found")))
}

fn visible_json(thread: Thread) -> Value {
    match visible(thread) {
        Some(t) => thread_json(&t),
        None => Value::Null,
    }
}

async fn add_comment(backend: &dyn ReviewBackend, b: &Binding, a: CommentArgs) -> Result<Value> {
    let severity = parse_severity(a.severity.as_deref())?;
    let side = parse_side(a.side.as_deref())?;
    let body = a.body.trim();
    if body.is_empty() {
        return Err(AppError::invalid("body is required"));
    }
    let file = a.file.trim().trim_start_matches("./").to_string();
    let diff = backend.diff(&b.repo_path, &b.r#ref).await?;
    let in_diff = diff
        .files
        .iter()
        .any(|f| f.path == file || f.old_path.as_deref() == Some(file.as_str()));
    if !in_diff {
        let listed: Vec<&str> = diff
            .files
            .iter()
            .map(|f| f.path.as_str())
            .take(50)
            .collect();
        return Err(AppError::invalid(format!(
            "file `{file}` is not in the diff for `{}`. Files in the diff: {}",
            b.r#ref,
            listed.join(", ")
        )));
    }
    let start = a.start_line;
    let end = a.end_line.unwrap_or(start).max(start);
    let mut anchor = None;
    if start > 0 {
        let files = patch::parse(&diff.patch);
        let fp = files.iter().find(|f| f.matches(&file));
        anchor = fp.and_then(|f| f.anchor(side, start, end));
        if anchor.is_none() {
            let summary = diff
                .files
                .iter()
                .find(|f| f.path == file || f.old_path.as_deref() == Some(file.as_str()));
            let (path, old_path) = match summary {
                Some(f) => (f.path.clone(), f.old_path.clone()),
                None => (file.clone(), None),
            };
            let count = backend
                .side_line_count(&b.repo_path, &b.r#ref, &path, old_path.as_deref(), side)
                .await?;
            let side_name = if side == Side::Old { "old" } else { "new" };
            let Some(count) = count else {
                return Err(AppError::invalid(format!(
                    "`{file}` does not exist on the {side_name} side of this diff; use side `{}`",
                    if side == Side::Old { "new" } else { "old" }
                )));
            };
            if end > count {
                let ranges: Vec<String> = fp
                    .map(|f| {
                        f.ranges(side)
                            .iter()
                            .map(|(lo, hi)| format!("{lo}-{hi}"))
                            .collect()
                    })
                    .unwrap_or_default();
                return Err(AppError::invalid(format!(
                    "lines {start}-{end} are out of range: `{file}` has {count} lines on the {side_name} side. Changed {side_name}-side ranges: {}",
                    if ranges.is_empty() { "none".to_string() } else { ranges.join(", ") }
                )));
            }
        }
    }
    let thread = backend
        .create_thread(NewThread {
            session_id: b.session_id.clone(),
            file_path: file,
            side,
            start_line: start,
            end_line: if start == 0 { 0 } else { end },
            body: body.to_string(),
            severity,
            anchor_content: anchor,
            author_type: Some(AuthorType::Agent),
            author_name: Some(b.agent_name.clone()),
            pending: None,
        })
        .await?;
    Ok(json!({ "created": thread_json(&thread) }))
}

pub async fn call(
    backend: &dyn ReviewBackend,
    b: &Binding,
    tool: &str,
    raw: Value,
) -> Result<Value> {
    match tool {
        "get_diff" => {
            let diff = backend.diff(&b.repo_path, &b.r#ref).await?;
            let files: Vec<String> = diff
                .files
                .iter()
                .map(|f| {
                    let status = serde_json::to_value(f.status)
                        .ok()
                        .and_then(|v| v.as_str().map(String::from))
                        .unwrap_or_default();
                    format!(
                        "{status} {} (+{} -{}){}",
                        f.path,
                        f.additions,
                        f.deletions,
                        if f.binary { " binary" } else { "" }
                    )
                })
                .collect();
            let patch = if diff.patch.is_empty() {
                "(empty diff)".to_string()
            } else {
                diff.patch
            };
            Ok(Value::String(format!(
                "Diff for `{}` ({} files):\n{}\n\n{}",
                diff.resolved.label,
                files.len(),
                files.join("\n"),
                patch
            )))
        }
        "list_threads" => {
            let a: ListArgs = args(raw)?;
            let status = parse_status(a.status.as_deref())?;
            let threads = backend.list_threads(&b.session_id, status).await?;
            let list: Vec<Value> = threads
                .into_iter()
                .filter_map(visible)
                .map(|t| thread_json(&t))
                .collect();
            Ok(json!({ "threads": list }))
        }
        "add_comment" => add_comment(backend, b, args(raw)?).await,
        "add_general_comment" => {
            let a: GeneralArgs = args(raw)?;
            if a.body.trim().is_empty() {
                return Err(AppError::invalid("body is required"));
            }
            let thread = backend
                .create_thread(NewThread {
                    session_id: b.session_id.clone(),
                    file_path: GENERAL_FILE_PATH.into(),
                    side: Side::New,
                    start_line: 0,
                    end_line: 0,
                    body: a.body.trim().to_string(),
                    severity: None,
                    anchor_content: None,
                    author_type: Some(AuthorType::Agent),
                    author_name: Some(b.agent_name.clone()),
                    pending: None,
                })
                .await?;
            Ok(json!({ "created": thread_json(&thread) }))
        }
        "reply" => {
            let a: ThreadArgs = args(raw)?;
            let body = a.body.as_deref().map(str::trim).unwrap_or("");
            if body.is_empty() {
                return Err(AppError::invalid("body is required"));
            }
            let thread = find_thread(backend, &b.session_id, &a.thread_id).await?;
            let thread = backend
                .add_reply(&thread.id, body, AuthorType::Agent, &b.agent_name)
                .await?;
            Ok(json!({ "thread": visible_json(thread) }))
        }
        "resolve" | "dismiss" => {
            let a: ThreadArgs = args(raw)?;
            let thread = find_thread(backend, &b.session_id, &a.thread_id).await?;
            if tool == "resolve" && b.edit_rejected.load(Ordering::SeqCst) {
                return Err(AppError::new("edit_rejected", EDIT_REJECTED));
            }
            let note = if tool == "resolve" {
                a.summary.or(a.body)
            } else {
                a.reason.or(a.summary).or(a.body)
            };
            let status = if tool == "resolve" {
                ThreadStatus::Resolved
            } else {
                ThreadStatus::Dismissed
            };
            let thread = backend
                .set_thread_status(
                    &thread.id,
                    status,
                    note.as_deref().map(str::trim),
                    &b.agent_name,
                )
                .await?;
            Ok(json!({ "thread": visible_json(thread) }))
        }
        other => Err(AppError::not_found(format!("unknown tool `{other}`"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn severity_parsing() {
        assert_eq!(
            parse_severity(Some("must-fix")).ok().flatten(),
            Some(Severity::MustFix)
        );
        assert_eq!(
            parse_severity(Some("[Must_Fix]")).ok().flatten(),
            Some(Severity::MustFix)
        );
        assert_eq!(
            parse_severity(Some("nit")).ok().flatten(),
            Some(Severity::Nit)
        );
        assert_eq!(parse_severity(None).ok().flatten(), None);
        assert!(parse_severity(Some("blocker")).is_err());
    }

    #[test]
    fn side_parsing() {
        assert_eq!(parse_side(None).ok(), Some(Side::New));
        assert_eq!(parse_side(Some("old")).ok(), Some(Side::Old));
        assert!(parse_side(Some("middle")).is_err());
    }

    fn setup() -> (std::sync::Arc<diffity_core::Store>, crate::core_backend::CoreBackend, Binding) {
        let store = std::sync::Arc::new(diffity_core::Store::open_in_memory().unwrap());
        let session = store.get_or_create_session("/repo", "work").unwrap();
        let backend = crate::core_backend::CoreBackend::new(store.clone());
        let binding = Binding {
            repo_path: "/repo".into(),
            session_id: session.id,
            r#ref: "work".into(),
            mode: AgentMode::Resolve,
            agent_name: "Claude Code".into(),
            edit_rejected: Default::default(),
        };
        (store, backend, binding)
    }

    fn thread_input(session_id: &str, body: &str, pending: bool) -> NewThread {
        NewThread {
            session_id: session_id.into(),
            file_path: "a.rs".into(),
            side: Side::New,
            start_line: 1,
            end_line: 1,
            body: body.into(),
            severity: None,
            anchor_content: None,
            author_type: None,
            author_name: None,
            pending: Some(pending),
        }
    }

    #[tokio::test]
    async fn agents_never_see_pending_comments() {
        let (store, backend, b) = setup();
        let published = store.create_thread(&thread_input(&b.session_id, "published", false)).unwrap();
        let draft = store.create_thread(&thread_input(&b.session_id, "draft", true)).unwrap();
        store
            .add_reply_with(&published.id, "draft reply", AuthorType::User, None, true)
            .unwrap();

        let listed = call(&backend, &b, "list_threads", Value::Null).await.unwrap();
        let threads = listed["threads"].as_array().unwrap();
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0]["id"], published.id);
        assert_eq!(threads[0]["comments"].as_array().unwrap().len(), 1);

        let err = call(&backend, &b, "reply", json!({ "threadId": draft.id, "body": "hi" }))
            .await
            .unwrap_err();
        assert_eq!(err.code, "not_found");

        let replied = call(&backend, &b, "reply", json!({ "threadId": published.id, "body": "answer" }))
            .await
            .unwrap();
        let comments = replied["thread"]["comments"].as_array().unwrap();
        assert_eq!(comments.len(), 2);
        assert_eq!(comments[1]["authorName"], "Claude Code");

        let stored = store.get_thread(&published.id).unwrap();
        assert_eq!(stored.comments.len(), 3);
        assert!(stored.comments[1].pending);
        assert!(!stored.comments[2].pending);
        assert_eq!(store.get_pending_review(&b.session_id).unwrap().unwrap().pending_count, 2);
    }

    #[tokio::test]
    async fn user_mention_reply_reopens_resolved_thread() {
        let (store, backend, b) = setup();
        let t = store.create_thread(&thread_input(&b.session_id, "rename this", false)).unwrap();
        call(&backend, &b, "resolve", json!({ "threadId": t.id, "summary": "Fixed" }))
            .await
            .unwrap();
        assert_eq!(store.get_thread(&t.id).unwrap().status, ThreadStatus::Resolved);
        let t = store
            .add_reply(&t.id, "@claude not quite, use snake_case", AuthorType::User, None)
            .unwrap();
        assert_eq!(t.status, ThreadStatus::Open);
        assert!(t.comments.last().unwrap().mentions_agent);
    }

    #[tokio::test]
    async fn resolve_is_refused_after_a_rejected_edit() {
        let (store, backend, b) = setup();
        let t = store.create_thread(&thread_input(&b.session_id, "rename this", false)).unwrap();
        b.edit_rejected.store(true, Ordering::SeqCst);
        let err = call(&backend, &b, "resolve", json!({ "threadId": t.id, "summary": "Fixed: renamed" }))
            .await
            .unwrap_err();
        assert_eq!(err.code, "edit_rejected");
        assert_eq!(store.get_thread(&t.id).unwrap().status, ThreadStatus::Open);
        call(&backend, &b, "reply", json!({ "threadId": t.id, "body": "I would rename it to foo" }))
            .await
            .unwrap();
        b.edit_rejected.store(false, Ordering::SeqCst);
        call(&backend, &b, "resolve", json!({ "threadId": t.id })).await.unwrap();
        assert_eq!(store.get_thread(&t.id).unwrap().status, ThreadStatus::Resolved);
    }
}
