use diffity_core::types::Thread;
use diffity_core::AppError;
use diffity_github::{DeviceCode, GitOpResult, GithubAuthStatus, PullRequest, PullResult, PushResult, ReviewEvent};
use serde_json::json;
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

fn emit_threads_changed(app: &AppHandle, session_id: &str) {
    let _ = app.emit("threads-changed", json!({ "sessionId": session_id }));
}

#[tauri::command]
pub async fn github_auth_status(state: State<'_, AppState>) -> Result<GithubAuthStatus, AppError> {
    state.github.auth_status().await
}

#[tauri::command]
pub async fn github_import_gh_token(state: State<'_, AppState>) -> Result<GithubAuthStatus, AppError> {
    state.github.import_gh_token().await
}

#[tauri::command]
pub async fn github_set_token(state: State<'_, AppState>, token: String) -> Result<GithubAuthStatus, AppError> {
    state.github.set_token(token).await
}

#[tauri::command]
pub async fn github_device_start(state: State<'_, AppState>) -> Result<DeviceCode, AppError> {
    state.github.device_start().await
}

#[tauri::command]
pub async fn github_device_poll(state: State<'_, AppState>, device_code: String) -> Result<GithubAuthStatus, AppError> {
    state.github.device_poll(device_code).await
}

#[tauri::command]
pub async fn github_logout(state: State<'_, AppState>) -> Result<(), AppError> {
    state.github.logout().await
}

#[tauri::command]
pub async fn git_fetch(app: AppHandle, state: State<'_, AppState>, repo_path: String) -> Result<GitOpResult, AppError> {
    let result = state.github.git_fetch(&repo_path).await?;
    let _ = app.emit("repo-changed", json!({ "repoPath": repo_path }));
    Ok(result)
}

#[tauri::command]
pub async fn git_pull(app: AppHandle, state: State<'_, AppState>, repo_path: String) -> Result<GitOpResult, AppError> {
    let result = state.github.git_pull(&repo_path).await?;
    let _ = app.emit("repo-changed", json!({ "repoPath": repo_path }));
    Ok(result)
}

#[tauri::command]
pub async fn git_push(app: AppHandle, state: State<'_, AppState>, repo_path: String) -> Result<GitOpResult, AppError> {
    let result = state.github.git_push(&repo_path).await?;
    let _ = app.emit("repo-changed", json!({ "repoPath": repo_path }));
    Ok(result)
}

#[tauri::command]
pub async fn find_pr(state: State<'_, AppState>, repo_path: String) -> Result<Option<PullRequest>, AppError> {
    state.github.find_pr(&repo_path).await
}

#[tauri::command]
pub async fn list_prs(state: State<'_, AppState>, repo_path: String) -> Result<Vec<PullRequest>, AppError> {
    state.github.list_prs(&repo_path).await
}

#[tauri::command]
pub async fn checkout_pr(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    url_or_number: String,
) -> Result<PullRequest, AppError> {
    let pr = state.github.checkout_pr(&repo_path, url_or_number).await?;
    let _ = app.emit("repo-changed", json!({ "repoPath": repo_path }));
    Ok(pr)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
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
    let result = state
        .github
        .push_review(&repo_path, &session_id, pr_number, event, body, thread_ids)
        .await;
    emit_repo_threads_changed(&app, &state, &repo_path);
    result
}

#[tauri::command]
pub async fn pull_review(
    app: AppHandle,
    state: State<'_, AppState>,
    repo_path: String,
    session_id: String,
    pr_number: u64,
) -> Result<PullResult, AppError> {
    let result = state.github.pull_review(&repo_path, &session_id, pr_number).await;
    emit_repo_threads_changed(&app, &state, &repo_path);
    result
}

/// Open unsynced threads from all of the repo's sessions that can be pushed to the PR.
#[tauri::command]
pub async fn github_pushable_threads(
    state: State<'_, AppState>,
    repo_path: String,
    pr_number: u64,
) -> Result<Vec<Thread>, AppError> {
    state.github.pushable_threads(&repo_path, pr_number).await
}

fn emit_repo_threads_changed(app: &AppHandle, state: &AppState, repo_path: &str) {
    let sessions = diffity_github::db::list_repo_sessions(&state.store, repo_path).unwrap_or_default();
    for (session_id, _) in sessions {
        emit_threads_changed(app, &session_id);
    }
}

#[tauri::command]
pub async fn github_reply(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    body: String,
) -> Result<Thread, AppError> {
    let thread = state.github.reply(&thread_id, body).await?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
}

#[tauri::command]
pub async fn github_set_resolved(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    resolved: bool,
) -> Result<Thread, AppError> {
    let thread = state.github.set_resolved(&thread_id, resolved).await?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
}
