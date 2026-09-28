use diffity_agents::{AgentAction, AgentEvent, AgentInfo, Chat, ChatMessage, ContextChip, StartChat};
use diffity_core::AppError;
use tauri::ipc::Channel;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn list_agents(state: State<'_, AppState>) -> Result<Vec<AgentInfo>, AppError> {
    state.agents.list_agents().await
}

#[tauri::command]
pub async fn start_chat(state: State<'_, AppState>, input: StartChat) -> Result<Chat, AppError> {
    let _ = (&state, input);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn list_chats(state: State<'_, AppState>, repo_path: String) -> Result<Vec<Chat>, AppError> {
    let _ = (&state, repo_path);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn get_chat_messages(state: State<'_, AppState>, chat_id: String) -> Result<Vec<ChatMessage>, AppError> {
    let _ = (&state, chat_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn send_prompt(
    state: State<'_, AppState>,
    chat_id: String,
    text: String,
    context: Vec<ContextChip>,
    action: AgentAction,
    on_event: Channel<AgentEvent>,
) -> Result<(), AppError> {
    let _ = (&state, chat_id, text, context, action, on_event);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn cancel_prompt(state: State<'_, AppState>, chat_id: String) -> Result<(), AppError> {
    let _ = (&state, chat_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn respond_permission(
    state: State<'_, AppState>,
    request_id: String,
    option_id: Option<String>,
) -> Result<(), AppError> {
    let _ = (&state, request_id, option_id);
    Err(AppError::not_implemented())
}

#[tauri::command]
pub async fn delete_chat(state: State<'_, AppState>, chat_id: String) -> Result<(), AppError> {
    let _ = (&state, chat_id);
    Err(AppError::not_implemented())
}
