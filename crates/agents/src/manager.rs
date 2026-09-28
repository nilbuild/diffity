use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use diffity_core::store::Store;
use diffity_core::{AppError, Result};

use crate::backend::ReviewBackend;
use crate::bridge::{self, McpBridge};
use crate::chats;
use crate::core_backend::CoreBackend;
use crate::detect::{self, AgentKind, DetectedAgent};
use crate::prompts;
use crate::session::{AgentSession, EventSink, PermissionBroker, SessionConfig};
use crate::tools::Binding;
use crate::types::*;

pub use crate::bridge::ThreadsChangedHook;

const DETECT_TTL: Duration = Duration::from_secs(30);
const DEFAULT_REF: &str = "work";

struct Runtime {
    session: AgentSession,
    token: String,
}

type Slot = Arc<Mutex<Option<Arc<Runtime>>>>;

pub struct AgentManager {
    store: Arc<Store>,
    mcp_binary: PathBuf,
    backend: Arc<dyn ReviewBackend>,
    bridge: Arc<McpBridge>,
    broker: Arc<PermissionBroker>,
    detected: Mutex<Option<(Instant, Vec<DetectedAgent>)>>,
    runtimes: std::sync::Mutex<HashMap<String, Slot>>,
}

impl AgentManager {
    pub fn new(store: Arc<Store>, data_dir: PathBuf, mcp_binary: PathBuf) -> Self {
        let backend: Arc<dyn ReviewBackend> = Arc::new(CoreBackend::new(store.clone()));
        Self::with_backend(store, &data_dir, mcp_binary, backend)
    }

