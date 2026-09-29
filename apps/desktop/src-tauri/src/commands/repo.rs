use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

use diffity_core::types::{Branch, Commit, GitStatus, OverviewFile, RecentRepo, RepoInfo};
use diffity_core::watch::WatcherRegistry;
use diffity_core::{editor, git, AppError};
use tauri::{AppHandle, Emitter, State};

use crate::state::AppState;

static WATCHERS: LazyLock<WatcherRegistry> = LazyLock::new(WatcherRegistry::new);

pub(crate) async fn blocking<T, F>(f: F) -> Result<T, AppError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::internal(format!("task failed: {e}")))?
}

pub(crate) fn emit_threads_changed(app: &AppHandle, session_id: &str) {
    let _ = app.emit("threads-changed", serde_json::json!({ "sessionId": session_id }));
}

#[tauri::command]
pub async fn open_repo(state: State<'_, AppState>, path: String) -> Result<RepoInfo, AppError> {
    let info = blocking(move || git::repo_info(Path::new(&path))).await?;
    state.store.touch_repo(&info.path, &info.name)?;
    Ok(info)
}

#[tauri::command]
pub async fn recent_repos(state: State<'_, AppState>) -> Result<Vec<RecentRepo>, AppError> {
    let repos = state.store.recent_repos(30)?;
    Ok(repos
        .into_iter()
        .filter(|r| PathBuf::from(&r.path).is_dir())
        .collect())
}

#[tauri::command]
pub async fn watch_repo(app: AppHandle, repo_path: String) -> Result<(), AppError> {
    let callback = Arc::new(move |path: &str| {
        let _ = app.emit("repo-changed", serde_json::json!({ "repoPath": path }));
    });
    blocking(move || WATCHERS.watch(&repo_path, callback)).await
}

#[tauri::command]
pub async fn unwatch_repo(repo_path: String) -> Result<(), AppError> {
    blocking(move || WATCHERS.unwatch(&repo_path)).await
}

#[tauri::command]
pub async fn list_commits(
    repo_path: String,
    count: u32,
    skip: u32,
    search: Option<String>,
) -> Result<Vec<Commit>, AppError> {
    blocking(move || git::list_commits(Path::new(&repo_path), count, skip, search.as_deref())).await
}

#[tauri::command]
pub async fn list_branches(repo_path: String) -> Result<Vec<Branch>, AppError> {
    blocking(move || git::list_branches(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatus, AppError> {
    blocking(move || git::status(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn repo_overview(repo_path: String) -> Result<Vec<OverviewFile>, AppError> {
    blocking(move || git::overview(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn open_in_editor(
    state: State<'_, AppState>,
    repo_path: String,
    path: String,
    line: Option<u32>,
    editor: Option<String>,
) -> Result<(), AppError> {
    let editor = match editor.filter(|e| !e.trim().is_empty()) {
        Some(e) => Some(e),
        None => state.store.get_setting("editor")?,
    };
    blocking(move || editor::open_in_editor(Path::new(&repo_path), &path, line, editor.as_deref())).await
}

#[tauri::command]
pub async fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, AppError> {
    state.store.get_setting(&key)
}

#[tauri::command]
pub async fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), AppError> {
    state.store.set_setting(&key, &value)
}
