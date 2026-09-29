use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;

use diffity_core::store::Store;
use diffity_core::types::{ReviewSession, ReviewState};
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
    edit_rejected: Arc<std::sync::atomic::AtomicBool>,
}

type Slot = Arc<Mutex<Option<Arc<Runtime>>>>;

struct DetectCache {
    at: Instant,
    custom_paths: HashMap<String, String>,
    agents: Vec<DetectedAgent>,
}

pub struct AgentManager {
    store: Arc<Store>,
    mcp_binary: PathBuf,
    backend: Arc<dyn ReviewBackend>,
    bridge: Arc<McpBridge>,
    broker: Arc<PermissionBroker>,
    detected: Mutex<Option<DetectCache>>,
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

    /// `agent.<id>.path` settings (Settings → custom binary path) for the enabled agents.
    async fn custom_paths(&self) -> HashMap<String, String> {
        let store = self.store.clone();
        blocking(move || {
            let mut out = HashMap::new();
            for kind in AgentKind::ENABLED {
                if let Some(path) = store.get_setting(&kind.path_setting_key())? {
                    if !path.trim().is_empty() {
                        out.insert(kind.id().to_string(), path);
                    }
                }
            }
            Ok(out)
        })
        .await
        .unwrap_or_default()
    }

    async fn detected_agents(&self, force: bool) -> Vec<DetectedAgent> {
        let custom_paths = self.custom_paths().await;
        let mut cache = self.detected.lock().await;
        if let Some(c) = cache.as_ref() {
            if !force && c.at.elapsed() < DETECT_TTL && c.custom_paths == custom_paths {
                return c.agents.clone();
            }
        }
        let agents = detect::detect_all(&custom_paths).await;
        *cache = Some(DetectCache {
            at: Instant::now(),
            custom_paths,
            agents: agents.clone(),
        });
        agents
    }

    async fn permission_setting(&self) -> crate::policy::PermissionSetting {
        let store = self.store.clone();
        let value = blocking(move || store.get_setting(crate::policy::PERMISSIONS_SETTING))
            .await
            .ok()
            .flatten();
        crate::policy::PermissionSetting::parse(value.as_deref())
    }

    /// `refresh` bypasses the 30s detection cache (Settings → Re-detect).
    pub async fn list_agents(&self, refresh: bool) -> Result<Vec<AgentInfo>> {
        Ok(self
            .detected_agents(refresh)
            .await
            .into_iter()
            .map(|a| a.info)
            .collect())
    }

    pub async fn start_chat(&self, input: StartChat) -> Result<Chat> {
        let Some(kind) = AgentKind::from_id(&input.agent_id).filter(|k| k.is_enabled()) else {
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
            return self.bind_session(rec, session).await;
        }
        let target_session = match action {
            AgentAction::Thread { thread_id } => {
                let thread = self.backend.get_thread(thread_id).await?;
                if thread.pending {
                    return Err(AppError::invalid(
                        "the thread is still pending; submit the review first",
                    ));
                }
                Some(thread.session_id)
            }
            AgentAction::ReviewFeedback { review_id } => {
                let review = self.backend.get_review(review_id).await?;
                if review.state != ReviewState::Submitted {
                    return Err(AppError::invalid("submit the review before sending it to the agent"));
                }
                Some(review.session_id)
            }
            _ => None,
        };
        if let Some(sid) = target_session {
            let session = self.backend.session(&sid).await?;
            if session.repo_path != rec.chat.repo_path {
                return Err(AppError::invalid("the thread belongs to another repository"));
            }
            return self.bind_session(rec, session).await;
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

    async fn bind_session(
        &self,
        rec: &chats::ChatRecord,
        session: ReviewSession,
    ) -> Result<(String, String)> {
        let (store, chat_id, sid) = (self.store.clone(), rec.chat.id.clone(), session.id.clone());
        blocking(move || chats::set_review_session(&store, &chat_id, &sid)).await?;
        Ok((session.id, session.r#ref))
    }

    /// The review's path filter, keeping only files that are really in the diff.
    async fn review_paths(&self, repo_path: &str, session_ref: &str, action: &AgentAction) -> Result<Vec<String>> {
        let AgentAction::Review { paths, .. } = action else {
            return Ok(Vec::new());
        };
        let wanted: Vec<&str> = paths.iter().map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
        if wanted.is_empty() {
            return Ok(Vec::new());
        }
        let diff = self.backend.diff(repo_path, session_ref).await?;
        let kept: Vec<String> = wanted
            .into_iter()
            .filter(|p| diff.files.iter().any(|f| f.path == *p))
            .map(String::from)
            .collect();
        if kept.is_empty() {
            return Err(AppError::invalid("none of the selected files are in this diff"));
        }
        Ok(kept)
    }

    async fn review_brief(&self, action: &AgentAction) -> Result<Option<prompts::ReviewBrief>> {
        let AgentAction::ReviewFeedback { review_id } = action else {
            return Ok(None);
        };
        let review = self.backend.get_review(review_id).await?;
        Ok(Some(prompts::ReviewBrief {
            body: review.body,
            verdict: review.verdict,
            thread_ids: review.thread_ids,
        }))
    }

    async fn runtime(&self, rec: &chats::ChatRecord, mut binding: Binding) -> Result<Arc<Runtime>> {
        let slot = self.slot(&rec.chat.id);
        let mut guard = slot.lock().await;
        if let Some(rt) = guard.as_ref() {
            if rt.session.is_alive() {
                binding.edit_rejected = rt.edit_rejected.clone();
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

        let edit_rejected = binding.edit_rejected.clone();
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
            edit_rejected: edit_rejected.clone(),
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
        let rt = Arc::new(Runtime {
            session,
            token,
            edit_rejected,
        });
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
        if action.needs_write_mode() && !crate::policy::can_write_files(rec.chat.mode) {
            return Err(AppError::invalid(
                "this action edits code; start the chat in `resolve` mode",
            ));
        }
        let (session_id, session_ref) = self.binding_session(&rec, &action).await?;
        let review = self.review_brief(&action).await?;
        let paths = self.review_paths(&rec.chat.repo_path, &session_ref, &action).await?;
        let binding = Binding {
            repo_path: rec.chat.repo_path.clone(),
            session_id,
            r#ref: session_ref.clone(),
            mode: rec.chat.mode,
            agent_name: kind
                .map(|k| k.display_name())
                .unwrap_or("Agent")
                .to_string(),
            edit_rejected: Default::default(),
            paths,
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
            review.as_ref(),
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
        let setting = self.permission_setting().await;
        let run = crate::policy::run_permissions(rec.chat.mode, &action, setting);
        let events = rt.session.prompt(prompt, run, sink).await?;

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
        for_run: bool,
    ) -> Result<()> {
        if self.broker.respond(request_id, option_id, for_run) {
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
