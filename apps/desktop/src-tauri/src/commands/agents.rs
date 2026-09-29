use diffity_agents::{
    AgentAction, AgentEvent, AgentInfo, Chat, ChatMessage, ContextChip, StartChat,
};
use diffity_core::AppError;
use tauri::ipc::Channel;
use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub async fn list_agents(
    state: State<'_, AppState>,
    refresh: Option<bool>,
) -> Result<Vec<AgentInfo>, AppError> {
    state.agents.list_agents(refresh.unwrap_or(false)).await
}

#[tauri::command]
pub async fn start_chat(state: State<'_, AppState>, input: StartChat) -> Result<Chat, AppError> {
    state.agents.start_chat(input).await
}

#[tauri::command]
pub async fn list_chats(
    state: State<'_, AppState>,
    repo_path: String,
) -> Result<Vec<Chat>, AppError> {
    state.agents.list_chats(&repo_path).await
}

#[tauri::command]
pub async fn get_chat_messages(
    state: State<'_, AppState>,
    chat_id: String,
) -> Result<Vec<ChatMessage>, AppError> {
    state.agents.get_chat_messages(&chat_id).await
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
    let sink = Box::new(move |event: AgentEvent| {
        if let Err(e) = on_event.send(event) {
            tracing::debug!("agent event channel closed: {e}");
        }
    });
    state
        .agents
        .send_prompt(&chat_id, text, context, action, sink)
        .await
}

#[tauri::command]
pub async fn cancel_prompt(state: State<'_, AppState>, chat_id: String) -> Result<(), AppError> {
    state.agents.cancel_prompt(&chat_id).await
}

#[tauri::command]
pub async fn respond_permission(
    state: State<'_, AppState>,
    request_id: String,
    option_id: Option<String>,
    for_run: Option<bool>,
) -> Result<(), AppError> {
    state
        .agents
        .respond_permission(&request_id, option_id, for_run.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn delete_chat(state: State<'_, AppState>, chat_id: String) -> Result<(), AppError> {
    state.agents.delete_chat(&chat_id).await
}
