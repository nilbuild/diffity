use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, LazyLock, Mutex};

use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter, State};

use crate::commands::repo::blocking;
use crate::core::task::{self, BaseStatus, BaseUpdate, NewTask, Task, TaskConfig, TaskRound, TaskState};
use crate::github::types::CreatedPr;
use crate::core::AppError;
use crate::state::AppState;

/// One git operation per task at a time: a run ending while Ship squashes, or two rounds committing at once, would
/// otherwise leave the branch and the rounds table disagreeing.
fn task_lock(id: &str) -> Arc<Mutex<()>> {
    static LOCKS: LazyLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = LazyLock::new(Default::default);
    let mut locks = LOCKS.lock().unwrap_or_else(|e| e.into_inner());
    locks.entry(id.to_string()).or_default().clone()
}

fn locked<T>(id: &str, work: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError> {
    let lock = task_lock(id);
    let _held = lock.lock().unwrap_or_else(|e| e.into_inner());
    work()
}

fn emit_tasks_changed(app: &AppHandle, repo_path: &str) {
    let _ = app.emit("tasks-changed", serde_json::json!({ "repoPath": repo_path }));
}

#[tauri::command]
pub async fn list_tasks(state: State<'_, AppState>, repo_path: Option<String>) -> Result<Vec<Task>, AppError> {
    let store = state.store.clone();
    blocking(move || task::list(&store, repo_path.as_deref())).await
}

/// The repository's main checkout for any of its working trees, so a task folder can find its parent.
#[tauri::command]
pub async fn main_checkout(path: String) -> Result<String, AppError> {
    blocking(move || task::main_checkout(Path::new(&path))).await
}

#[tauri::command]
pub async fn create_task(app: AppHandle, state: State<'_, AppState>, input: NewTask) -> Result<Task, AppError> {
    let (store, root) = (state.store.clone(), state.worktrees_root.clone());
    let task = blocking(move || task::create(&store, &root, &input)).await?;
    emit_tasks_changed(&app, &task.repo_path);
    Ok(task)
}

#[tauri::command]
pub async fn set_task_state(app: AppHandle, state: State<'_, AppState>, task_id: String, task_state: TaskState) -> Result<Task, AppError> {
    let store = state.store.clone();
    let task = blocking(move || task::set_state(&store, &task_id, task_state)).await?;
    emit_tasks_changed(&app, &task.repo_path);
    Ok(task)
}

#[tauri::command]
pub async fn rename_task(app: AppHandle, state: State<'_, AppState>, task_id: String, title: String) -> Result<Task, AppError> {
    let store = state.store.clone();
    let task = blocking(move || task::rename(&store, &task_id, &title)).await?;
    emit_tasks_changed(&app, &task.repo_path);
    Ok(task)
}

/// Ends an agent run: commits what it changed as the next round and marks the task ready (or failed).
#[tauri::command]
pub async fn finish_task_run(app: AppHandle, state: State<'_, AppState>, task_id: String, failed: bool) -> Result<Option<TaskRound>, AppError> {
    let store = state.store.clone();
    let (round, task, error) = blocking(move || {
        locked(&task_id, || {
            let committed = task::commit_round(&store, &task_id);
            let (round, error) = match committed {
                Ok(round) => (round, None),
                Err(e) => (None, Some(e)),
            };
            // A run that changed nothing leaves the task as it was reviewed; only a new round asks for a review.
            let next = if failed || error.is_some() {
                TaskState::Failed
            } else if round.is_some() {
                TaskState::Ready
            } else {
                TaskState::Idle
            };
            let task = task::set_state(&store, &task_id, next)?;
            Ok((round, task, error))
        })
    })
    .await?;
    emit_tasks_changed(&app, &task.repo_path);
    if let Some(error) = error {
        return Err(error);
    }
    emit_tasks_changed(&app, &task.repo_path);
    Ok(round)
}

#[tauri::command]
pub async fn archive_task(app: AppHandle, state: State<'_, AppState>, task_id: String) -> Result<Task, AppError> {
    let (store, root) = (state.store.clone(), state.worktrees_root.clone());
    let task = blocking(move || locked(&task_id.clone(), || task::archive(&store, &root, &task_id))).await?;
    emit_tasks_changed(&app, &task.repo_path);
    Ok(task)
}

/// A macOS notification for a background task (finished, waiting for approval, stopped).
#[tauri::command]
pub async fn notify_task(app: AppHandle, title: String, body: String) -> Result<(), AppError> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| AppError::internal(format!("could not show the notification: {e}")))
}

