use diffity_core::types::Thread;
use diffity_core::AppError;
use diffity_github::{DeviceCode, GitOpResult, GithubAuthStatus, PullRequest, PullResult, PushResult, ReviewEvent};
use tauri::{AppHandle, State};

use crate::state::AppState;

#[tauri::command]
pub async fn github_auth_status(state: State<'_, AppState>) -> Result<GithubAuthStatus, AppError> {
    let _ = &state;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_import_gh_token(state: State<'_, AppState>) -> Result<GithubAuthStatus, AppError> {
    let _ = &state;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_set_token(state: State<'_, AppState>, token: String) -> Result<GithubAuthStatus, AppError> {
    let _ = (&state, token);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_device_start(state: State<'_, AppState>) -> Result<DeviceCode, AppError> {
    let _ = &state;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_device_poll(state: State<'_, AppState>, device_code: String) -> Result<GithubAuthStatus, AppError> {
    let _ = (&state, device_code);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_logout(state: State<'_, AppState>) -> Result<(), AppError> {
    let _ = &state;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn git_fetch(state: State<'_, AppState>, repo_path: String) -> Result<GitOpResult, AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn git_pull(state: State<'_, AppState>, repo_path: String) -> Result<GitOpResult, AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn git_push(state: State<'_, AppState>, repo_path: String) -> Result<GitOpResult, AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn find_pr(state: State<'_, AppState>, repo_path: String) -> Result<Option<PullRequest>, AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn list_prs(state: State<'_, AppState>, repo_path: String) -> Result<Vec<PullRequest>, AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn checkout_pr(
    state: State<'_, AppState>,
    repo_path: String,
    url_or_number: String,
) -> Result<PullRequest, AppError> {
    let _ = (&state, repo_path, url_or_number);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn push_review(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    session_id: String,
    pr_number: u64,
    event: ReviewEvent,
    body: Option<String>,
    thread_ids: Option<Vec<String>>,
) -> Result<PushResult, AppError> {
    let _ = (&app, &state, repo_path, session_id, pr_number, event, body, thread_ids);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn pull_review(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    session_id: String,
    pr_number: u64,
) -> Result<PullResult, AppError> {
    let _ = (&app, &state, repo_path, session_id, pr_number);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_reply(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    body: String,
) -> Result<Thread, AppError> {
    let _ = (&app, &state, thread_id, body);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn github_set_resolved(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    resolved: bool,
) -> Result<Thread, AppError> {
    let _ = (&app, &state, thread_id, resolved);
    Err(AppError::not_implemented())
}
