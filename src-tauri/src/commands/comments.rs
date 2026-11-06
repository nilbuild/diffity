use std::path::Path;

use crate::core::types::{
    AuthorType, Guide, NewThread, RepoThread, Review, ReviewSession, ReviewVerdict, Thread, ThreadSnapshot, ThreadStatus, ViewedFile,
    TREE_REF,
};
use crate::core::{diff, repo_threads};
use crate::core::AppError;
use tauri::{AppHandle, State};

use super::repo::{blocking, emit_threads_changed};
use crate::state::AppState;

#[tauri::command]
pub async fn get_session(
    state: State<'_, AppState>,
    repo_path: String,
    r#ref: String,
) -> Result<ReviewSession, AppError> {
    state.store.get_or_create_session(&repo_path, &r#ref)
}

#[tauri::command]
pub async fn list_threads(state: State<'_, AppState>, session_id: String) -> Result<Vec<Thread>, AppError> {
    state.store.list_threads(&session_id, None)
}

/// Every thread of the repo across its views (uncommitted, commits, ranges, file browser), with a label for
/// the view and whether the thread is still anchored in that view's current diff.
#[tauri::command]
pub async fn list_repo_threads(state: State<'_, AppState>, repo_path: String) -> Result<Vec<RepoThread>, AppError> {
    let store = state.store.clone();
    blocking(move || repo_threads::list_repo_threads(&store, &repo_path)).await
}

#[tauri::command]
pub async fn create_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    input: NewThread,
) -> Result<Thread, AppError> {
    let thread = state.store.create_thread(&input)?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
}

#[tauri::command]
pub async fn add_reply(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    body: String,
    author_type: Option<AuthorType>,
    author_name: Option<String>,
    pending: Option<bool>,
) -> Result<Thread, AppError> {
    let thread = state.store.add_reply_with(
        &thread_id,
        &body,
        author_type.unwrap_or(AuthorType::User),
        author_name.as_deref(),
        pending.unwrap_or(false),
    )?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
}

#[tauri::command]
pub async fn edit_comment(
    app: AppHandle,
    state: State<'_, AppState>,
    comment_id: String,
    body: String,
) -> Result<(), AppError> {
    let session_id = state.store.edit_comment(&comment_id, &body)?;
    emit_threads_changed(&app, &session_id);
    Ok(())
}

#[tauri::command]
pub async fn delete_comment(app: AppHandle, state: State<'_, AppState>, comment_id: String) -> Result<(), AppError> {
    let session_id = state.store.delete_comment(&comment_id)?;
    emit_threads_changed(&app, &session_id);
    Ok(())
}

/// Deletes a thread and returns it as it was, for Undo (`restore_thread`).
#[tauri::command]
pub async fn delete_thread(app: AppHandle, state: State<'_, AppState>, thread_id: String) -> Result<ThreadSnapshot, AppError> {
    let snapshot = state.store.delete_thread(&thread_id)?;
    emit_threads_changed(&app, &snapshot.thread.session_id);
    Ok(snapshot)
}

#[tauri::command]
pub async fn restore_thread(app: AppHandle, state: State<'_, AppState>, snapshot: ThreadSnapshot) -> Result<Thread, AppError> {
    let thread = state.store.restore_thread(&snapshot)?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
}

#[tauri::command]
pub async fn keep_thread_on_branch(app: AppHandle, state: State<'_, AppState>, thread_id: String) -> Result<(), AppError> {
    let (from, into) = state.store.keep_thread_on_branch(&thread_id)?;
    emit_threads_changed(&app, &from);
    emit_threads_changed(&app, &into);
    Ok(())
}

#[tauri::command]
pub async fn delete_all_threads(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), AppError> {
    state.store.delete_all_threads(&session_id)?;
    emit_threads_changed(&app, &session_id);
    Ok(())
}

