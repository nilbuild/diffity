use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use diffity_core::store::Store;
use diffity_core::{AppError, Result};

use crate::types::*;

pub type ThreadsChangedHook = Arc<dyn Fn(&str) + Send + Sync>;

pub struct AgentManager {
    #[allow(dead_code)]
    store: Arc<Store>,
    #[allow(dead_code)]
    data_dir: PathBuf,
    #[allow(dead_code)]
    mcp_binary: PathBuf,
    threads_changed: RwLock<Option<ThreadsChangedHook>>,
}

impl AgentManager {
    pub fn new(store: Arc<Store>, data_dir: PathBuf, mcp_binary: PathBuf) -> Self {
        Self {
            store,
            data_dir,
            mcp_binary,
            threads_changed: RwLock::new(None),
        }
    }

    /// Desktop registers a hook that emits `threads-changed { sessionId }` when MCP tool calls mutate threads.
    pub fn on_threads_changed(&self, hook: ThreadsChangedHook) {
        if let Ok(mut slot) = self.threads_changed.write() {
            *slot = Some(hook);
        }
    }

    #[allow(dead_code)]
    pub(crate) fn notify_threads_changed(&self, session_id: &str) {
        let Ok(slot) = self.threads_changed.read() else {
            return;
        };
        if let Some(hook) = slot.as_ref() {
            hook(session_id);
        }
    }

    pub async fn list_agents(&self) -> Result<Vec<AgentInfo>> {
        Err(AppError::not_implemented())
    }

    pub async fn start_chat(&self, _input: StartChat) -> Result<Chat> {
        Err(AppError::not_implemented())
    }

    pub async fn list_chats(&self, _repo_path: &str) -> Result<Vec<Chat>> {
        Err(AppError::not_implemented())
    }

    pub async fn get_chat_messages(&self, _chat_id: &str) -> Result<Vec<ChatMessage>> {
        Err(AppError::not_implemented())
    }

    pub async fn send_prompt(
        &self,
        _chat_id: &str,
        _text: String,
        _context: Vec<ContextChip>,
        _action: AgentAction,
        _on_event: Box<dyn Fn(AgentEvent) + Send + Sync>,
    ) -> Result<()> {
        Err(AppError::not_implemented())
    }

    pub async fn cancel_prompt(&self, _chat_id: &str) -> Result<()> {
        Err(AppError::not_implemented())
    }

    pub async fn respond_permission(&self, _request_id: &str, _option_id: Option<String>) -> Result<()> {
        Err(AppError::not_implemented())
    }

    pub async fn delete_chat(&self, _chat_id: &str) -> Result<()> {
        Err(AppError::not_implemented())
    }
}
