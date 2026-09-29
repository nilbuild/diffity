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

fn home_dir() -> PathBuf {
    std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuickOpenRoots {
    pub home: String,
    pub roots: Vec<String>,
}

/// The home folder plus the common code folders that exist.
#[tauri::command]
pub fn quick_open_roots() -> QuickOpenRoots {
    let home = home_dir();
    let roots = ["lab", "Code", "code", "Projects", "projects", "Developer", "dev", "src", "repos", "work"]
        .iter()
        .map(|name| home.join(name))
        .filter(|path| path.is_dir())
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
    QuickOpenRoots { home: home.to_string_lossy().into_owned(), roots }
}

#[tauri::command]
pub async fn list_dir_suggestions(path_prefix: String) -> Result<diffity_core::quick_open::DirSuggestions, AppError> {
    blocking(move || Ok(diffity_core::quick_open::list_dir_suggestions(&path_prefix, &home_dir()))).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPath {
    pub path: String,
    pub exists: bool,
    pub repo_root: Option<String>,
}

#[tauri::command]
pub async fn resolve_repo_root(path: String) -> Result<ResolvedPath, AppError> {
    blocking(move || {
        let expanded = diffity_core::quick_open::expand_path(&path, &home_dir());
        let exists = expanded.is_dir();
        let root = if exists { diffity_core::quick_open::resolve_repo_root(&expanded) } else { None };
        Ok(ResolvedPath {
            path: expanded.to_string_lossy().into_owned(),
            exists,
            repo_root: root.map(|root| root.to_string_lossy().into_owned()),
        })
    })
    .await
}

/// `git clone --progress` into `parent`, streaming progress lines as `clone-progress` events.
#[tauri::command]
pub async fn clone_repo(app: AppHandle, url: String, parent: String) -> Result<String, AppError> {
    use tokio::io::AsyncReadExt;

    let parent = diffity_core::quick_open::expand_path(&parent, &home_dir());
    if !parent.is_dir() {
        return Err(AppError::invalid(format!("{} is not a folder", parent.display())));
    }
    let (clone_url, name) = diffity_github::gitcli::clone_target(&url)?;
    let dest = parent.join(&name);
    if dest.exists() {
        return Err(AppError::new("exists", format!("{} already exists", dest.display())));
    }
    let mut child = tokio::process::Command::new("git")
        .args(["clone", "--progress", "--", &clone_url, &name])
        .current_dir(&parent)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("GCM_INTERACTIVE", "never")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::new("git", format!("failed to run git: {e}")))?;
    let mut stderr = child.stderr.take().ok_or_else(|| AppError::internal("no stderr"))?;
    let mut buffer = [0u8; 1024];
    let mut log = String::new();
    loop {
        let read = stderr.read(&mut buffer).await.unwrap_or(0);
        if read == 0 {
            break;
        }
        let chunk = String::from_utf8_lossy(&buffer[..read]).into_owned();
        log.push_str(&chunk);
        if let Some(line) = chunk.split(['\r', '\n']).rev().find(|line| !line.trim().is_empty()) {
            let _ = app.emit("clone-progress", serde_json::json!({ "url": url, "line": line.trim() }));
        }
    }
    let status = child.wait().await.map_err(|e| AppError::new("git", e.to_string()))?;
    if !status.success() {
        let message = log
            .lines()
            .rev()
            .find(|line| line.starts_with("fatal:") || line.starts_with("error:"))
            .unwrap_or("git clone failed")
            .to_string();
        return Err(AppError::new("git", message));
    }
    Ok(dest.to_string_lossy().into_owned())
}
