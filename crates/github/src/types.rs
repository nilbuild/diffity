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
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ReviewEvent {
    Comment,
    Approve,
    RequestChanges,
}

impl From<diffity_core::types::ReviewVerdict> for ReviewEvent {
    fn from(v: diffity_core::types::ReviewVerdict) -> Self {
        match v {
            diffity_core::types::ReviewVerdict::Comment => ReviewEvent::Comment,
            diffity_core::types::ReviewVerdict::Approve => ReviewEvent::Approve,
            diffity_core::types::ReviewVerdict::RequestChanges => ReviewEvent::RequestChanges,
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
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub pulled: u32,
    pub updated: u32,
    pub skipped: u32,
}
