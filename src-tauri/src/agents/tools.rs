use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::core::scan::Importer;
use crate::core::store::now;
use crate::core::types::{
    AuthorType, DiffResult, Guide, GuideAttention, GuideChapter, GuideContent, GuideFlowStep, GuideImpact, GuideNote,
    NewThread, Severity, Side,
    Thread, ThreadStatus, GENERAL_FILE_PATH,
};
use crate::core::{AppError, Result};

use crate::agents::backend::ReviewBackend;
use crate::agents::patch;
use crate::agents::types::AgentMode;

#[derive(Debug, Clone)]
pub struct Binding {
    pub repo_path: String,
    pub session_id: String,
    pub r#ref: String,
    pub mode: AgentMode,
    pub agent_name: String,
    /// Set when the user rejected a file edit during the current turn; `resolve` is refused while set.
    pub edit_rejected: Arc<AtomicBool>,
    /// When non-empty, `get_diff` returns only these files and comments elsewhere are rejected.
    pub paths: Vec<String>,
}

/// Keeps the per-file sections of a unified diff whose path is in `paths`.
pub fn filter_patch(patch: &str, paths: &[String]) -> String {
    let mut out = String::new();
    let mut keep = false;
    for section in patch.split_inclusive('\n') {
        if let Some(header) = section.strip_prefix("diff --git ") {
            keep = paths.iter().any(|p| {
                header.contains(&format!("a/{p} ")) || header.trim_end().ends_with(&format!("b/{p}"))
            });
        }
        if keep {
            out.push_str(section);
        }
    }
    out
}

fn in_scope(b: &Binding, file: &str) -> bool {
    b.paths.is_empty() || b.paths.iter().any(|p| p == file)
}

pub const EDIT_REJECTED: &str = "The user rejected a file edit in this run, so this thread cannot be marked resolved. \
Do not retry the edit and do not call `resolve`. Use `reply` on the thread to explain what you would change \
(and anything you did change) and leave it open for the user to decide.";

