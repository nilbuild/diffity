use serde::{Deserialize, Serialize};

pub const GENERAL_FILE_PATH: &str = "__general__";
pub const TREE_REF: &str = "__tree__";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Old,
    #[default]
    New,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThreadStatus {
    Open,
    Resolved,
    Dismissed,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Severity {
    MustFix,
    Suggestion,
    Nit,
    Question,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AuthorType {
    User,
    Agent,
    Github,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    pub name: String,
    pub is_git: bool,
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub remote_url: Option<String>,
    /// The remote pull requests live on (see `git::choose_pr_remote`).
    #[serde(default)]
    pub pr_remote: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
}

/// What Diffity keeps locally for one project (Settings → Data).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectData {
    pub repo_path: String,
    pub name: String,
    pub comments: u32,
    pub chats: u32,
    pub reviews: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRef {
    #[serde(rename = "ref")]
    pub r#ref: String,
    pub label: String,
    pub can_revert: bool,
    /// The new side is what is on disk (the working tree, or the checked-out HEAD), so suggestions can be applied.
    #[serde(default)]
    pub can_edit: bool,
    pub base_sha: Option<String>,
    pub head_sha: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Deleted,
    Modified,
    Renamed,
    Copied,
    Untracked,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffFileSummary {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub binary: bool,
    /// Line count of the old side (for context expansion below the last hunk); `None` when the file is new or binary.
    #[serde(default)]
    pub old_line_count: Option<u32>,
    /// The patch was too large to send with the diff; `get_file_patch` returns it.
    #[serde(default)]
    pub patch_omitted: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OverviewStatus {
    Staged,
    Modified,
    Added,
}

/// One uncommitted file for the repo dashboard: staged, modified in the working tree, or untracked (`added`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct OverviewFile {
    pub path: String,
    pub status: OverviewStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub resolved: ResolvedRef,
    pub files: Vec<DiffFileSummary>,
    pub patch: String,
    pub fingerprint: String,
    /// Changed files left out because `.diffityignore` (or the repo's local list) hides them.
    #[serde(default)]
    pub hidden_files: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileVersions {
    pub old_contents: Option<String>,
    pub new_contents: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
    pub author: String,
    #[serde(default)]
    pub author_email: String,
    pub date: String,
    #[serde(default)]
    pub files_changed: u32,
    #[serde(default)]
    pub additions: u32,
    #[serde(default)]
    pub deletions: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_remote: bool,
    pub is_current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub path: String,
    /// The checked-out branch, `None` when detached.
    pub branch: Option<String>,
    pub head: Option<String>,
    /// The repository's main working tree rather than one added with `git worktree add`.
    pub is_main: bool,
    /// The working tree the listing was asked for.
    pub is_current: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub dirty: bool,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TreeEntryKind {
    File,
    Dir,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
    pub path: String,
    pub kind: TreeEntryKind,
    /// Hidden from diffs by `.diffityignore` (still browsable).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub diff_ignored: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub contents: Option<String>,
    pub binary: bool,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSession {
    pub id: String,
    pub repo_path: String,
    #[serde(rename = "ref")]
    pub r#ref: String,
    /// The branch a HEAD-relative view (`origin/main...HEAD`, `main`) belongs to; empty for other views.
    #[serde(default)]
    pub scope: String,
}

/// How much of the reviewer's attention a guide chapter needs.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GuideAttention {
    /// The core of the change: read every line.
    High,
    #[default]
    Normal,
    /// Tests, generated files, lockfiles, config: skim.
    Low,
}

/// An explanation the agent pinned to a file, or to one line of it, shown in the diff where the code is.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuideNote {
    pub path: String,
    /// Unset for a note about the whole file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(default)]
    pub side: Side,
    /// Markdown, 1-2 sentences.
    pub text: String,
    /// The reviewer should take extra care here: security, data loss, hard to revert, easy to get wrong.
    #[serde(default)]
    pub critical: bool,
}

/// Whether a call-stack row is new, gone, or unchanged by the diff.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GuideChange {
    Added,
    Removed,
    #[default]
    Same,
}

/// One row of a chapter's call stack: a call, how deep it is nested, and where it is in the diff.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuideCall {
    /// 0 for the entry point; a callee is one deeper than its caller.
    pub depth: u32,
    /// The call as data flow, e.g. `result = save(record)`.
    pub call: String,
    #[serde(default)]
    pub change: GuideChange,
    /// A file of the diff; unset for code the diff does not touch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// A line the diff shows; unset to point at the whole file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line: Option<u32>,
    #[serde(default)]
    pub side: Side,
    /// Markdown: why this call happens, shown while stepping through.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
}

/// One idea of a change, with the files that carry it, in reading order.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuideChapter {
    pub title: String,
    /// Markdown: why this part exists, in a sentence or two.
    pub summary: String,
    /// Short facts that make the files easier to read.
    #[serde(default)]
    pub points: Vec<String>,
    /// What to check while reading these files.
    #[serde(default)]
    pub focus: Vec<String>,
    #[serde(default)]
    pub attention: GuideAttention,
    /// The stage of the change this chapter belongs to, e.g. "Data layer"; neighbouring chapters share it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    /// Repository-relative paths, most important first.
    pub files: Vec<String>,
    #[serde(default)]
    pub notes: Vec<GuideNote>,
    /// The order the chapter's code runs in, from the entry point down.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub callstack: Vec<GuideCall>,
}

/// One step of the diagram's walkthrough: the node that runs, and what happens there.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuideFlowStep {
    /// A node id of the diagram.
    pub node: String,
    /// Markdown, one sentence.
    pub text: String,
}

