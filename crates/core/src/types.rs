use serde::{Deserialize, Serialize};

pub const GENERAL_FILE_PATH: &str = "__general__";
pub const TREE_REF: &str = "__tree__";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Old,
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
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    pub last_opened_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedRef {
    #[serde(rename = "ref")]
    pub r#ref: String,
    pub label: String,
    pub can_revert: bool,
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
    pub date: String,
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
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ViewedFile {
    pub file_path: String,
    pub content_hash: String,
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
