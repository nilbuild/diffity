use diffity_core::{AppError, Result};
use reqwest::StatusCode;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::types::PullRequest;

const GRAPHQL_URL: &str = "https://api.github.com/graphql";
pub const API_URL: &str = "https://api.github.com";
const USER_AGENT: &str = "diffity-app";

#[derive(Clone)]
pub struct Http {
    client: reqwest::Client,
}

impl Http {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }

    pub fn raw(&self) -> &reqwest::Client {
        &self.client
    }

    pub async fn query<T: DeserializeOwned>(&self, token: &str, query: &str, variables: Value) -> Result<T> {
        if is_mutation(query) && dry_run() {
            tracing::warn!(target: "github_dry_run", "not sent: {query} {variables}");
            return Err(AppError::new("dry_run", "DIFFITY_GITHUB_DRY_RUN=1: GitHub mutation logged, not sent"));
        }
        let resp = self
            .client
            .post(GRAPHQL_URL)
            .bearer_auth(token)
            .json(&json!({ "query": query, "variables": variables }))
            .send()
            .await
            .map_err(|e| AppError::new("network", e.to_string()))?;
        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| AppError::new("network", e.to_string()))?;
        if status == StatusCode::UNAUTHORIZED {
            return Err(AppError::new("unauthorized", "GitHub rejected the token"));
        }
        if !status.is_success() && serde_json::from_str::<Value>(&text).is_err() {
            return Err(AppError::new("github", format!("GitHub returned {status}")));
        }
        parse_response(&text)
    }

    pub async fn get_login(&self, token: &str) -> Result<String> {
        let resp = self
            .client
            .get(format!("{API_URL}/user"))
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|e| AppError::new("network", e.to_string()))?;
        let status = resp.status();
        if status == StatusCode::UNAUTHORIZED {
            return Err(AppError::new("unauthorized", "GitHub rejected the token"));
        }
        if !status.is_success() {
            return Err(AppError::new("github", format!("GitHub returned {status}")));
        }
        let value: Value = resp
            .json()
            .await
            .map_err(|e| AppError::new("github", e.to_string()))?;
        value
            .get("login")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .ok_or_else(|| AppError::new("github", "missing login in /user response"))
    }
}

impl Default for Http {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Deserialize)]
struct Envelope<T> {
    data: Option<T>,
    errors: Option<Vec<GqlError>>,
}

#[derive(Deserialize)]
struct GqlError {
    message: String,
}