    pub fn with_backend(
        store: Arc<Store>,
        data_dir: &std::path::Path,
        mcp_binary: PathBuf,
        backend: Arc<dyn ReviewBackend>,
    ) -> Self {
        if let Err(e) = chats::init(&store) {
            tracing::error!("agents: failed to init chat tables: {e}");
        }
        let bridge = McpBridge::new(bridge::socket_path_for(data_dir), backend.clone());
        Self {
            store,
            mcp_binary,
            backend,
            bridge,
            broker: Arc::new(PermissionBroker::default()),
            detected: Mutex::new(None),
            runtimes: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// Desktop registers a hook that emits `threads-changed { sessionId }` when MCP tool calls mutate threads.
    pub fn on_threads_changed(&self, hook: ThreadsChangedHook) {
        self.bridge.set_hook(hook);
    }

    async fn detected_agents(&self, force: bool) -> Vec<DetectedAgent> {
        let mut cache = self.detected.lock().await;
        if let Some((at, agents)) = cache.as_ref() {
            if !force && at.elapsed() < DETECT_TTL {
                return agents.clone();
            }
        }
        let agents = detect::detect_all().await;
        *cache = Some((Instant::now(), agents.clone()));
        agents
    }

    pub async fn list_agents(&self) -> Result<Vec<AgentInfo>> {
        Ok(self
            .detected_agents(false)
            .await
            .into_iter()
            .map(|a| a.info)
            .collect())
    }

    pub async fn start_chat(&self, input: StartChat) -> Result<Chat> {
        let Some(kind) = AgentKind::from_id(&input.agent_id) else {
            return Err(AppError::not_found(format!(
                "unknown agent `{}`",
                input.agent_id
            )));
        };
        let title = input
            .title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| format!("{} chat", kind.display_name()));
        let store = self.store.clone();
        blocking(move || {
            chats::insert(
                &store,
                &input.repo_path,
                kind.id(),
                input.mode,
                &title,
                &input.session_id,
            )
        })
        .await
    }

    pub async fn list_chats(&self, repo_path: &str) -> Result<Vec<Chat>> {
        let (store, repo) = (self.store.clone(), repo_path.to_string());
        blocking(move || chats::list(&store, &repo)).await
    }

    pub async fn get_chat_messages(&self, chat_id: &str) -> Result<Vec<ChatMessage>> {
        let (store, id) = (self.store.clone(), chat_id.to_string());
        blocking(move || {
            chats::get(&store, &id)?;
            chats::messages(&store, &id)
        })
        .await
    }

    fn slot(&self, chat_id: &str) -> Slot {
        let Ok(mut map) = self.runtimes.lock() else {
            return Arc::new(Mutex::new(None));
        };
        map.entry(chat_id.to_string()).or_default().clone()
    }

    fn existing_runtime(&self, chat_id: &str) -> Option<Slot> {
        self.runtimes
            .lock()
            .ok()
            .and_then(|m| m.get(chat_id).cloned())
    }

    async fn binding_session(
        &self,
        rec: &chats::ChatRecord,
        action: &AgentAction,
    ) -> Result<(String, String)> {
        let action_ref = match action {
            AgentAction::Review { r#ref, .. } | AgentAction::Summarize { r#ref } => {
                Some(r#ref.clone())
            }
            _ => None,
        };
        if let Some(r) = action_ref {
            let session = self
                .backend
                .get_or_create_session(&rec.chat.repo_path, &r)
                .await?;
            let (store, chat_id, sid) =
                (self.store.clone(), rec.chat.id.clone(), session.id.clone());
            blocking(move || chats::set_review_session(&store, &chat_id, &sid)).await?;
            return Ok((session.id, session.r#ref));
        }
        if let Some(sid) = &rec.review_session_id {
            if let Ok(session) = self.backend.session(sid).await {
                return Ok((session.id, session.r#ref));
            }
        }
        let session = self
            .backend
            .get_or_create_session(&rec.chat.repo_path, DEFAULT_REF)
            .await?;
        Ok((session.id, session.r#ref))
    }

    async fn runtime(&self, rec: &chats::ChatRecord, binding: Binding) -> Result<Arc<Runtime>> {
        let slot = self.slot(&rec.chat.id);
        let mut guard = slot.lock().await;
        if let Some(rt) = guard.as_ref() {
            if rt.session.is_alive() {
                self.bridge.update(&rt.token, |b| *b = binding);
                return Ok(rt.clone());
            }
            self.bridge.unregister(&rt.token);
        }
        *guard = None;

        let Some(kind) = AgentKind::from_id(&rec.chat.agent_id) else {
            return Err(AppError::not_found(format!(
                "unknown agent `{}`",
                rec.chat.agent_id
            )));
        };
        let agents = self.detected_agents(false).await;
        let detected = agents.into_iter().find(|a| a.kind == kind);
        let Some(detected) = detected else {
            return Err(AppError::new(
                "agent_not_installed",
                format!("{} is not installed", kind.display_name()),
            ));
        };
        let Some(launch) = detected.launch.clone() else {
            let note = detected.info.note.unwrap_or_else(|| "not installed".into());
            return Err(AppError::new(
                "agent_not_installed",
                format!("{}: {note}", kind.display_name()),
            ));
        };
        if detected.info.authenticated == Some(false) {
            let note = detected.info.note.unwrap_or_default();
            return Err(AppError::new(
                "agent_auth_required",
                format!("{} is not signed in. {note}", kind.display_name()),
            ));
        }
        if !self.mcp_binary.exists() {
            return Err(AppError::new(
                "agent_failed",
                format!("diffity-mcp not found at {}", self.mcp_binary.display()),
            ));
        }
        self.bridge.ensure_started().await?;

        let token = self.bridge.register(binding);
        let started = AgentSession::start(SessionConfig {
            launch,
            cwd: PathBuf::from(&rec.chat.repo_path),
            mode: rec.chat.mode,
            mcp_command: self.mcp_binary.clone(),
            mcp_args: vec![
                "--socket".into(),
                self.bridge.socket_path().to_string_lossy().into_owned(),
                "--token".into(),
                token.clone(),
            ],
            resume_session_id: rec.acp_session_id.clone(),
            broker: self.broker.clone(),
        })
        .await;
        let session = match started {
            Ok(s) => s,
            Err(e) => {
                self.bridge.unregister(&token);
                if e.code == "agent_auth_required" {
                    *self.detected.lock().await = None;
                }
                return Err(e);
            }
        };
        if rec.acp_session_id.as_deref() != Some(session.acp_session_id.as_str()) {
            let (store, chat_id, acp) = (
                self.store.clone(),
                rec.chat.id.clone(),
                session.acp_session_id.clone(),
            );
            blocking(move || chats::set_acp_session(&store, &chat_id, &acp)).await?;
        }
        let rt = Arc::new(Runtime { session, token });
        *guard = Some(rt.clone());
        Ok(rt)
    }

    pub async fn send_prompt(
        &self,
        chat_id: &str,
        text: String,
        context: Vec<ContextChip>,
        action: AgentAction,
        on_event: Box<dyn Fn(AgentEvent) + Send + Sync>,
    ) -> Result<()> {
        let (store, id) = (self.store.clone(), chat_id.to_string());
        let rec = blocking(move || chats::get(&store, &id)).await?;
        let kind = AgentKind::from_id(&rec.chat.agent_id);
        let (session_id, session_ref) = self.binding_session(&rec, &action).await?;
        let binding = Binding {
            repo_path: rec.chat.repo_path.clone(),
            session_id,
            r#ref: session_ref.clone(),
            mode: rec.chat.mode,
            agent_name: kind
                .map(|k| k.display_name())
                .unwrap_or("Agent")
                .to_string(),
        };

        let (store, id) = (self.store.clone(), chat_id.to_string());
        let first_turn = blocking(move || chats::count_messages(&store, &id)).await? == 0;
        let prompt = prompts::build_prompt(
            rec.chat.mode,
            &action,
            &session_ref,
            first_turn,
            &text,
            &context,
        );
        if prompt.trim().is_empty() {
            return Err(AppError::invalid("prompt is empty"));
        }

        let rt = self.runtime(&rec, binding).await?;

        let user = ChatMessageContent::User(UserMessageContent {
            text: text.clone(),
            context,
        });
        let (store, id) = (self.store.clone(), chat_id.to_string());
        blocking(move || chats::add_message(&store, &id, ChatRole::User, &user)).await?;

        let sink: EventSink = Arc::from(on_event);
        let events = rt.session.prompt(prompt, sink).await?;

        let (store, id) = (self.store.clone(), chat_id.to_string());
        let content = ChatMessageContent::Agent(events);
        blocking(move || chats::add_message(&store, &id, ChatRole::Agent, &content)).await?;
        Ok(())
    }

    pub async fn cancel_prompt(&self, chat_id: &str) -> Result<()> {
        let Some(slot) = self.existing_runtime(chat_id) else {
            return Ok(());
        };
        let rt = slot.lock().await.clone();
        if let Some(rt) = rt {
            rt.session.cancel();
        }
        Ok(())
    }

    pub async fn respond_permission(
        &self,
        request_id: &str,
        option_id: Option<String>,
    ) -> Result<()> {
        if self.broker.respond(request_id, option_id) {
            return Ok(());
        }
        Err(AppError::not_found(format!(
            "permission request {request_id} is no longer pending"
        )))
    }

    async fn stop_runtime(&self, chat_id: &str) {
        let slot = self
            .runtimes
            .lock()
            .ok()
            .and_then(|mut m| m.remove(chat_id));
        let Some(slot) = slot else {
            return;
        };
        let rt = slot.lock().await.take();
        if let Some(rt) = rt {
            self.bridge.unregister(&rt.token);
            rt.session.close().await;
        }
    }

    pub async fn delete_chat(&self, chat_id: &str) -> Result<()> {
        self.stop_runtime(chat_id).await;
        let (store, id) = (self.store.clone(), chat_id.to_string());
        blocking(move || chats::delete(&store, &id)).await
    }

    /// Kills every agent process. Call on app exit.
    pub async fn shutdown(&self) {
        let ids: Vec<String> = self
            .runtimes
            .lock()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        for id in ids {
            self.stop_runtime(&id).await;
        }
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::internal(format!("task failed: {e}")))?
}