/// What an agent wrote to walk a reviewer through a diff.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GuideContent {
    /// Markdown: what the change does and why.
    pub summary: String,
    /// How things worked before the change, in a sentence or two.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<String>,
    /// How they work after it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub after: Option<String>,
    /// Mermaid flowchart of the changed flow.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagram: Option<String>,
    /// The diagram's nodes in the order a request goes through them, for stepping through it.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub flow: Vec<GuideFlowStep>,
    pub chapters: Vec<GuideChapter>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Guide {
    pub session_id: String,
    /// The view the guide was written for.
    #[serde(rename = "ref")]
    pub r#ref: String,
    /// Fingerprint of the diff the guide describes; a different one means the changes moved on since.
    pub fingerprint: String,
    pub agent_name: String,
    pub created_at: String,
    #[serde(flatten)]
    pub content: GuideContent,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub thread_id: String,
    pub author_type: AuthorType,
    pub author_name: String,
    pub body: String,
    pub created_at: String,
    pub github_comment_id: Option<i64>,
    #[serde(default)]
    pub pending: bool,
    #[serde(default)]
    pub review_id: Option<String>,
    /// A user-authored comment that mentions `@claude` (outside code).
    #[serde(default)]
    pub mentions_agent: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub session_id: String,
    pub file_path: String,
    pub side: Side,
    pub start_line: u32,
    pub end_line: u32,
    pub status: ThreadStatus,
    pub severity: Option<Severity>,
    pub anchor_content: Option<String>,
    pub github_thread_id: Option<String>,
    pub comments: Vec<Comment>,
    pub created_at: String,
    pub updated_at: String,
    /// True while the first comment is still a draft in a pending review.
    #[serde(default)]
    pub pending: bool,
    /// Review the thread was started in, if any.
    #[serde(default)]
    pub review_id: Option<String>,
    /// The view the thread was left in (`main`, `main...HEAD`, …); its line numbers belong to that view's diff.
    #[serde(default)]
    pub view_ref: Option<String>,
    /// The agent's comment this draft was made from ("Add to my review").
    #[serde(default)]
    pub promoted_from: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewThread {
    pub session_id: String,
    pub file_path: String,
    pub side: Side,
    pub start_line: u32,
    pub end_line: u32,
    pub body: String,
    #[serde(default)]
    pub severity: Option<Severity>,
    #[serde(default)]
    pub anchor_content: Option<String>,
    #[serde(default)]
    pub author_type: Option<AuthorType>,
    #[serde(default)]
    pub author_name: Option<String>,
    /// Adds the thread to the session's pending review (created on demand) instead of publishing it.
    #[serde(default)]
    pub pending: Option<bool>,
    /// The view the thread is left in; defaults to the session's ref.
    #[serde(default)]
    pub view_ref: Option<String>,
    /// The agent's comment this draft is made from; one draft per comment.
    #[serde(default)]
    pub promoted_from: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ViewedFile {
    pub file_path: String,
    pub content_hash: String,
    /// Git blob of the file when it was marked viewed; `None` for rows from before snapshots, binary or huge files.
    #[serde(default)]
    pub blob_id: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewState {
    Pending,
    Submitted,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewVerdict {
    Comment,
    Approve,
    RequestChanges,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub id: String,
    pub session_id: String,
    pub state: ReviewState,
    pub body: String,
    pub verdict: Option<ReviewVerdict>,
    /// Draft comments still waiting for submit (0 once submitted).
    pub pending_count: u32,
    /// All comments (threads + replies) that belong to the review.
    pub comment_count: u32,
    /// Threads the review started or replied to, in order of first review comment.
    pub thread_ids: Vec<String>,
    /// Threads with a review comment that mentions `@claude`.
    pub mentioned_thread_ids: Vec<String>,
    pub body_mentions_agent: bool,
    pub created_at: String,
    pub submitted_at: Option<String>,
}

/// Where a stored thread stands against its view's current diff.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThreadAnchor {
    /// Shown on its lines (or the view shows it as a file / general comment).
    Current,
    /// The file is still in the view but the commented lines are not.
    Outdated,
    /// The view has changes, but none in this file.
    FileGone,
    /// The view has no changes at all (e.g. uncommitted changes that were committed).
    ViewEmpty,
    /// The view's ref no longer resolves (deleted branch, rewritten history).
    Unknown,
}

/// A commit whose diff now contains an outdated thread's code.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitPointer {
    #[serde(rename = "ref")]
    pub r#ref: String,
    pub sha: String,
    pub short_sha: String,
    pub subject: String,
}

/// One thread of a repo, with the view it lives in, for the repo-wide comments list.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoThread {
    pub id: String,
    pub session_id: String,
    #[serde(rename = "ref")]
    pub r#ref: String,
    pub ref_label: String,
    pub file_path: String,
    pub side: Side,
    pub start_line: u32,
    pub end_line: u32,
    pub status: ThreadStatus,
    pub severity: Option<Severity>,
    pub anchor_content: Option<String>,
    pub author_type: AuthorType,
    pub author_name: String,
    pub excerpt: String,
    pub reply_count: u32,
    pub created_at: String,
    pub updated_at: String,
    pub pending: bool,
    pub anchor: ThreadAnchor,
    pub moved_to: Option<CommitPointer>,
    /// The branch a HEAD-relative view's thread was left on, when that isn't the checked-out branch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub other_branch: Option<String>,
    /// Left on uncommitted changes before those were kept per branch, so its branch is unknown (`is_legacy_session`).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub unassigned: bool,
}
