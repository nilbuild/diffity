use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock};

use crate::core::types::{Branch, Commit, GitStatus, OverviewFile, ProjectData, RecentRepo, RepoInfo, Worktree};
use crate::core::watch::WatcherRegistry;
use crate::core::diffignore::DiffIgnore;
use crate::core::{editor, git, AppError};
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

/// Every remote URL of the repository containing `path` (the PR remote first), without adding it to the
/// recent list like `open_repo`.
#[tauri::command]
pub async fn repo_remote_urls(path: String) -> Result<Vec<String>, AppError> {
    blocking(move || {
        let Some(root) = git::find_repo_root(Path::new(&path))? else {
            return Ok(Vec::new());
        };
        git::remote_urls(&root)
    })
    .await
}

#[tauri::command]
pub async fn recent_repos(state: State<'_, AppState>) -> Result<Vec<RecentRepo>, AppError> {
    let repos = state.store.recent_repos(30)?;
    Ok(repos
        .into_iter()
        .filter(|r| PathBuf::from(&r.path).is_dir())
        .collect())
}

/// Settings that only cache data, dropped by a reset: the model lists and hidden recent projects.
const CACHE_SETTINGS: [&str; 4] = [
    "agent.claude.models",
    "agent.codex.models",
    "agent.opencode.models",
    "welcome.hiddenRepos",
];

#[tauri::command]
pub async fn project_data(state: State<'_, AppState>) -> Result<Vec<ProjectData>, AppError> {
    let store = state.store.clone();
    blocking(move || store.project_data()).await
}

#[tauri::command]
pub async fn clear_project_data(state: State<'_, AppState>, repo_path: String) -> Result<(), AppError> {
    let store = state.store.clone();
    blocking(move || store.clear_project_data(&repo_path)).await
}

#[tauri::command]
pub async fn reset_all_data(state: State<'_, AppState>) -> Result<(), AppError> {
    let store = state.store.clone();
    blocking(move || store.reset_all_data(&CACHE_SETTINGS)).await?;
    state.agents.forget_model_catalog().await;
    Ok(())
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
pub async fn list_branch_commits(
    repo_path: String,
    base: String,
    count: u32,
    skip: u32,
) -> Result<Vec<Commit>, AppError> {
    blocking(move || git::list_branch_commits(Path::new(&repo_path), &base, count, skip)).await
}

#[tauri::command]
pub async fn list_branches(repo_path: String) -> Result<Vec<Branch>, AppError> {
    blocking(move || git::list_branches(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn list_worktrees(repo_path: String) -> Result<Vec<Worktree>, AppError> {
    blocking(move || git::list_worktrees(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn git_status(repo_path: String) -> Result<GitStatus, AppError> {
    blocking(move || git::status(Path::new(&repo_path))).await
}

#[tauri::command]
pub async fn repo_overview(repo_path: String) -> Result<Vec<OverviewFile>, AppError> {
    blocking(move || {
        let repo = Path::new(&repo_path);
        let mut files = git::overview(repo)?;
        let rules = DiffIgnore::load(repo)?;
        files.retain(|f| !rules.is_ignored(&f.path, false));
        Ok(files)
    })
    .await
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
pub async fn list_dir_suggestions(path_prefix: String) -> Result<crate::core::quick_open::DirSuggestions, AppError> {
    blocking(move || Ok(crate::core::quick_open::list_dir_suggestions(&path_prefix, &home_dir()))).await
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
        let expanded = crate::core::quick_open::expand_path(&path, &home_dir());
        let exists = expanded.is_dir();
        let root = if exists { crate::core::quick_open::resolve_repo_root(&expanded) } else { None };
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

    let parent = crate::core::quick_open::expand_path(&parent, &home_dir());
    if !parent.is_dir() {
        return Err(AppError::invalid(format!("{} is not a folder", parent.display())));
    }
    let (clone_url, name) = crate::github::gitcli::clone_target(&url)?;
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