/// The Dock badge: how many tasks are waiting for you. Zero clears it.
#[tauri::command]
pub async fn set_task_badge(app: AppHandle, count: i64) -> Result<(), AppError> {
    use tauri::Manager;
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    window
        .set_badge_count(if count > 0 { Some(count) } else { None })
        .map_err(|e| AppError::internal(format!("could not set the badge: {e}")))
}

/// Marks every round so far as reviewed: the next round's "since last review" view starts from here.
#[tauri::command]
pub async fn mark_task_reviewed(state: State<'_, AppState>, task_id: String) -> Result<(), AppError> {
    let store = state.store.clone();
    blocking(move || task::mark_reviewed(&store, &task_id)).await
}

/// `.diffity/workspace.json` of the repository, plus a setup command guessed from its lockfile.
#[tauri::command]
pub async fn task_config(repo_path: String) -> Result<TaskConfig, AppError> {
    blocking(move || {
        let main = task::main_checkout(Path::new(&repo_path))?;
        Ok(task::config(Path::new(&main)))
    })
    .await
}

/// Runs the setup command in a new task's folder, streaming its output; the task shows Setting up meanwhile and
/// Stopped if the command fails.
#[tauri::command]
pub async fn run_task_setup(app: AppHandle, state: State<'_, AppState>, task_id: String, command: String, on_output: Channel<String>) -> Result<(), AppError> {
    let store = state.store.clone();
    let started = task::set_state(&store, &task_id, TaskState::SettingUp)?;
    emit_tasks_changed(&app, &started.repo_path);
    let path = started.path.clone();
    let _working = state.agents.hold();
    let result = blocking(move || {
        task::run_shell(Path::new(&path), &command, |line| {
            let _ = on_output.send(line.to_string());
        })
    })
    .await;
    let next = if result.is_ok() { TaskState::Working } else { TaskState::Failed };
    let task = task::set_state(&store, &task_id, next)?;
    emit_tasks_changed(&app, &task.repo_path);
    result
}

#[tauri::command]
pub async fn task_base_status(state: State<'_, AppState>, task_id: String) -> Result<BaseStatus, AppError> {
    let store = state.store.clone();
    blocking(move || task::base_status(&store, &task_id)).await
}

#[tauri::command]
pub async fn update_task_from_base(app: AppHandle, state: State<'_, AppState>, task_id: String) -> Result<BaseUpdate, AppError> {
    let store = state.store.clone();
    let id = task_id.clone();
    let update = blocking(move || locked(&id.clone(), || task::update_from_base(&store, &id))).await?;
    let task = task::get(&state.store, &task_id)?;
    emit_tasks_changed(&app, &task.repo_path);
    let _ = app.emit("repo-changed", serde_json::json!({ "repoPath": task.path }));
    Ok(update)
}

