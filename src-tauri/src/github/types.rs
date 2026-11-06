use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AuthSource {
    Keychain,
    Gh,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GithubAuthStatus {
    pub authenticated: bool,
    pub login: Option<String>,
    pub source: Option<AuthSource>,
    pub device_flow_available: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeviceCode {
    pub user_code: String,
    pub verification_uri: String,
    pub device_code: String,
    pub interval: u64,
    pub expires_in: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitOpResult {
    pub ok: bool,
    pub output: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub is_draft: bool,
    pub author: String,
    pub base_ref: String,
    pub head_ref: String,
    pub head_sha: String,
    pub review_decision: Option<String>,
    pub checks: Option<String>,
    pub body: String,
    #[serde(default)]
    pub created_at: String,
    /// Review threads on the PR (resolved or not).
    #[serde(default)]
    pub review_thread_count: u32,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub additions: u32,
    #[serde(default)]
    pub deletions: u32,
    #[serde(default)]
    pub changed_files: u32,
    /// `owner/name` of the head repository (null when the fork was deleted).
    #[serde(default)]
    pub head_repo: Option<String>,
    /// Head branch lives in a fork.
    #[serde(default)]
    pub is_cross_repository: bool,
    /// The local remote for the PR's base repository (`upstream` in a fork setup), when looked up from a clone.
    #[serde(default)]
    pub base_remote: Option<String>,
}

/// A pull request in the inbox, with the repository it lives in.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InboxPullRequest {
    #[serde(flatten)]
    pub pr: PullRequest,
    /// `owner/name` of the base repository.
    pub repo: String,
    /// Conversation comments (review threads are in `review_thread_count`).
    pub comment_count: u32,
    /// Checks and statuses on the head commit.
    pub check_count: u32,
}

/// Open PRs that involve you, as GitHub's searches return them; a PR can appear in more than one list.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PrInbox {
    /// Review requested from you by name.
    pub review_direct: Vec<InboxPullRequest>,
    /// Review requested from you or a team you're on.
    pub review_requested: Vec<InboxPullRequest>,
    pub assigned: Vec<InboxPullRequest>,
    pub authored: Vec<InboxPullRequest>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashResult {
    /// Commit sha of the stash entry, `None` when there was nothing to stash.
    pub sha: Option<String>,
    pub message: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewEvent {
    Comment,
    Approve,
    RequestChanges,
}

impl From<crate::core::types::ReviewVerdict> for ReviewEvent {
    fn from(v: crate::core::types::ReviewVerdict) -> Self {
        match v {
            crate::core::types::ReviewVerdict::Comment => ReviewEvent::Comment,
            crate::core::types::ReviewVerdict::Approve => ReviewEvent::Approve,
            crate::core::types::ReviewVerdict::RequestChanges => ReviewEvent::RequestChanges,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub pushed: u32,
    pub skipped: u32,
    pub failed: u32,
    pub errors: Vec<String>,
    /// Local thread ids that are now linked to GitHub threads (or went into the review body).
    #[serde(default)]
    pub posted_thread_ids: Vec<String>,
    /// The GitHub review that was created or submitted.
    #[serde(default)]
    pub review_url: Option<String>,
    /// Debug builds with `DIFFITY_GITHUB_DRY_RUN=1`: nothing was sent; `dry_run_mutations` holds what would have been.
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default)]
    pub dry_run_mutations: Vec<serde_json::Value>,
}

/// What to do with a review you already have pending on GitHub (started on github.com).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GithubPendingAction {
    /// Add the new comments to it and submit it.
    AddToExisting,
    /// Delete it, then post a new review.
    Discard,
}

/// A review of yours that is pending (unsubmitted) on GitHub.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GithubPendingReview {
    pub id: String,
    pub comment_count: u32,
    pub url: Option<String>,
}

/// Everything the Submit review popover needs to know about posting to the PR.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReviewCandidates {
    pub candidates: Vec<crate::github::review::ReviewCandidate>,
    /// Set when nothing line-anchored can be posted at all (e.g. local HEAD isn't the PR head).
    pub blocker: Option<String>,
    pub github_pending: Option<GithubPendingReview>,
    pub pr_url: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub pulled: u32,
    pub updated: u32,
    pub skipped: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreatedPr {
    pub number: i64,
    pub url: String,
}