pub fn parse_response<T: DeserializeOwned>(text: &str) -> Result<T> {
    let envelope: Envelope<T> = serde_json::from_str(text)
        .map_err(|e| AppError::new("github", format!("unexpected GitHub response: {e}")))?;
    if let Some(errors) = envelope.errors.filter(|e| !e.is_empty()) {
        let joined = errors.into_iter().map(|e| e.message).collect::<Vec<_>>().join("; ");
        return Err(AppError::new("github", joined));
    }
    envelope
        .data
        .ok_or_else(|| AppError::new("github", "empty GitHub response"))
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Connection<T> {
    #[serde(default = "Vec::new")]
    pub nodes: Vec<Option<T>>,
    pub page_info: Option<PageInfo>,
}

impl<T> Connection<T> {
    pub fn into_items(self) -> Vec<T> {
        self.nodes.into_iter().flatten().collect()
    }

    pub fn next_cursor(&self) -> Option<String> {
        let info = self.page_info.as_ref()?;
        if !info.has_next_page {
            return None;
        }
        info.end_cursor.clone()
    }
}

#[derive(Deserialize, Debug, Clone)]
pub struct Actor {
    pub login: String,
    #[serde(rename = "__typename")]
    pub typename: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoRef {
    pub name_with_owner: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct IdRef {
    pub id: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PrNode {
    pub id: String,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub is_draft: bool,
    pub author: Option<Actor>,
    pub base_ref_name: String,
    pub head_ref_name: String,
    pub head_ref_oid: String,
    pub review_decision: Option<String>,
    pub body: Option<String>,
    pub head_repository: Option<RepoRef>,
    pub commits: Option<Connection<CommitNode>>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub review_threads: Option<TotalCount>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub additions: Option<u32>,
    #[serde(default)]
    pub deletions: Option<u32>,
    #[serde(default)]
    pub changed_files: Option<u32>,
    #[serde(default)]
    pub is_cross_repository: Option<bool>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TotalCount {
    pub total_count: u32,
}

#[derive(Deserialize, Debug)]
pub struct CommitNode {
    pub commit: Option<CommitInner>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitInner {
    pub status_check_rollup: Option<Rollup>,
}

#[derive(Deserialize, Debug)]
pub struct Rollup {
    pub state: String,
}

impl PrNode {
    pub fn checks(&self) -> Option<String> {
        self.commits
            .as_ref()?
            .nodes
            .iter()
            .flatten()
            .next_back()?
            .commit
            .as_ref()?
            .status_check_rollup
            .as_ref()
            .map(|r| r.state.clone())
    }

    pub fn head_repo_full_name(&self) -> Option<&str> {
        self.head_repository.as_ref().map(|r| r.name_with_owner.as_str())
    }

    pub fn to_pull_request(&self) -> PullRequest {
        PullRequest {
            number: self.number,
            title: self.title.clone(),
            url: self.url.clone(),
            state: self.state.clone(),
            is_draft: self.is_draft,
            author: self.author.as_ref().map(|a| a.login.clone()).unwrap_or_else(|| "ghost".into()),
            base_ref: self.base_ref_name.clone(),
            head_ref: self.head_ref_name.clone(),
            head_sha: self.head_ref_oid.clone(),
            review_decision: self.review_decision.clone(),
            checks: self.checks(),
            body: self.body.clone().unwrap_or_default(),
            created_at: self.created_at.clone().unwrap_or_default(),
            review_thread_count: self.review_threads.as_ref().map(|t| t.total_count).unwrap_or(0),
            updated_at: self.updated_at.clone().unwrap_or_default(),
            additions: self.additions.unwrap_or(0),
            deletions: self.deletions.unwrap_or(0),
            changed_files: self.changed_files.unwrap_or(0),
            head_repo: self.head_repo_full_name().map(str::to_string),
            is_cross_repository: self.is_cross_repository.unwrap_or(false),
        }
    }
}

pub fn pr_fields() -> &'static str {
    "id number title url state isDraft author{login} baseRefName headRefName headRefOid reviewDecision body \
     headRepository{nameWithOwner} commits(last:1){nodes{commit{statusCheckRollup{state}}}} \
     createdAt updatedAt additions deletions changedFiles isCrossRepository reviewThreads(first:1){totalCount}"
}

pub fn find_pr_query() -> String {
    format!(
        "query($owner:String!,$name:String!,$branch:String!){{repository(owner:$owner,name:$name){{\
         pullRequests(states:OPEN,headRefName:$branch,first:20,orderBy:{{field:UPDATED_AT,direction:DESC}}){{nodes{{{}}}}}}}}}",
        pr_fields()
    )
}

pub fn list_prs_query() -> String {
    format!(
        "query($owner:String!,$name:String!){{repository(owner:$owner,name:$name){{\
         pullRequests(states:OPEN,first:30,orderBy:{{field:UPDATED_AT,direction:DESC}}){{nodes{{{}}}}}}}}}",
        pr_fields()
    )
}

pub fn get_pr_query() -> String {
    format!(
        "query($owner:String!,$name:String!,$number:Int!){{repository(owner:$owner,name:$name){{\
         pullRequest(number:$number){{{}}}}}}}",
        pr_fields()
    )
}

pub const FILES_QUERY: &str = "query($owner:String!,$name:String!,$number:Int!,$after:String){repository(owner:$owner,name:$name){\
    pullRequest(number:$number){files(first:100,after:$after){nodes{path} pageInfo{hasNextPage endCursor}}}}}";

const COMMENT_FIELDS: &str = "databaseId body createdAt author{login __typename} pullRequestReview{id}";

pub fn threads_query() -> String {
    format!(
        "query($owner:String!,$name:String!,$number:Int!,$after:String){{repository(owner:$owner,name:$name){{\
         pullRequest(number:$number){{reviewThreads(first:100,after:$after){{pageInfo{{hasNextPage endCursor}} nodes{{\
         id isResolved isOutdated path line startLine originalLine originalStartLine diffSide startDiffSide \
         comments(first:100){{pageInfo{{hasNextPage endCursor}} nodes{{{COMMENT_FIELDS}}}}}}}}}}}}}}}"
    )
}

pub fn thread_comments_query() -> String {
    format!(
        "query($id:ID!,$after:String){{node(id:$id){{... on PullRequestReviewThread{{\
         comments(first:100,after:$after){{pageInfo{{hasNextPage endCursor}} nodes{{{COMMENT_FIELDS}}}}}}}}}}}"
    )
}

pub const ADD_REVIEW_MUTATION: &str = "mutation($input:AddPullRequestReviewInput!){addPullRequestReview(input:$input){pullRequestReview{id url}}}";

pub const ADD_THREAD_MUTATION: &str = "mutation($input:AddPullRequestReviewThreadInput!){addPullRequestReviewThread(input:$input){thread{id comments(first:1){nodes{databaseId}}}}}";

pub const SUBMIT_REVIEW_MUTATION: &str = "mutation($input:SubmitPullRequestReviewInput!){submitPullRequestReview(input:$input){pullRequestReview{id url}}}";

pub const DELETE_REVIEW_MUTATION: &str = "mutation($input:DeletePullRequestReviewInput!){deletePullRequestReview(input:$input){pullRequestReview{id}}}";

/// Pending reviews are only visible to their author, so any node here is the viewer's.
pub const PENDING_REVIEWS_QUERY: &str = "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){\
    pullRequest(number:$number){reviews(first:5,states:PENDING){nodes{id url viewerDidAuthor comments{totalCount}}}}}}";

/// Debug builds only: `DIFFITY_GITHUB_DRY_RUN=1` logs GitHub mutations instead of sending them.
pub fn dry_run() -> bool {
    cfg!(debug_assertions) && std::env::var("DIFFITY_GITHUB_DRY_RUN").is_ok_and(|v| v == "1")
}

pub fn is_mutation(query: &str) -> bool {
    query.trim_start().starts_with("mutation")
}

pub const REPLY_MUTATION: &str = "mutation($input:AddPullRequestReviewThreadReplyInput!){addPullRequestReviewThreadReply(input:$input){comment{databaseId}}}";

pub const RESOLVE_MUTATION: &str = "mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}";

pub const UNRESOLVE_MUTATION: &str = "mutation($id:ID!){unresolveReviewThread(input:{threadId:$id}){thread{id isResolved}}}";

#[derive(Deserialize, Debug)]
pub struct RepositoryData<T> {
    pub repository: Option<T>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestsField {
    pub pull_requests: Connection<PrNode>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PullRequestField<T> {
    pub pull_request: Option<T>,
}

#[derive(Deserialize, Debug)]
pub struct FilesField {
    pub files: Connection<FileNode>,
}

#[derive(Deserialize, Debug)]
pub struct FileNode {
    pub path: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ThreadsField {
    pub review_threads: Connection<RemoteThread>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteThread {
    pub id: String,
    pub is_resolved: bool,
    pub is_outdated: bool,
    pub path: String,
    pub line: Option<u32>,
    pub start_line: Option<u32>,
    pub original_line: Option<u32>,
    pub original_start_line: Option<u32>,
    pub diff_side: Option<String>,
    pub start_diff_side: Option<String>,
    pub comments: Connection<RemoteComment>,
}

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteComment {
    pub database_id: Option<i64>,
    pub body: String,
    pub created_at: String,
    pub author: Option<Actor>,
    pub pull_request_review: Option<IdRef>,
}

#[derive(Deserialize, Debug)]
pub struct NodeData {
    pub node: Option<CommentsField>,
}

#[derive(Deserialize, Debug)]
pub struct CommentsField {
    pub comments: Option<Connection<RemoteComment>>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddReviewData {
    pub add_pull_request_review: AddReviewPayload,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddReviewPayload {
    pub pull_request_review: Option<ReviewNode>,
}

#[derive(Deserialize, Debug)]
pub struct ReviewNode {
    pub id: String,
    #[serde(default)]
    pub url: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubmitReviewData {
    pub submit_pull_request_review: AddReviewPayload,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AddThreadData {
    pub add_pull_request_review_thread: AddThreadPayload,
}

#[derive(Deserialize, Debug)]
pub struct AddThreadPayload {
    pub thread: Option<AddedThread>,
}

#[derive(Deserialize, Debug)]
pub struct AddedThread {
    pub id: String,
    pub comments: Connection<ReplyComment>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewsField {
    pub reviews: Connection<PendingReviewNode>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PendingReviewNode {
    pub id: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub viewer_did_author: bool,
    pub comments: TotalCount,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReplyData {
    pub add_pull_request_review_thread_reply: ReplyPayload,
}

#[derive(Deserialize, Debug)]
pub struct ReplyPayload {
    pub comment: Option<ReplyComment>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReplyComment {
    pub database_id: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    const PRS: &str = r#"{"data":{"repository":{"pullRequests":{"nodes":[
      {"id":"PR_1","number":12,"title":"Add x","url":"https://github.com/o/r/pull/12","state":"OPEN","isDraft":false,
       "author":{"login":"alice"},"baseRefName":"main","headRefName":"feat","headRefOid":"abc123",
       "reviewDecision":"CHANGES_REQUESTED","body":null,"headRepository":{"nameWithOwner":"o/r"},
       "commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"SUCCESS"}}}]},
       "updatedAt":"2024-02-01T00:00:00Z","additions":5,"deletions":2,"changedFiles":3,"isCrossRepository":true},
      {"id":"PR_2","number":13,"title":"Y","url":"u","state":"OPEN","isDraft":true,"author":null,
       "baseRefName":"main","headRefName":"b","headRefOid":"def","reviewDecision":null,"body":"hi",
       "headRepository":null,"commits":{"nodes":[{"commit":{"statusCheckRollup":null}}]}}
    ]}}}}"#;

    #[test]
    fn parses_pull_requests() {
        let data: RepositoryData<PullRequestsField> = parse_response(PRS).unwrap();
        let nodes = data.repository.unwrap().pull_requests.into_items();
        assert_eq!(nodes.len(), 2);
        let first = nodes[0].to_pull_request();
        assert_eq!(first.number, 12);
        assert_eq!(first.author, "alice");
        assert_eq!(first.checks.as_deref(), Some("SUCCESS"));
        assert_eq!(first.review_decision.as_deref(), Some("CHANGES_REQUESTED"));
        assert_eq!(first.body, "");
        assert_eq!(nodes[0].head_repo_full_name(), Some("o/r"));
        assert_eq!(first.updated_at, "2024-02-01T00:00:00Z");
        assert_eq!((first.additions, first.deletions, first.changed_files), (5, 2, 3));
        assert!(first.is_cross_repository);
        assert_eq!(first.head_repo.as_deref(), Some("o/r"));
        let second = nodes[1].to_pull_request();
        assert_eq!(second.author, "ghost");
        assert_eq!(second.checks, None);
        assert!(second.is_draft);
        assert!(!second.is_cross_repository);
        assert_eq!(second.updated_at, "");
        assert_eq!(nodes[1].head_repo_full_name(), None);
    }

    #[test]
    fn parses_threads() {
        let text = r#"{"data":{"repository":{"pullRequest":{"reviewThreads":{
          "pageInfo":{"hasNextPage":true,"endCursor":"C1"},
          "nodes":[{"id":"T1","isResolved":true,"isOutdated":false,"path":"a.rs","line":10,"startLine":8,
            "originalLine":10,"originalStartLine":8,"diffSide":"RIGHT","startDiffSide":"RIGHT",
            "comments":{"pageInfo":{"hasNextPage":false,"endCursor":null},"nodes":[
              {"databaseId":99,"body":"nit","createdAt":"2024-01-01T00:00:00Z","author":{"login":"bot","__typename":"Bot"},
               "pullRequestReview":{"id":"R1"}}]}}]}}}}}"#;
        let data: RepositoryData<PullRequestField<ThreadsField>> = parse_response(text).unwrap();
        let threads = data.repository.unwrap().pull_request.unwrap().review_threads;
        assert_eq!(threads.next_cursor().as_deref(), Some("C1"));
        let items = threads.into_items();
        assert_eq!(items[0].id, "T1");
        assert!(items[0].is_resolved);
        assert_eq!(items[0].comments.next_cursor(), None);
        let c = items[0].comments.nodes[0].as_ref().unwrap();
        assert_eq!(c.database_id, Some(99));
        assert_eq!(c.author.as_ref().unwrap().typename.as_deref(), Some("Bot"));
        assert_eq!(c.pull_request_review.as_ref().unwrap().id, "R1");
    }

    #[test]
    fn surfaces_graphql_errors() {
        let text = r#"{"data":null,"errors":[{"message":"Could not resolve"},{"message":"other"}]}"#;
        let err = parse_response::<RepositoryData<PullRequestsField>>(text).unwrap_err();
        assert_eq!(err.code, "github");
        assert_eq!(err.message, "Could not resolve; other");
    }
}
