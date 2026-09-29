//! Repo-wide thread listing: every thread of a repo with a label for its view and whether it is still
//! anchored in that view's current diff.

use std::collections::HashMap;
use std::path::Path;

use crate::diff::{self, WORKING_TREE_REFS};
use crate::error::Result;
use crate::git;
use crate::store::Store;
use crate::types::{
    CommitPointer, DiffResult, RepoThread, ReviewSession, Side, Thread, ThreadAnchor, GENERAL_FILE_PATH, TREE_REF,
};

const PATH_COMMENT_PREFIX: &str = "__path__:";
const ROOT_PATH: &str = "__root__";
const EXCERPT_LEN: usize = 160;

/// Line number → text for each side of one file's hunks.
#[derive(Default, Debug)]
pub struct FileLines {
    pub old: HashMap<u32, String>,
    pub new: HashMap<u32, String>,
}

impl FileLines {
    fn side(&self, side: Side) -> &HashMap<u32, String> {
        match side {
            Side::Old => &self.old,
            Side::New => &self.new,
        }
    }

    fn has_any(&self, side: Side, start: u32, end: u32) -> bool {
        let lines = self.side(side);
        (start..=end).any(|n| lines.contains_key(&n))
    }

    /// True when lines `start..=end` on `side` are all in the hunks and read `anchor`.
    fn matches_anchor(&self, side: Side, start: u32, end: u32, anchor: &str) -> bool {
        let lines = self.side(side);
        let mut texts = Vec::new();
        for n in start..=end {
            let Some(text) = lines.get(&n) else {
                return false;
            };
            texts.push(text.as_str());
        }
        texts.join("\n") == anchor
    }
}

fn strip_patch_path(raw: &str, prefix: &str) -> Option<String> {
    let raw = raw.trim_end_matches('\t').trim();
    if raw == "/dev/null" {
        return None;
    }
    let unquoted = raw.strip_prefix('"').and_then(|s| s.strip_suffix('"')).unwrap_or(raw);
    Some(unquoted.strip_prefix(prefix).unwrap_or(unquoted).to_string())
}

fn hunk_starts(line: &str) -> Option<(u32, u32)> {
    let rest = line.strip_prefix("@@ -")?;
    let end = rest.find(" @@")?;
    let mut parts = rest[..end].split(" +");
    let start = |s: &str| s.split(',').next().and_then(|v| v.parse().ok());
    Some((start(parts.next()?)?, start(parts.next()?)?))
}

/// Indexes a unified patch by file path (new path, and old path for deletions and renames).
pub fn index_patch(patch: &str) -> HashMap<String, FileLines> {
    let mut files: Vec<(Option<String>, Option<String>, FileLines)> = Vec::new();
    let mut in_hunk = false;
    let (mut old_no, mut new_no) = (0u32, 0u32);
    for line in patch.lines() {
        if line.starts_with("diff --git ") {
            files.push((None, None, FileLines::default()));
            in_hunk = false;
            continue;
        }
        let Some(file) = files.last_mut() else {
            continue;
        };
        if let Some((old, new)) = hunk_starts(line) {
            in_hunk = true;
            old_no = old;
            new_no = new;
            continue;
        }
        if !in_hunk {
            if let Some(rest) = line.strip_prefix("--- ") {
                file.0 = strip_patch_path(rest, "a/");
            } else if let Some(rest) = line.strip_prefix("+++ ") {
                file.1 = strip_patch_path(rest, "b/");
            }
            continue;
        }
        match line.as_bytes().first() {
            Some(b' ') => {
                file.2.old.insert(old_no, line[1..].to_string());
                file.2.new.insert(new_no, line[1..].to_string());
                old_no += 1;
                new_no += 1;
            }
            Some(b'-') => {
                file.2.old.insert(old_no, line[1..].to_string());
                old_no += 1;
            }
            Some(b'+') => {
                file.2.new.insert(new_no, line[1..].to_string());
                new_no += 1;
            }
            Some(b'\\') => {}
            None => {
                file.2.old.insert(old_no, String::new());
                file.2.new.insert(new_no, String::new());
                old_no += 1;
                new_no += 1;
            }
            _ => in_hunk = false,
        }
    }
    let mut out = HashMap::new();
    for (old, new, lines) in files {
        match (new, old) {
            (Some(new), Some(old)) if new != old => {
                out.insert(old, FileLines { old: lines.old.clone(), new: HashMap::new() });
                out.insert(new, lines);
            }
            (Some(path), _) | (None, Some(path)) => {
                out.insert(path, lines);
            }
            (None, None) => {}
        }
    }
    out
}

/// A view's diff reduced to what anchoring needs.
pub struct ViewIndex {
    pub files: HashMap<String, FileLines>,
    pub empty: bool,
}

