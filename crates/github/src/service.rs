use std::sync::Arc;

use diffity_core::store::Store;
use diffity_core::types::Thread;
use diffity_core::{AppError, Result};

use crate::types::*;

pub struct GithubService {
    #[allow(dead_code)]
    store: Arc<Store>,
}

impl GithubService {
    pub fn new(store: Arc<Store>) -> Self {
        Self { store }
    }

    pub async fn auth_status(&self) -> Result<GithubAuthStatus> {
        Err(AppError::not_implemented())
    }

    pub async fn import_gh_token(&self) -> Result<GithubAuthStatus> {
        Err(AppError::not_implemented())
    }

    pub async fn set_token(&self, _token: String) -> Result<GithubAuthStatus> {
        Err(AppError::not_implemented())
    }

    pub async fn device_start(&self) -> Result<DeviceCode> {
        Err(AppError::not_implemented())
    }

    pub async fn device_poll(&self, _device_code: String) -> Result<GithubAuthStatus> {
        Err(AppError::not_implemented())
    }

    pub async fn logout(&self) -> Result<()> {
        Err(AppError::not_implemented())
    }

    pub async fn git_fetch(&self, _repo_path: &str) -> Result<GitOpResult> {
        Err(AppError::not_implemented())
    }

    pub async fn git_pull(&self, _repo_path: &str) -> Result<GitOpResult> {
        Err(AppError::not_implemented())
    }

    pub async fn git_push(&self, _repo_path: &str) -> Result<GitOpResult> {
        Err(AppError::not_implemented())
    }

    pub async fn find_pr(&self, _repo_path: &str) -> Result<Option<PullRequest>> {
        Err(AppError::not_implemented())
    }

    pub async fn list_prs(&self, _repo_path: &str) -> Result<Vec<PullRequest>> {
        Err(AppError::not_implemented())
    }

    pub async fn checkout_pr(&self, _repo_path: &str, _url_or_number: String) -> Result<PullRequest> {
        Err(AppError::not_implemented())
    }

    pub async fn push_review(
        &self,
        _repo_path: &str,
        _session_id: &str,
        _pr_number: u64,
        _event: ReviewEvent,
        _body: Option<String>,
        _thread_ids: Option<Vec<String>>,
    ) -> Result<PushResult> {
        Err(AppError::not_implemented())
    }

    pub async fn pull_review(&self, _repo_path: &str, _session_id: &str, _pr_number: u64) -> Result<PullResult> {
        Err(AppError::not_implemented())
    }

    pub async fn reply(&self, _thread_id: &str, _body: String) -> Result<Thread> {
        Err(AppError::not_implemented())
    }

    pub async fn set_resolved(&self, _thread_id: &str, _resolved: bool) -> Result<Thread> {
        Err(AppError::not_implemented())
    }
}