#[tauri::command]
pub async fn set_thread_status(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    status: ThreadStatus,
    summary: Option<String>,
) -> Result<Thread, AppError> {
    let current = state.store.get_thread(&thread_id)?;
    // A thread synced with GitHub is resolved or reopened there first, or the next sync would undo it here.
    let resolve = match status {
        ThreadStatus::Resolved => Some(true),
        ThreadStatus::Open => Some(false),
        ThreadStatus::Dismissed => None,
    };
    if let (Some(github_thread_id), Some(resolved)) = (current.github_thread_id.as_deref(), resolve) {
        if current.status != status {
            state
                .github
                .push_resolved(github_thread_id, resolved)
                .await
                .map_err(|e| AppError::new("github_sync", e.message))?;
        }
    }
    let thread = state.store.set_thread_status(&thread_id, status, summary.as_deref())?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
}

#[tauri::command]
pub async fn get_guide(state: State<'_, AppState>, session_id: String) -> Result<Option<Guide>, AppError> {
    state.store.get_guide(&session_id)
}

#[tauri::command]
pub async fn delete_guide(state: State<'_, AppState>, session_id: String) -> Result<(), AppError> {
    state.store.delete_guide(&session_id)
}

#[tauri::command]
pub async fn list_viewed(state: State<'_, AppState>, session_id: String) -> Result<Vec<ViewedFile>, AppError> {
    state.store.list_viewed(&session_id)
}

#[tauri::command]
pub async fn set_viewed(
    state: State<'_, AppState>,
    session_id: String,
    file_path: String,
    content_hash: String,
    viewed: bool,
    r#ref: Option<String>,
) -> Result<(), AppError> {
    if !viewed {
        return state.store.set_viewed(&session_id, &file_path, &content_hash, None, false);
    }
    let session = state.store.get_session_by_id(&session_id)?;
    let view_ref = r#ref.unwrap_or(session.r#ref);
    let path = file_path.clone();
    let blob = blocking(move || {
        if view_ref == TREE_REF {
            return Ok(None);
        }
        Ok(diff::snapshot_blob(Path::new(&session.repo_path), &view_ref, &path).unwrap_or(None))
    })
    .await?;
    state.store.set_viewed(&session_id, &file_path, &content_hash, blob.as_deref(), true)
}

/// Patch from the version of `file_path` last marked viewed to its contents in the view `ref` (empty when unchanged).
#[tauri::command]
pub async fn viewed_changes(
    state: State<'_, AppState>,
    session_id: String,
    file_path: String,
    r#ref: Option<String>,
) -> Result<String, AppError> {
    let session = state.store.get_session_by_id(&session_id)?;
    let view_ref = r#ref.unwrap_or(session.r#ref);
    let blob = state
        .store
        .get_viewed(&session_id, &file_path)?
        .and_then(|v| v.blob_id)
        .ok_or_else(|| AppError::not_found("no viewed snapshot for this file"))?;
    blocking(move || diff::changes_since_blob(Path::new(&session.repo_path), &view_ref, &file_path, &blob)).await
}

#[tauri::command]
pub async fn get_pending_review(state: State<'_, AppState>, session_id: String) -> Result<Option<Review>, AppError> {
    state.store.get_pending_review(&session_id)
}

#[tauri::command]
pub async fn start_review(app: AppHandle, state: State<'_, AppState>, session_id: String) -> Result<Review, AppError> {
    let review = state.store.start_review(&session_id)?;
    emit_threads_changed(&app, &session_id);
    Ok(review)
}

#[tauri::command]
pub async fn get_review(state: State<'_, AppState>, review_id: String) -> Result<Review, AppError> {
    state.store.get_review(&review_id)
}

#[tauri::command]
pub async fn list_reviews(state: State<'_, AppState>, session_id: String) -> Result<Vec<Review>, AppError> {
    state.store.list_reviews(&session_id)
}

#[tauri::command]
pub async fn submit_review(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
    body: Option<String>,
    verdict: Option<ReviewVerdict>,
) -> Result<Review, AppError> {
    let review = state.store.submit_review(
        &session_id,
        body.as_deref().unwrap_or(""),
        verdict,
    )?;
    emit_threads_changed(&app, &session_id);
    Ok(review)
}

#[tauri::command]
pub async fn discard_review(app: AppHandle, state: State<'_, AppState>, session_id: String) -> Result<(), AppError> {
    if state.store.discard_review(&session_id)? {
        emit_threads_changed(&app, &session_id);
    }
    Ok(())
}