impl ViewIndex {
    pub fn from_diff(result: &DiffResult) -> ViewIndex {
        let mut files = index_patch(&result.patch);
        for f in &result.files {
            files.entry(f.path.clone()).or_default();
            if let Some(old) = &f.old_path {
                files.entry(old.clone()).or_default();
            }
        }
        ViewIndex { empty: result.files.is_empty(), files }
    }

    pub fn anchor(&self, thread: &Thread) -> ThreadAnchor {
        if self.empty {
            return ThreadAnchor::ViewEmpty;
        }
        if thread.file_path == GENERAL_FILE_PATH {
            return ThreadAnchor::Current;
        }
        let Some(lines) = self.files.get(&thread.file_path) else {
            return ThreadAnchor::FileGone;
        };
        if thread.start_line == 0 || lines.has_any(thread.side, thread.start_line, thread.end_line) {
            return ThreadAnchor::Current;
        }
        ThreadAnchor::Outdated
    }

    /// Whether this diff shows the thread's code (same text when the thread kept its anchor snippet).
    pub fn contains(&self, thread: &Thread) -> bool {
        if thread.file_path == GENERAL_FILE_PATH || thread.start_line == 0 {
            return false;
        }
        let Some(lines) = self.files.get(&thread.file_path) else {
            return false;
        };
        match thread.anchor_content.as_deref().filter(|a| !a.is_empty()) {
            Some(anchor) => lines.matches_anchor(thread.side, thread.start_line, thread.end_line, anchor),
            None => lines.has_any(thread.side, thread.start_line, thread.end_line),
        }
    }
}

fn commit_ref_sha(r: &str) -> Option<&str> {
    let (left, right) = r.split_once("~1..")?;
    let valid = (7..=40).contains(&left.len()) && left.chars().all(|c| c.is_ascii_hexdigit());
    (valid && left == right).then_some(left)
}

pub fn commit_ref(sha: &str) -> String {
    format!("{sha}~1..{sha}")
}

fn commit_subject(repo: &Path, sha: &str) -> Option<String> {
    git::run_trim(repo, &["log", "-1", "--format=%s", sha, "--"]).ok()
}

/// Human label for a view, e.g. "Uncommitted changes", "Commit abc1234 · Fix login", "main...feature", "Files".
pub fn ref_label(repo: &Path, r: &str) -> String {
    match r {
        TREE_REF => return "Files".to_string(),
        "work" | "." => return "Uncommitted changes".to_string(),
        "staged" => return "Staged changes".to_string(),
        "unstaged" => return "Unstaged changes".to_string(),
        _ => {}
    }
    if let Some(sha) = commit_ref_sha(r) {
        let short = &sha[..7];
        return match commit_subject(repo, sha).filter(|s| !s.is_empty()) {
            Some(subject) => format!("Commit {short} · {subject}"),
            None => format!("Commit {short}"),
        };
    }
    if let Some((base, head)) = r.split_once("...").or_else(|| r.split_once("..")) {
        let head = if head.is_empty() { "HEAD" } else { head };
        return format!("{} → {}", short_ref(base), short_ref(head));
    }
    format!("Changes since {}", short_ref(r))
}

fn short_ref(r: &str) -> &str {
    let r = r.strip_prefix("origin/").unwrap_or(r);
    let is_sha = (8..=40).contains(&r.len()) && r.chars().all(|c| c.is_ascii_hexdigit());
    if is_sha {
        &r[..7]
    } else {
        r
    }
}

fn excerpt(body: &str) -> String {
    let normalized = body.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= EXCERPT_LEN {
        return normalized;
    }
    let cut: String = normalized.chars().take(EXCERPT_LEN - 1).collect();
    format!("{}…", cut.trim_end())
}

fn tree_anchor(repo: &Path, thread: &Thread) -> ThreadAnchor {
    if thread.file_path == GENERAL_FILE_PATH {
        return ThreadAnchor::Current;
    }
    let path = thread.file_path.strip_prefix(PATH_COMMENT_PREFIX).unwrap_or(&thread.file_path);
    if path == ROOT_PATH || repo.join(path).exists() {
        return ThreadAnchor::Current;
    }
    ThreadAnchor::FileGone
}

/// The latest commit when it now holds code that a working-tree thread was left on.
struct HeadCommit {
    pointer: CommitPointer,
    index: ViewIndex,
}

fn head_commit(repo: &Path) -> Option<HeadCommit> {
    let sha = git::head_sha(repo).ok()??;
    let r = commit_ref(&sha);
    let result = diff::get_diff(repo, &r, false).ok()?;
    Some(HeadCommit {
        pointer: CommitPointer {
            subject: commit_subject(repo, &sha).unwrap_or_default(),
            short_sha: sha[..7].to_string(),
            sha,
            r#ref: r,
        },
        index: ViewIndex::from_diff(&result),
    })
}

enum View {
    Tree,
    Diff(ViewIndex),
    Unknown,
}