/// Squashes the rounds into one commit (your hooks run), pushes the branch and opens a pull request; a task that
/// already has one just gets the new commit pushed to it.
#[tauri::command]
pub async fn ship_task_pr(
    app: AppHandle,
    state: State<'_, AppState>,
    task_id: String,
    title: String,
    body: String,
    draft: bool,
) -> Result<CreatedPr, AppError> {
    let store = state.store.clone();
    let task = task::get(&store, &task_id)?;
    let base = task.base_ref.trim_start_matches("origin/").trim_start_matches("upstream/").to_string();
    if let (Some(number), Some(url)) = (task.pr_number, task.pr_url.clone()) {
        // Only the rounds since the last push, on top of what the PR has, so a plain push either fast-forwards or is
        // refused; commits added on GitHub are never overwritten.
        let pushed = state.github.remote_branch_tip(&task.path, &task.branch).await?;
        let Some(pushed) = pushed else {
            return Err(AppError::invalid(format!("{} isn't on the remote any more, so pull request #{number} can't be updated", task.branch)));
        };
        let (id, squash_store, path) = (task_id.clone(), store.clone(), task.path.clone());
        let message = format!("{} (follow-up)", title.trim());
        blocking(move || {
            locked(&id.clone(), || {
                let dir = Path::new(&path);
                if crate::core::git::run_opt(dir, &["merge-base", "--is-ancestor", &pushed, "HEAD"])?.is_none() {
                    return Err(AppError::invalid(format!(
                        "pull request #{number} has commits this task doesn't (pushed on GitHub). Merge them into the task branch first"
                    )));
                }
                task::squash_onto(&squash_store, &id, Some(&pushed), &message)
            })
        })
        .await?;
        let _ = app.emit("repo-changed", serde_json::json!({ "repoPath": task.path }));
        state.github.push_task_branch(&task.path, &task.branch).await?;
        emit_tasks_changed(&app, &task.repo_path);
        return Ok(CreatedPr { number, url });
    }
    let message = if body.trim().is_empty() { title.clone() } else { format!("{}\n\n{}", title.trim(), body.trim()) };
    let id = task_id.clone();
    let squash_store = store.clone();
    blocking(move || locked(&id.clone(), || task::squash(&squash_store, &id, &message))).await?;
    let _ = app.emit("repo-changed", serde_json::json!({ "repoPath": task.path }));
    let created = state.github.create_pr(&task.path, &task.branch, &base, title.trim(), body.trim(), draft).await?;
    let updated = task::set_pr(&store, &task_id, created.number, &created.url)?;
    emit_tasks_changed(&app, &updated.repo_path);
    Ok(created)
}

#[tauri::command]
pub async fn merge_task_locally(app: AppHandle, state: State<'_, AppState>, task_id: String, message: String) -> Result<Task, AppError> {
    let store = state.store.clone();
    let task = blocking(move || locked(&task_id.clone(), || task::merge_locally(&store, &task_id, &message))).await?;
    emit_tasks_changed(&app, &task.repo_path);
    let _ = app.emit("repo-changed", serde_json::json!({ "repoPath": task.repo_path }));
    Ok(task)
}

#[tauri::command]
pub async fn restore_task(app: AppHandle, state: State<'_, AppState>, task_id: String) -> Result<Task, AppError> {
    let store = state.store.clone();
    let task = blocking(move || task::restore(&store, &task_id)).await?;
    emit_tasks_changed(&app, &task.repo_path);
    Ok(task)
}

#[tauri::command]
pub async fn list_archived_tasks(state: State<'_, AppState>, repo_path: String) -> Result<Vec<Task>, AppError> {
    let store = state.store.clone();
    blocking(move || task::list_archived(&store, &repo_path)).await
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStorage {
    pub root: String,
    pub tasks: Vec<TaskUsage>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUsage {
    pub task_id: String,
    pub bytes: u64,
}

#[tauri::command]
pub async fn task_storage(state: State<'_, AppState>, repo_path: Option<String>) -> Result<TaskStorage, AppError> {
    let store = state.store.clone();
    let root = state.worktrees_root.to_string_lossy().into_owned();
    let usage = blocking(move || task::disk_usage(&store, repo_path.as_deref())).await?;
    Ok(TaskStorage { root, tasks: usage.into_iter().map(|(task_id, bytes)| TaskUsage { task_id, bytes }).collect() })
}

/// Checks the pull requests of a repository's tasks on GitHub and marks merged ones as shipped.
#[tauri::command]
pub async fn refresh_task_prs(app: AppHandle, state: State<'_, AppState>, repo_path: String) -> Result<Vec<Task>, AppError> {
    let store = state.store.clone();
    let tasks = task::list(&store, Some(&repo_path))?;
    let mut changed = false;
    for item in tasks.iter().filter(|t| t.merged_at.is_none()) {
        let Some(number) = item.pr_number else {
            continue;
        };
        if let Ok(pr_state) = state.github.pr_state(&item.path, number).await {
            if pr_state == "MERGED" {
                task::set_merged(&store, &item.id)?;
                changed = true;
            }
        }
    }
    if changed {
        emit_tasks_changed(&app, &repo_path);
    }
    task::list(&store, Some(&repo_path))
}

#[tauri::command]
pub async fn adopt_worktree(app: AppHandle, state: State<'_, AppState>, path: String, base_ref: String) -> Result<Task, AppError> {
    let store = state.store.clone();
    let task = blocking(move || task::adopt(&store, &path, &base_ref)).await?;
    emit_tasks_changed(&app, &task.repo_path);
    Ok(task)
}
