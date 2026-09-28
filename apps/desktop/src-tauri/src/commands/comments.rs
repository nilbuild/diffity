use diffity_core::types::{AuthorType, NewThread, ReviewSession, Thread, ThreadStatus, ViewedFile};
use diffity_core::AppError;
use tauri::{AppHandle, State};

use crate::state::AppState;

#[tauri::command]
pub async fn get_session(
    state: State<'_, AppState>,
    repo_path: String,
    r#ref: String,
) -> Result<ReviewSession, AppError> {
    let _ = (&state, repo_path, r#ref);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn list_threads(state: State<'_, AppState>, session_id: String) -> Result<Vec<Thread>, AppError> {
    let _ = (&state, session_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn create_thread(
    app: AppHandle,
    state: State<'_, AppState>,
    input: NewThread,
) -> Result<Thread, AppError> {
    let _ = (&app, &state, input);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn add_reply(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    body: String,
    author_type: Option<AuthorType>,
    author_name: Option<String>,
) -> Result<Thread, AppError> {
    let _ = (&app, &state, thread_id, body, author_type, author_name);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn edit_comment(
    app: AppHandle,
    state: State<'_, AppState>,
    comment_id: String,
    body: String,
) -> Result<(), AppError> {
    let _ = (&app, &state, comment_id, body);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn delete_comment(app: AppHandle, state: State<'_, AppState>, comment_id: String) -> Result<(), AppError> {
    let _ = (&app, &state, comment_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn delete_thread(app: AppHandle, state: State<'_, AppState>, thread_id: String) -> Result<(), AppError> {
    let _ = (&app, &state, thread_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn delete_all_threads(
    app: AppHandle,
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), AppError> {
    let _ = (&app, &state, session_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn set_thread_status(
    app: AppHandle,
    state: State<'_, AppState>,
    thread_id: String,
    status: ThreadStatus,
    summary: Option<String>,
) -> Result<Thread, AppError> {
    let _ = (&app, &state, thread_id, status, summary);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn list_viewed(state: State<'_, AppState>, session_id: String) -> Result<Vec<ViewedFile>, AppError> {
    let _ = (&state, session_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn set_viewed(
    state: State<'_, AppState>,
    session_id: String,
    file_path: String,
    content_hash: String,
    viewed: bool,
) -> Result<(), AppError> {
    let _ = (&state, session_id, file_path, content_hash, viewed);
    Err(AppError::not_implemented())
}
