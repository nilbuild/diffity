use diffity_core::types::{
    AuthorType, NewThread, Review, ReviewSession, ReviewVerdict, Thread, ThreadStatus, ViewedFile,
};
use diffity_core::AppError;
use tauri::{AppHandle, State};

use super::repo::emit_threads_changed;
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

#[tauri::command]
pub async fn delete_thread(app: AppHandle, state: State<'_, AppState>, thread_id: String) -> Result<(), AppError> {
    let session_id = state.store.delete_thread(&thread_id)?;
    emit_threads_changed(&app, &session_id);
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
    let thread = state.store.set_thread_status(&thread_id, status, summary.as_deref())?;
    emit_threads_changed(&app, &thread.session_id);
    Ok(thread)
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
) -> Result<(), AppError> {
    state.store.set_viewed(&session_id, &file_path, &content_hash, viewed)
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
        verdict.unwrap_or(ReviewVerdict::Comment),
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