/// Every thread of a repo across its views, most recently updated first.
pub fn list_repo_threads(store: &Store, repo_path: &str) -> Result<Vec<RepoThread>> {
    let repo = Path::new(repo_path);
    let rows = store.list_repo_threads(repo_path)?;
    let mut views: HashMap<String, (String, View)> = HashMap::new();
    let mut head: Option<Option<HeadCommit>> = None;
    let mut out = Vec::with_capacity(rows.len());
    for (session, thread) in rows {
        let (label, view) = views.entry(session.r#ref.clone()).or_insert_with(|| load_view(repo, &session));
        let anchor = match view {
            View::Tree => tree_anchor(repo, &thread),
            View::Diff(index) => index.anchor(&thread),
            View::Unknown => ThreadAnchor::Unknown,
        };
        let mut moved_to = None;
        if anchor != ThreadAnchor::Current && WORKING_TREE_REFS.contains(&session.r#ref.as_str()) {
            let commit = head.get_or_insert_with(|| head_commit(repo));
            moved_to = commit
                .as_ref()
                .filter(|c| c.index.contains(&thread))
                .map(|c| c.pointer.clone());
        }
        out.push(to_repo_thread(&session, label.clone(), thread, anchor, moved_to));
    }
    Ok(out)
}

fn load_view(repo: &Path, session: &ReviewSession) -> (String, View) {
    let label = ref_label(repo, &session.r#ref);
    if session.r#ref == TREE_REF {
        return (label, View::Tree);
    }
    match diff::get_diff(repo, &session.r#ref, false) {
        Ok(result) => (label, View::Diff(ViewIndex::from_diff(&result))),
        Err(_) => (label, View::Unknown),
    }
}

fn to_repo_thread(
    session: &ReviewSession,
    ref_label: String,
    thread: Thread,
    anchor: ThreadAnchor,
    moved_to: Option<CommitPointer>,
) -> RepoThread {
    let first = thread.comments.first();
    RepoThread {
        id: thread.id,
        session_id: thread.session_id,
        r#ref: session.r#ref.clone(),
        ref_label,
        file_path: thread.file_path,
        side: thread.side,
        start_line: thread.start_line,
        end_line: thread.end_line,
        status: thread.status,
        severity: thread.severity,
        anchor_content: thread.anchor_content,
        author_type: first.map(|c| c.author_type).unwrap_or(crate::types::AuthorType::User),
        author_name: first.map(|c| c.author_name.clone()).unwrap_or_default(),
        excerpt: first.map(|c| excerpt(&c.body)).unwrap_or_default(),
        reply_count: thread.comments.len().saturating_sub(1) as u32,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
        pending: thread.pending,
        anchor,
        moved_to,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PATCH: &str = "diff --git a/src/a.rs b/src/a.rs
index 111..222 100644
--- a/src/a.rs
+++ b/src/a.rs
@@ -1,4 +1,5 @@
 fn main() {
-    old();
+    new();
+    more();
     done();
 }
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1 +0,0 @@
-bye
";

    #[test]
    fn indexes_lines_by_side() {
        let files = index_patch(PATCH);
        let a = &files["src/a.rs"];
        assert_eq!(a.new.get(&2).map(String::as_str), Some("    new();"));
        assert_eq!(a.old.get(&2).map(String::as_str), Some("    old();"));
        assert_eq!(a.new.len(), 5);
        assert_eq!(a.old.len(), 4);
        assert_eq!(files["gone.txt"].old.get(&1).map(String::as_str), Some("bye"));
        assert!(a.matches_anchor(Side::New, 2, 3, "    new();\n    more();"));
        assert!(!a.matches_anchor(Side::New, 2, 3, "    new();"));
    }

    #[test]
    fn labels_refs() {
        let repo = Path::new("/nonexistent");
        assert_eq!(ref_label(repo, "work"), "Uncommitted changes");
        assert_eq!(ref_label(repo, TREE_REF), "Files");
        assert_eq!(ref_label(repo, "main...feature"), "main → feature");
        assert_eq!(
            ref_label(repo, "7081c9ac6589dd4011977f33f19ecd3164871cdf..HEAD"),
            "7081c9a → HEAD"
        );
        assert_eq!(ref_label(repo, "85f5bf39c3edbd65e98bbfb3372e4aa1"), "Changes since 85f5bf3");
        assert_eq!(ref_label(repo, "v1.0"), "Changes since v1.0");
        assert_eq!(ref_label(repo, "abcdef1234~1..abcdef1234"), "Commit abcdef1");
    }

    #[test]
    fn excerpts_collapse_whitespace() {
        assert_eq!(excerpt("a\n\n  b"), "a b");
        let long = "word ".repeat(100);
        assert!(excerpt(&long).chars().count() <= EXCERPT_LEN);
        assert!(excerpt(&long).ends_with('…'));
    }
}
