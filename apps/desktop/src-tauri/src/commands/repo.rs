use diffity_core::types::{Branch, Commit, GitStatus, RecentRepo, RepoInfo};
use diffity_core::AppError;
use tauri::{AppHandle, State};

use crate::state::AppState;

#[tauri::command]
pub async fn open_repo(state: State<'_, AppState>, path: String) -> Result<RepoInfo, AppError> {
    let _ = (&state, path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn recent_repos(state: State<'_, AppState>) -> Result<Vec<RecentRepo>, AppError> {
    let _ = &state;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn watch_repo(app: AppHandle, state: State<'_, AppState>, repo_path: String) -> Result<(), AppError> {
    let _ = (&app, &state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn unwatch_repo(state: State<'_, AppState>, repo_path: String) -> Result<(), AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn list_commits(
    repo_path: String,
    count: u32,
    skip: u32,
    search: Option<String>,
) -> Result<Vec<Commit>, AppError> {
    let _ = (repo_path, count, skip, search);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn list_branches(repo_path: String) -> Result<Vec<Branch>, AppError> {
    let _ = repo_path;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatus, AppError> {
    let _ = repo_path;
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn open_in_editor(
    repo_path: String,
    path: String,
    line: Option<u32>,
    editor: Option<String>,
) -> Result<(), AppError> {
    let _ = (repo_path, path, line, editor);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, AppError> {
    let _ = (&state, key);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), AppError> {
    let _ = (&state, key, value);
    Err(AppError::not_implemented())
}