pub fn is_mutating(tool: &str) -> bool {
    crate::agents::policy::WRITE_TOOLS.contains(&tool)
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuideNoteArgs {
    path: String,
    line: Option<u32>,
    side: Option<String>,
    text: String,
    #[serde(default)]
    critical: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuideChapterArgs {
    title: String,
    summary: String,
    #[serde(default)]
    points: Vec<String>,
    #[serde(default)]
    focus: Vec<String>,
    attention: Option<String>,
    phase: Option<String>,
    files: Vec<String>,
    #[serde(default)]
    notes: Vec<GuideNoteArgs>,
    #[serde(default)]
    impact: Vec<GuideImpactArgs>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuideImpactArgs {
    site: String,
    path: String,
    line: Option<u32>,
    text: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DiffArgs {
    /// Only the file list, with each file's hunk context, instead of the patch.
    #[serde(default)]
    summary: bool,
    /// Only the patch of these files.
    #[serde(default)]
    files: Vec<String>,
}

/// Lockfiles and build output: listed, but their patch is left out of the manifest's reading list.
pub fn is_generated(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    const LOCKFILES: &[&str] = &[
        "pnpm-lock.yaml", "yarn.lock", "package-lock.json", "Cargo.lock", "go.sum", "composer.lock", "Gemfile.lock",
        "poetry.lock", "bun.lockb", "flake.lock",
    ];
    LOCKFILES.contains(&name)
        || name.ends_with(".lock")
        || name.contains(".generated.")
        || name.ends_with(".min.js")
        || name.ends_with(".map")
        || name.ends_with(".snap")
        || path.split('/').any(|dir| dir == "dist" || dir == "__snapshots__")
}

/// The text after the second `@@` of each hunk header in a file's section, up to three distinct ones.
fn hunk_contexts(section: &str) -> Vec<String> {
    let mut contexts: Vec<String> = Vec::new();
    for line in section.lines().filter(|l| l.starts_with("@@ ")) {
        let context = line.splitn(3, "@@").nth(2).map(str::trim).unwrap_or_default();
        if !context.is_empty() && !contexts.iter().any(|c| c == context) {
            contexts.push(context.to_string());
            if contexts.len() == 3 {
                break;
            }
        }
    }
    contexts
}

/// The changed files grouped by folder, each with its status, size and the functions its hunks are in.
fn manifest(diff: &DiffResult, paths: &[String]) -> String {
    let mut out = String::new();
    let mut current_dir = None;
    let mut files: Vec<_> = diff.files.iter().filter(|f| paths.is_empty() || paths.contains(&f.path)).collect();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    for f in files {
        let (dir, name) = match f.path.rsplit_once('/') {
            Some((dir, name)) => (format!("{dir}/"), name),
            None => (String::new(), f.path.as_str()),
        };
        if current_dir.as_deref() != Some(dir.as_str()) {
            if !dir.is_empty() {
                out.push_str(&dir);
                out.push('\n');
            }
            current_dir = Some(dir.clone());
        }
        let status = serde_json::to_value(f.status)
            .ok()
            .and_then(|v| v.as_str().map(String::from))
            .unwrap_or_default();
        let renamed = f.old_path.as_deref().map(|p| format!(" (from {p})")).unwrap_or_default();
        let tag = if is_generated(&f.path) {
            "  [generated]".to_string()
        } else if f.binary {
            "  [binary]".to_string()
        } else {
            let contexts = hunk_contexts(&filter_patch(&diff.patch, std::slice::from_ref(&f.path)));
            if contexts.is_empty() {
                String::new()
            } else {
                format!("  {}", contexts.iter().map(|c| format!("@@ {c}")).collect::<Vec<_>>().join(" / "))
            }
        };
        let indent = if dir.is_empty() { "" } else { "  " };
        out.push_str(&format!("{indent}{name}{renamed}  {status}  +{}/-{}{tag}\n", f.additions, f.deletions));
    }
    out
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuideArgs {
    summary: String,
    before: Option<String>,
    after: Option<String>,
    diagram: Option<String>,
    #[serde(default)]
    flow: Vec<GuideFlowArgs>,
    chapters: Vec<GuideChapterArgs>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GuideFlowArgs {
    node: String,
    text: String,
}

/// Title of the chapter that collects the diff's files the agent left out of its guide.
pub const LEFTOVER_CHAPTER: &str = "Everything else";

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
        "addressedBy": t.addressed_by,
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

/// A GitHub-style suggested change: a fenced block whose info string is `suggestion`.
fn has_suggestion(body: &str) -> bool {
    body.lines().any(|line| line.trim_start().strip_prefix("```").is_some_and(|info| info.trim() == "suggestion"))
}

async fn add_comment(backend: &dyn ReviewBackend, b: &Binding, a: CommentArgs) -> Result<Value> {
    let severity = parse_severity(a.severity.as_deref())?;
    let side = parse_side(a.side.as_deref())?;
    let body = a.body.trim();
    if body.is_empty() {
        return Err(AppError::invalid("body is required"));
    }
    if side == Side::Old && has_suggestion(body) {
        return Err(AppError::invalid(
            "a ```suggestion block replaces new-side lines; put it on `side: \"new\"` lines, or describe the fix in words",
        ));
    }
    let file = a.file.trim().trim_start_matches("./").to_string();
    if !in_scope(b, &file) {
        return Err(AppError::invalid(format!(
            "`{file}` is outside the files the user asked you to review ({}); comment only on those",
            b.paths.join(", ")
        )));
    }
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
            view_ref: Some(b.r#ref.clone()),
            promoted_from: None,
        })
        .await?;
    Ok(json!({ "created": thread_json(&thread) }))
}

fn parse_attention(raw: Option<&str>) -> Result<GuideAttention> {
    match raw.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        None | Some("") | Some("normal") => Ok(GuideAttention::Normal),
        Some("high") => Ok(GuideAttention::High),
        Some("low") => Ok(GuideAttention::Low),
        Some(other) => Err(AppError::invalid(format!(
            "invalid attention `{other}`; use high, normal or low"
        ))),
    }
}

fn non_empty(text: Option<String>) -> Option<String> {
    text.map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

fn bullets(items: Vec<String>) -> Vec<String> {
    items.into_iter().map(|item| item.trim().to_string()).filter(|item| !item.is_empty()).collect()
}

/// Word limits for the guide. A reviewer skims it, so text over a limit goes back to the agent to be cut.
const SUMMARY_WORDS: usize = 50;
const BEFORE_AFTER_WORDS: usize = 30;
const TITLE_WORDS: usize = 6;
const CHAPTER_SUMMARY_WORDS: usize = 40;
const BULLET_WORDS: usize = 20;
const MAX_BULLETS: usize = 3;
const NOTE_WORDS: usize = 40;
const PHASE_WORDS: usize = 4;
const MAX_FLOW_STEPS: usize = 10;
const FLOW_WORDS: usize = 25;
const MAX_IMPACT: usize = 8;
const IMPACT_WORDS: usize = 25;

fn check_words(problems: &mut Vec<String>, what: &str, text: &str, max: usize) {
    let words = text.split_whitespace().count();
    if words > max {
        problems.push(format!("{what} is {words} words (max {max})"));
    }
}

fn check_bullets(problems: &mut Vec<String>, what: &str, items: &[String]) {
    if items.len() > MAX_BULLETS {
        problems.push(format!("{what} has {} items (max {MAX_BULLETS})", items.len()));
    }
    for (i, item) in items.iter().enumerate() {
        check_words(problems, &format!("{what} item {}", i + 1), item, BULLET_WORDS);
    }
}

/// Largest patch handed to a guide run up front; a bigger one is read through `get_diff` as needed.
pub const GUIDE_INLINE_LIMIT: usize = 150_000;

/// The file list and the patch (generated files left out) as a prompt section, when the patch is small enough
/// that sending it saves the agent its `get_diff` calls.
pub fn guide_inline_diff(diff: &DiffResult) -> Option<String> {
    let readable: Vec<String> = diff
        .files
        .iter()
        .filter(|f| !f.binary && !is_generated(&f.path))
        .map(|f| f.path.clone())
        .collect();
    let patch = filter_patch(&diff.patch, &readable);
    if patch.len() > GUIDE_INLINE_LIMIT {
        return None;
    }
    let fence = if patch.contains("```") { "````" } else { "```" };
    Some(format!(
        "\n## The diff\n\nEvery changed file, then the whole patch ({} files; generated and binary files are listed but their patch is left out). \
         You do not need to call `get_diff`.\n\n{}\n{fence}diff\n{}{fence}\n",
        diff.files.len(),
        manifest(diff, &[]),
        patch
    ))
}

const GUIDE_IMPORTERS_LIMIT: usize = 60;

/// Files outside the diff that import changed files, as a prompt section that gives the impact search a start.
pub fn guide_importers(importers: &[Importer]) -> Option<String> {
    if importers.is_empty() {
        return None;
    }
    let mut lines: Vec<String> = importers
        .iter()
        .take(GUIDE_IMPORTERS_LIMIT)
        .map(|i| format!("- `{}` imports {}", i.path, i.imports.iter().map(|p| format!("`{p}`")).collect::<Vec<_>>().join(", ")))
        .collect();
    if importers.len() > GUIDE_IMPORTERS_LIMIT {
        lines.push(format!("- and {} more", importers.len() - GUIDE_IMPORTERS_LIMIT));
    }
    Some(format!(
        "\n## Code outside the diff that imports changed files\n\n\
         A scan of the repository's JS/TS imports found these. Start the impact search here and check what the change \
         does to each one; most will be unaffected. The scan follows imports only, so callers in other languages and \
         consumers of changed endpoints still need a search.\n\n{}\n",
        lines.join("\n")
    ))
}

/// Checks a guide against the diff: every listed file must be in it, each file is kept in its first chapter only,
/// and files the agent left out go to a last, low-attention chapter. Returns the guide and the files added there.
fn build_guide(a: GuideArgs, diff: &DiffResult) -> Result<(GuideContent, Vec<String>)> {
    let patches = patch::parse(&diff.patch);
    let summary = a.summary.trim().to_string();
    if summary.is_empty() {
        return Err(AppError::invalid("summary is required"));
    }
    if a.chapters.is_empty() {
        return Err(AppError::invalid("add at least one chapter"));
    }
    let resolve = |raw: &str| -> Option<String> {
        let file = raw.trim().trim_start_matches("./");
        diff.files
            .iter()
            .find(|f| f.path == file || f.old_path.as_deref() == Some(file))
            .map(|f| f.path.clone())
    };
    let before = non_empty(a.before);
    let after = non_empty(a.after);
    let mut problems = Vec::new();
    check_words(&mut problems, "summary", &summary, SUMMARY_WORDS);
    if let Some(text) = &before {
        check_words(&mut problems, "before", text, BEFORE_AFTER_WORDS);
    }
    if let Some(text) = &after {
        check_words(&mut problems, "after", text, BEFORE_AFTER_WORDS);
    }
    let mut seen = std::collections::HashSet::new();
    let mut unknown = Vec::new();
    let mut chapters = Vec::new();
    let mut ended_phases: Vec<String> = Vec::new();
    for chapter in a.chapters {
        let title = chapter.title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::invalid("every chapter needs a title"));
        }
        let summary = chapter.summary.trim().to_string();
        let points = bullets(chapter.points);
        let focus = bullets(chapter.focus);
        check_words(&mut problems, &format!("chapter \"{title}\" title"), &title, TITLE_WORDS);
        check_words(&mut problems, &format!("chapter \"{title}\" summary"), &summary, CHAPTER_SUMMARY_WORDS);
        check_bullets(&mut problems, &format!("chapter \"{title}\" points"), &points);
        check_bullets(&mut problems, &format!("chapter \"{title}\" focus"), &focus);
        let mut files = Vec::new();
        for raw in &chapter.files {
            match resolve(raw) {
                Some(path) => {
                    if seen.insert(path.clone()) {
                        files.push(path);
                    }
                }
                None => unknown.push(raw.trim().to_string()),
            }
        }
        if files.is_empty() {
            continue;
        }
        let mut notes = Vec::new();
        for note in chapter.notes {
            let text = note.text.trim().to_string();
            if text.is_empty() {
                continue;
            }
            let Some(path) = resolve(&note.path).filter(|p| files.contains(p)) else {
                return Err(AppError::invalid(format!(
                    "the note on `{}` in chapter \"{title}\" must be on one of that chapter's files: {}",
                    note.path.trim(),
                    files.join(", ")
                )));
            };
            check_words(&mut problems, &format!("the note on `{path}`"), &text, NOTE_WORDS);
            let side = parse_side(note.side.as_deref())?;
            // A line the diff does not show cannot carry the note, so it stays on the file.
            let line = note.line.filter(|&line| {
                line > 0 && patches.iter().find(|f| f.matches(&path)).and_then(|f| f.anchor(side, line, line)).is_some()
            });
            notes.push(GuideNote { path, line, side, text, critical: note.critical });
        }
        let impact = build_impact(chapter.impact, &title, &resolve, &mut problems);
        let phase = non_empty(chapter.phase);
        if let Some(name) = &phase {
            check_words(&mut problems, &format!("chapter \"{title}\" phase"), name, PHASE_WORDS);
        }
        let current: Option<&GuideChapter> = chapters.last();
        if let Some(previous) = current.and_then(|c| c.phase.as_ref()).filter(|p| phase.as_ref() != Some(*p)) {
            ended_phases.push(previous.clone());
        }
        if let Some(name) = phase.as_ref().filter(|name| ended_phases.contains(name)) {
            return Err(AppError::invalid(format!(
                "the chapters of phase \"{name}\" must be next to each other; move chapter \"{title}\" up to the others"
            )));
        }
        chapters.push(GuideChapter {
            title,
            summary,
            points,
            focus,
            attention: parse_attention(chapter.attention.as_deref())?,
            phase,
            files,
            notes,
            impact,
        });
    }
    if !unknown.is_empty() {
        let listed: Vec<&str> = diff.files.iter().map(|f| f.path.as_str()).take(80).collect();
        return Err(AppError::invalid(format!(
            "these files are not in the diff: {}. Use paths exactly as `get_diff` lists them: {}",
            unknown.join(", "),
            listed.join(", ")
        )));
    }
    if chapters.is_empty() {
        return Err(AppError::invalid("every chapter must list at least one file from the diff"));
    }
    if !problems.is_empty() {
        return Err(AppError::invalid(format!(
            "too long for a reviewer to skim. Cut these, keeping the why, and call set_guide again with the whole guide: {}",
            problems.join("; ")
        )));
    }
    let leftover: Vec<String> = diff
        .files
        .iter()
        .map(|f| f.path.clone())
        .filter(|path| !seen.contains(path))
        .collect();
    if !leftover.is_empty() {
        chapters.push(GuideChapter {
            title: LEFTOVER_CHAPTER.to_string(),
            summary: "Files the guide does not walk through.".to_string(),
            points: Vec::new(),
            focus: Vec::new(),
            attention: GuideAttention::Low,
            phase: None,
            files: leftover.clone(),
            notes: Vec::new(),
            impact: Vec::new(),
        });
    }
    let diagram = non_empty(a.diagram);
    let flow = build_flow(a.flow, diagram.as_deref(), &mut problems)?;
    if !problems.is_empty() {
        return Err(AppError::invalid(format!(
            "too long for a reviewer to skim. Cut these, keeping the why, and call set_guide again with the whole guide: {}",
            problems.join("; ")
        )));
    }
    Ok((
        GuideContent {
            summary,
            before,
            after,
            diagram,
            flow,
            chapters,
        },
        leftover,
    ))
}

/// The diagram's walkthrough: every step names a node the diagram draws.
fn build_flow(steps: Vec<GuideFlowArgs>, diagram: Option<&str>, problems: &mut Vec<String>) -> Result<Vec<GuideFlowStep>> {
    let steps: Vec<GuideFlowArgs> = steps.into_iter().filter(|step| !step.node.trim().is_empty()).collect();
    if steps.is_empty() {
        return Ok(Vec::new());
    }
    let Some(diagram) = diagram else {
        return Err(AppError::invalid("flow steps through the diagram, so add a diagram or leave flow out"));
    };
    if steps.len() > MAX_FLOW_STEPS {
        problems.push(format!("flow has {} steps (max {MAX_FLOW_STEPS}); keep the main path", steps.len()));
    }
    let tokens: std::collections::HashSet<&str> =
        diagram.split(|c: char| !(c.is_alphanumeric() || c == '_' || c == '-')).filter(|t| !t.is_empty()).collect();
    let mut flow = Vec::new();
    for step in steps {
        let node = step.node.trim().to_string();
        if !tokens.contains(node.as_str()) {
            return Err(AppError::invalid(format!(
                "flow step `{node}` is not a node of the diagram; use the node ids as written in it, e.g. `A` for `A[Load]`"
            )));
        }
        let text = step.text.trim().to_string();
        check_words(problems, &format!("flow step `{node}` text"), &text, FLOW_WORDS);
        flow.push(GuideFlowStep { node, text });
    }
    Ok(flow)
}

/// Code the chapter's change reaches outside the diff. Items in files of the diff are dropped: the reviewer reads
/// those anyway.
fn build_impact(
    items: Vec<GuideImpactArgs>,
    title: &str,
    resolve: &dyn Fn(&str) -> Option<String>,
    problems: &mut Vec<String>,
) -> Vec<GuideImpact> {
    let items: Vec<GuideImpactArgs> = items
        .into_iter()
        .filter(|item| !item.site.trim().is_empty() && !item.path.trim().is_empty() && resolve(&item.path).is_none())
        .collect();
    if items.len() > MAX_IMPACT {
        problems.push(format!("chapter \"{title}\" impact has {} items (max {MAX_IMPACT}); keep the ones most likely to break", items.len()));
    }
    items
        .into_iter()
        .map(|item| {
            let site = item.site.trim().to_string();
            let text = item.text.trim().to_string();
            check_words(problems, &format!("chapter \"{title}\" impact `{site}`"), &text, IMPACT_WORDS);
            let path = item.path.trim().trim_start_matches("./").to_string();
            GuideImpact { site, path, line: item.line.filter(|&line| line > 0), text }
        })
        .collect()
}

async fn set_guide(backend: &dyn ReviewBackend, b: &Binding, a: GuideArgs) -> Result<Value> {
    let diff = backend.diff(&b.repo_path, &b.r#ref).await?;
    let (content, leftover) = build_guide(a, &diff)?;
    let chapters = content.chapters.len();
    backend
        .save_guide(Guide {
            session_id: b.session_id.clone(),
            r#ref: b.r#ref.clone(),
            fingerprint: diff.fingerprint,
            agent_name: b.agent_name.clone(),
            created_at: now(),
            content,
        })
        .await?;
    Ok(json!({ "saved": true, "chapters": chapters, "filesAddedToEverythingElse": leftover }))
}

pub async fn call(
    backend: &dyn ReviewBackend,
    b: &Binding,
    tool: &str,
    raw: Value,
) -> Result<Value> {
    match tool {
        "get_diff" => {
            let a: DiffArgs = args(raw)?;
            let diff = backend.diff(&b.repo_path, &b.r#ref).await?;
            if a.summary {
                let total = diff.files.iter().filter(|f| in_scope(b, &f.path)).count();
                return Ok(Value::String(format!(
                    "Changed files for `{}` ({total} files). Status, +added/-removed, and the code each change is in (from the hunk headers). \
                     Call get_diff with `files` to read the patches you need.\n\n{}",
                    diff.resolved.label,
                    manifest(&diff, &b.paths)
                )));
            }
            let requested: Vec<String> = a.files.iter().map(|f| f.trim().trim_start_matches("./").to_string()).filter(|f| !f.is_empty()).collect();
            let diff = if requested.is_empty() {
                diff
            } else {
                let unknown: Vec<&String> = requested.iter().filter(|p| !diff.files.iter().any(|f| &f.path == *p || f.old_path.as_ref() == Some(*p))).collect();
                if !unknown.is_empty() {
                    return Err(AppError::invalid(format!(
                        "not in the diff: {}. Call get_diff with summary: true for the file list",
                        unknown.iter().map(|p| p.as_str()).collect::<Vec<_>>().join(", ")
                    )));
                }
                let files: Vec<_> = diff.files.iter().filter(|f| requested.iter().any(|p| p == &f.path || f.old_path.as_ref() == Some(p))).cloned().collect();
                let paths: Vec<String> = files.iter().map(|f| f.path.clone()).collect();
                DiffResult { patch: filter_patch(&diff.patch, &paths), files, ..diff }
            };
            let files: Vec<String> = diff
                .files
                .iter()
                .filter(|f| in_scope(b, &f.path))
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
            let patch = if b.paths.is_empty() {
                diff.patch
            } else {
                filter_patch(&diff.patch, &b.paths)
            };
            let patch = if patch.is_empty() {
                "(empty diff)".to_string()
            } else {
                patch
            };
            let scope_note = if b.paths.is_empty() {
                String::new()
            } else {
                " — limited to the files the user selected".to_string()
            };
            Ok(Value::String(format!(
                "Diff for `{}`{} ({} files):\n{}\n\n{}",
                diff.resolved.label,
                scope_note,
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
        "set_guide" => set_guide(backend, b, args(raw)?).await,
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
                    view_ref: Some(b.r#ref.clone()),
                    promoted_from: None,
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
            // The reviewer resolves their own threads: the agent's resolve marks them addressed and leaves them open.
            let reviewer_thread = thread.comments.first().is_some_and(|c| c.author_type != AuthorType::Agent);
            if tool == "resolve" && reviewer_thread {
                let thread = backend
                    .mark_addressed(&thread.id, note.as_deref().map(str::trim), &b.agent_name)
                    .await?;
                return Ok(json!({
                    "thread": visible_json(thread),
                    "note": "Marked as addressed. It stays open until the reviewer checks it and resolves it.",
                }));
            }
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
    fn filter_patch_keeps_only_selected_files() {
        let patch = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-p\n+q\n";
        let kept = filter_patch(patch, &["src/b.ts".to_string()]);
        assert!(kept.starts_with("diff --git a/src/b.ts b/src/b.ts"));
        assert!(kept.contains("+q"));
        assert!(!kept.contains("src/a.ts"));
        assert_eq!(filter_patch(patch, &["src/c.ts".to_string()]), "");
    }

    #[tokio::test]
    async fn add_comment_rejects_suggestions_on_removed_lines() {
        let (_store, backend, binding) = setup();
        let body = "Use a constant.\n```suggestion\nconst x = 1;\n```";
        let err = call(&backend, &binding, "add_comment", json!({ "file": "src/app.ts", "startLine": 1, "side": "old", "body": body }))
            .await
            .unwrap_err();
        assert!(err.message.contains("suggestion"), "{}", err.message);
        assert!(has_suggestion(body));
        assert!(!has_suggestion("```ts\nconst x = 1;\n```"));
    }

    #[tokio::test]
    async fn add_comment_rejects_files_outside_the_scope() {
        let (_store, backend, mut binding) = setup();
        binding.paths = vec!["src/app.ts".into()];
        let err = call(
            &backend,
            &binding,
            "add_comment",
            json!({ "file": "src/other.ts", "startLine": 1, "body": "x" }),
        )
        .await
        .unwrap_err();
        assert!(err.message.contains("outside the files"), "{}", err.message);
    }

    fn diff_with(paths: &[&str]) -> DiffResult {
        let files: Vec<crate::core::types::DiffFileSummary> = paths
            .iter()
            .map(|p| {
                serde_json::from_value::<crate::core::types::DiffFileSummary>(json!({
                    "path": p, "oldPath": null, "status": "modified", "additions": 1, "deletions": 0, "binary": false
                }))
                .unwrap()
            })
            .collect();
        serde_json::from_value(json!({
            "patch": "",
            "files": files,
            "fingerprint": "fp",
            "resolved": { "ref": "work", "label": "Uncommitted changes", "canRevert": false }
        }))
        .unwrap_or_else(|e| panic!("fixture: {e}"))
    }

    fn chapter(title: &str, files: &[&str]) -> GuideChapterArgs {
        GuideChapterArgs {
            title: title.into(),
            summary: "s".into(),
            points: Vec::new(),
            focus: vec![" ".into(), "Check x".into()],
            attention: None,
            phase: None,
            files: files.iter().map(|f| f.to_string()).collect(),
            notes: Vec::new(),
            impact: Vec::new(),
        }
    }

    fn note(path: &str, line: Option<u32>) -> GuideNoteArgs {
        GuideNoteArgs { path: path.into(), line, side: None, text: format!("about {path}"), critical: line.is_some() }
    }

    const PATCH: &str = "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@ export function load()\n x\n+y\n z\n";

    fn one_chapter(chapter: GuideChapterArgs) -> GuideArgs {
        GuideArgs { summary: "x".into(), before: None, after: None, diagram: None, flow: Vec::new(), chapters: vec![chapter] }
    }

    #[test]
    fn guide_importers_lists_each_file_and_caps_the_list() {
        assert_eq!(guide_importers(&[]), None);
        let one = vec![Importer { path: "src/a.ts".into(), imports: vec!["src/b.ts".into(), "src/c.ts".into()] }];
        assert!(guide_importers(&one).unwrap().contains("- `src/a.ts` imports `src/b.ts`, `src/c.ts`"));
        let many: Vec<Importer> = (0..65).map(|i| Importer { path: format!("src/f{i}.ts"), imports: vec!["src/b.ts".into()] }).collect();
        assert!(guide_importers(&many).unwrap().ends_with("- and 5 more\n"));
    }

    #[test]
    fn guide_impact_keeps_only_code_outside_the_diff() {
        let mut diff = diff_with(&["src/a.ts"]);
        diff.patch = PATCH.into();
        let mut core = chapter("Core", &["src/a.ts"]);
        core.impact = vec![
            GuideImpactArgs { site: "boot()".into(), path: "./src/main.ts".into(), line: Some(12), text: "Reads `ttl`, now gone.".into() },
            GuideImpactArgs { site: "load()".into(), path: "src/a.ts".into(), line: Some(2), text: "Calls it.".into() },
        ];
        let (guide, _) = build_guide(one_chapter(core), &diff).unwrap();
        let impact = &guide.chapters[0].impact;
        assert_eq!(impact.len(), 1, "code in the diff is read anyway");
        assert_eq!((impact[0].path.as_str(), impact[0].line), ("src/main.ts", Some(12)));
    }

    #[test]
    fn guide_without_new_views_reads_as_before() {
        let stored = json!({ "summary": "x", "chapters": [{ "title": "Core", "summary": "s", "files": ["src/a.ts"], "sequence": "sequenceDiagram", "shapes": [{ "name": "X", "fields": [] }] }] });
        let content: GuideContent = serde_json::from_value(stored.clone()).unwrap();
        assert!(content.chapters[0].impact.is_empty());
        let written = serde_json::to_value(&content).unwrap();
        assert!(written["chapters"][0].get("impact").is_none());
    }

    #[test]
    fn guide_phases_must_be_contiguous() {
        let diff = diff_with(&["src/a.ts", "src/b.ts", "src/c.ts"]);
        let phased = |title: &str, file: &str, phase: Option<&str>| {
            let mut c = chapter(title, &[file]);
            c.phase = phase.map(String::from);
            c
        };
        let guide = |chapters| GuideArgs { summary: "x".into(), before: None, after: None, diagram: None, flow: Vec::new(), chapters };
        let (ok, _) = build_guide(
            guide(vec![phased("A", "src/a.ts", Some("Data")), phased("B", "src/b.ts", Some(" Data ")), phased("C", "src/c.ts", Some("UI"))]),
            &diff,
        )
        .unwrap();
        assert_eq!(ok.chapters[1].phase.as_deref(), Some("Data"));

        let err = build_guide(
            guide(vec![phased("A", "src/a.ts", Some("Data")), phased("B", "src/b.ts", Some("UI")), phased("C", "src/c.ts", Some("Data"))]),
            &diff,
        )
        .unwrap_err();
        assert!(err.message.contains("next to each other"), "{}", err.message);
    }

    #[test]
    fn guide_flow_steps_name_diagram_nodes() {
        let diff = diff_with(&["src/a.ts"]);
        let step = |node: &str| GuideFlowArgs { node: node.into(), text: format!("{node} runs") };
        let args = |diagram: Option<&str>, flow| GuideArgs {
            summary: "x".into(),
            before: None,
            after: None,
            diagram: diagram.map(String::from),
            flow,
            chapters: vec![chapter("Core", &["src/a.ts"])],
        };
        let chart = "flowchart LR\n  ui[Click] --> load_file(Load):::added\n  load_file --> db[(DB)]";
        let (guide, _) = build_guide(args(Some(chart), vec![step("ui"), step("load_file"), step(" ")]), &diff).unwrap();
        let nodes: Vec<&str> = guide.flow.iter().map(|s| s.node.as_str()).collect();
        assert_eq!(nodes, vec!["ui", "load_file"]);

        let err = build_guide(args(Some(chart), vec![step("cache")]), &diff).unwrap_err();
        assert!(err.message.contains("`cache`"), "{}", err.message);
        let err = build_guide(args(None, vec![step("ui")]), &diff).unwrap_err();
        assert!(err.message.contains("add a diagram"), "{}", err.message);
    }

    #[test]
    fn guide_notes_keep_lines_the_diff_shows_and_fall_back_to_the_file() {
        let mut diff = diff_with(&["src/a.ts", "src/b.ts"]);
        diff.patch = PATCH.into();
        let mut core = chapter("Core", &["src/a.ts"]);
        core.notes = vec![note("src/a.ts", Some(2)), note("src/a.ts", Some(40)), note("src/a.ts", None)];
        let (guide, _) = build_guide(
            GuideArgs { summary: "x".into(), before: None, after: None, diagram: None, flow: Vec::new(), chapters: vec![core] },
            &diff,
        )
        .unwrap();
        let lines: Vec<Option<u32>> = guide.chapters[0].notes.iter().map(|n| n.line).collect();
        assert_eq!(lines, vec![Some(2), None, None]);
        assert!(guide.chapters[0].notes[0].critical);

        let mut wrong = chapter("Core", &["src/a.ts"]);
        wrong.notes = vec![note("src/b.ts", None)];
        let err = build_guide(
            GuideArgs { summary: "x".into(), before: None, after: None, diagram: None, flow: Vec::new(), chapters: vec![wrong] },
            &diff,
        )
        .unwrap_err();
        assert!(err.message.contains("that chapter's files"), "{}", err.message);
    }

    #[test]
    fn small_diffs_go_into_the_guide_prompt_without_generated_patches() {
        let mut diff = diff_with(&["src/a.ts", "pnpm-lock.yaml"]);
        diff.patch = format!("{PATCH}diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n@@ -1 +1 @@\n-a\n+lockfile-body\n");
        let section = guide_inline_diff(&diff).unwrap();
        assert!(section.contains("@@ export function load()"), "{section}");
        assert!(section.contains("+y"));
        assert!(!section.contains("lockfile-body"));
        diff.patch = format!("diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@\n+{}\n", "x".repeat(GUIDE_INLINE_LIMIT));
        assert!(guide_inline_diff(&diff).is_none());
    }

    #[test]
    fn manifest_lists_hunk_context_and_marks_generated_files() {
        let mut diff = diff_with(&["src/a.ts", "pnpm-lock.yaml"]);
        diff.patch = PATCH.into();
        let text = manifest(&diff, &[]);
        assert!(text.contains("src/\n  a.ts  modified  +1/-0  @@ export function load()"), "{text}");
        assert!(text.contains("pnpm-lock.yaml  modified  +1/-0  [generated]"), "{text}");
    }

    #[test]
    fn guide_keeps_each_file_once_and_collects_leftovers() {
        let diff = diff_with(&["src/a.ts", "src/b.ts", "package-lock.json"]);
        let (guide, leftover) = build_guide(
            GuideArgs {
                summary: " Adds b ".into(),
                before: Some("  ".into()),
                after: Some("After".into()),
                diagram: None,
                flow: Vec::new(),
                chapters: vec![chapter("Core", &["./src/b.ts", "src/a.ts"]), chapter("Again", &["src/a.ts"])],
            },
            &diff,
        )
        .unwrap();
        assert_eq!(guide.summary, "Adds b");
        assert_eq!(guide.before, None);
        assert_eq!(guide.chapters.len(), 2, "the chapter left with no new files is dropped");
        assert_eq!(guide.chapters[0].files, vec!["src/b.ts", "src/a.ts"]);
        assert_eq!(guide.chapters[0].focus, vec!["Check x"]);
        assert_eq!(guide.chapters[1].title, LEFTOVER_CHAPTER);
        assert_eq!(guide.chapters[1].attention, GuideAttention::Low);
        assert_eq!(leftover, vec!["package-lock.json"]);
    }

    #[test]
    fn guide_rejects_files_outside_the_diff() {
        let diff = diff_with(&["src/a.ts"]);
        let err = build_guide(
            GuideArgs {
                summary: "x".into(),
                before: None,
                after: None,
                diagram: None,
                flow: Vec::new(),
                chapters: vec![chapter("Core", &["src/a.ts", "src/nope.ts"])],
            },
            &diff,
        )
        .unwrap_err();
        assert!(err.message.contains("src/nope.ts"), "{}", err.message);
    }

    #[test]
    fn guide_rejects_text_over_the_word_limits_all_at_once() {
        let diff = diff_with(&["src/a.ts"]);
        let mut core = chapter("Core", &["src/a.ts"]);
        core.summary = "word ".repeat(CHAPTER_SUMMARY_WORDS + 1);
        core.points = vec!["a".into(), "b".into(), "c".into(), "d".into()];
        let err = build_guide(
            GuideArgs { summary: "word ".repeat(SUMMARY_WORDS + 1), before: None, after: None, diagram: None, flow: Vec::new(), chapters: vec![core] },
            &diff,
        )
        .unwrap_err();
        assert!(err.message.contains("summary is 51 words (max 50)"), "{}", err.message);
        assert!(err.message.contains("chapter \"Core\" summary is 41 words"), "{}", err.message);
        assert!(err.message.contains("chapter \"Core\" points has 4 items"), "{}", err.message);
    }

    #[test]
    fn side_parsing() {
        assert_eq!(parse_side(None).ok(), Some(Side::New));
        assert_eq!(parse_side(Some("old")).ok(), Some(Side::Old));
        assert!(parse_side(Some("middle")).is_err());
    }

    fn setup() -> (std::sync::Arc<crate::core::Store>, crate::agents::core_backend::CoreBackend, Binding) {
        let store = std::sync::Arc::new(crate::core::Store::open_in_memory().unwrap());
        let session = store.get_or_create_session("/repo", "work").unwrap();
        let backend = crate::agents::core_backend::CoreBackend::new(store.clone());
        let binding = Binding {
            repo_path: "/repo".into(),
            session_id: session.id,
            r#ref: "work".into(),
            mode: AgentMode::Resolve,
            agent_name: "Claude Code".into(),
            edit_rejected: Default::default(),
            paths: Vec::new(),
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
            view_ref: None,
            promoted_from: None,
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
    async fn resolve_leaves_reviewer_threads_open_and_addressed() {
        let (store, backend, b) = setup();
        let t = store.create_thread(&thread_input(&b.session_id, "rename this", false)).unwrap();
        let out = call(&backend, &b, "resolve", json!({ "threadId": t.id, "summary": "Fixed: renamed" }))
            .await
            .unwrap();
        assert_eq!(out["thread"]["addressedBy"], "Claude Code");
        let stored = store.get_thread(&t.id).unwrap();
        assert_eq!(stored.status, ThreadStatus::Open);
        assert_eq!(stored.addressed_by.as_deref(), Some("Claude Code"));
        assert_eq!(stored.comments.last().unwrap().body, "Fixed: renamed");

        let t = store
            .add_reply(&t.id, "@claude not quite, use snake_case", AuthorType::User, None)
            .unwrap();
        assert_eq!(t.status, ThreadStatus::Open);
        assert_eq!(t.addressed_by, None);
        assert!(t.comments.last().unwrap().mentions_agent);
    }

    #[tokio::test]
    async fn resolve_still_closes_the_agents_own_threads() {
        let (store, backend, b) = setup();
        let input = NewThread { author_type: Some(AuthorType::Agent), author_name: Some("Claude Code".into()), ..thread_input(&b.session_id, "typo", false) };
        let t = store.create_thread(&input).unwrap();
        call(&backend, &b, "resolve", json!({ "threadId": t.id })).await.unwrap();
        let stored = store.get_thread(&t.id).unwrap();
        assert_eq!(stored.status, ThreadStatus::Resolved);
        assert_eq!(stored.addressed_by, None);
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
        assert_eq!(store.get_thread(&t.id).unwrap().addressed_by.as_deref(), Some("Claude Code"));
    }
}
