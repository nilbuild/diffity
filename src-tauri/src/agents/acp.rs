use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, FileSystemCapabilities, Implementation,
    InitializeRequest, LoadSessionRequest, McpServer, McpServerStdio, NewSessionRequest,
    PromptRequest, ReadTextFileRequest, ReadTextFileResponse, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionConfigId, SessionConfigKind, SessionConfigOption, SessionConfigOptionCategory, SessionConfigSelect,
    SessionConfigSelectOptions, SessionModeState, SessionNotification, SetSessionConfigOptionRequest,
    SetSessionModeRequest, SessionUpdate, TextContent, ToolCallContent, WriteTextFileRequest,
    WriteTextFileResponse,
};
use agent_client_protocol::schema::ProtocolVersion;
use agent_client_protocol::{AcpAgent, AcpAgentConfig, Agent, ConnectionTo, LineDirection};
use serde::Serialize;
use tokio::sync::{mpsc, oneshot};

use crate::core::{AppError, Result};

use crate::agents::detect::{AgentKind, LaunchSpec};
use crate::agents::policy::{self, RunPermissions};
use crate::agents::run_state::{self, Ask, EventSink, RunState, Verdict};
use crate::agents::session::SessionConfig;
use crate::agents::types::{
    AgentEvent, ConfigChoice, ModelCatalog, ModelChoice, PermissionDiff, PermissionOption, PlanEntry, RunModel,
};

const STDERR_LINES: usize = 40;

struct Shared {
    state: RunState,
    /// Tool call titles and diffs by id; Codex sends permission requests with the id only.
    tool_titles: Mutex<HashMap<String, String>>,
    tool_diffs: Mutex<HashMap<String, PermissionDiff>>,
}

fn enum_str<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .ok()
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "other".into())
}

impl Shared {
    fn emit(&self, ev: AgentEvent) {
        self.state.emit(ev);
    }

    fn on_update(&self, update: SessionUpdate) {
        match update {
            SessionUpdate::AgentMessageChunk(chunk) => {
                let ContentBlock::Text(text) = chunk.content else {
                    return;
                };
                let message_id = chunk
                    .message_id
                    .map(|m| m.0.to_string())
                    .unwrap_or_else(|| self.state.fallback_message_id());
                self.emit(AgentEvent::Text {
                    message_id,
                    delta: text.text,
                });
            }
            SessionUpdate::AgentThoughtChunk(chunk) => {
                if let ContentBlock::Text(text) = chunk.content {
                    self.emit(AgentEvent::Thought { delta: text.text });
                }
            }
            SessionUpdate::ToolCall(call) => {
                let id = call.tool_call_id.0.to_string();
                if let Ok(mut titles) = self.tool_titles.lock() {
                    titles.insert(id.clone(), call.title.clone());
                }
                let diff = first_diff(&call.content);
                let mut locations: Vec<String> = call.locations.iter().map(|l| l.path.to_string_lossy().into_owned()).collect();
                if let Some(d) = diff.as_ref().filter(|d| !locations.contains(&d.path)) {
                    locations.push(d.path.clone());
                }
                if let (Some(diff), Ok(mut diffs)) = (diff, self.tool_diffs.lock()) {
                    diffs.insert(id, diff);
                }
                self.emit(AgentEvent::ToolCall {
                    id: call.tool_call_id.0.to_string(),
                    title: call.title,
                    kind: enum_str(&call.kind),
                    status: enum_str(&call.status),
                    locations,
                });
            }
            SessionUpdate::ToolCallUpdate(update) => {
                let status = update.fields.status.as_ref().map(enum_str);
                let diff = update.fields.content.as_deref().and_then(first_diff);
                let mut locations: Vec<String> = update
                    .fields
                    .locations
                    .iter()
                    .flatten()
                    .map(|l| l.path.to_string_lossy().into_owned())
                    .collect();
                if let Some(d) = diff.as_ref().filter(|d| !locations.contains(&d.path)) {
                    locations.push(d.path.clone());
                }
                if status.is_none() && update.fields.title.is_none() && locations.is_empty() {
                    return;
                }
                if let (Some(title), Ok(mut titles)) = (&update.fields.title, self.tool_titles.lock()) {
                    titles.insert(update.tool_call_id.0.to_string(), title.clone());
                }
                if let (Some(diff), Ok(mut diffs)) = (diff, self.tool_diffs.lock()) {
                    diffs.insert(update.tool_call_id.0.to_string(), diff);
                }
                self.emit(AgentEvent::ToolCallUpdate {
                    id: update.tool_call_id.0.to_string(),
                    status: status.unwrap_or_else(|| "in_progress".into()),
                    title: update.fields.title,
                    kind: update.fields.kind.as_ref().map(enum_str),
                    locations: (!locations.is_empty()).then_some(locations),
                });
            }
            SessionUpdate::Plan(plan) => {
                self.emit(AgentEvent::Plan {
                    entries: plan
                        .entries
                        .iter()
                        .map(|e| PlanEntry {
                            content: e.content.clone(),
                            status: enum_str(&e.status),
                        })
                        .collect(),
                });
            }
            _ => {}
        }
    }

    fn tool_title(&self, id: &str) -> Option<String> {
        self.tool_titles.lock().ok().and_then(|titles| titles.get(id).cloned())
    }

    fn tool_diff(&self, id: &str) -> Option<PermissionDiff> {
        self.tool_diffs.lock().ok().and_then(|diffs| diffs.get(id).cloned())
    }
}

fn first_diff(content: &[ToolCallContent]) -> Option<PermissionDiff> {
    content.iter().find_map(|c| match c {
        ToolCallContent::Diff(d) => Some(PermissionDiff {
            path: d.path.to_string_lossy().into_owned(),
            old_text: d.old_text.clone(),
            new_text: d.new_text.clone(),
        }),
        _ => None,
    })
}

fn permission_response(option: Option<String>) -> RequestPermissionResponse {
    match option {
        Some(id) => RequestPermissionResponse::new(RequestPermissionOutcome::Selected(
            SelectedPermissionOutcome::new(id),
        )),
        None => RequestPermissionResponse::new(RequestPermissionOutcome::Cancelled),
    }
}

fn pick_option(req: &RequestPermissionRequest, preferred: &str, family: &str) -> Option<String> {
    req.options
        .iter()
        .find(|o| enum_str(&o.kind) == preferred)
        .or_else(|| req.options.iter().find(|o| enum_str(&o.kind).starts_with(family)))
        .map(|o| o.option_id.0.to_string())
}

async fn handle_permission(
    shared: &Arc<Shared>,
    req: RequestPermissionRequest,
    responder: agent_client_protocol::Responder<RequestPermissionResponse>,
    cx: ConnectionTo<Agent>,
) -> agent_client_protocol::Result<()> {
    let kind = req
        .tool_call
        .fields
        .kind
        .as_ref()
        .map(enum_str)
        .unwrap_or_else(|| "other".into());
    let title = req
        .tool_call
        .fields
        .title
        .clone()
        .or_else(|| shared.tool_title(&req.tool_call.tool_call_id.0));
    tracing::debug!(
        "permission request kind={kind} title={title:?} options={:?}",
        req.options.iter().map(|o| enum_str(&o.kind)).collect::<Vec<_>>()
    );
    if run_state::is_own_tool(title.as_deref()) {
        return responder.respond(permission_response(pick_option(&req, "allow_always", "allow")));
    }

    let diff = req
        .tool_call
        .fields
        .content
        .as_deref()
        .and_then(first_diff)
        .or_else(|| shared.tool_diff(&req.tool_call.tool_call_id.0));
    let mut write_paths: Vec<PathBuf> = req
        .tool_call
        .fields
        .locations
        .as_ref()
        .map(|locs| locs.iter().map(|l| shared.state.resolve_path(&l.path)).collect())
        .unwrap_or_default();
    if let Some(d) = &diff {
        write_paths.push(shared.state.resolve_path(Path::new(&d.path)));
    }
    let is_edit = diff.is_some() || policy::is_edit_kind(&kind);
    match shared.state.verdict(&kind, is_edit, &write_paths) {
        Verdict::Deny => {
            return responder.respond(permission_response(pick_option(&req, "reject_once", "reject")));
        }
        Verdict::Allow => {
            if let Some(allow) = pick_option(&req, "allow_once", "allow") {
                shared.state.approve_writes(write_paths);
                return responder.respond(permission_response(Some(allow)));
            }
        }
        Verdict::Ask => {}
    }
    let options: Vec<(String, String)> = req
        .options
        .iter()
        .map(|o| (o.option_id.0.to_string(), enum_str(&o.kind)))
        .collect();

    let (request_id, rx) = shared.state.ask(Ask {
        title: title.unwrap_or_else(|| "Permission requested".into()),
        options: req
            .options
            .iter()
            .map(|o| PermissionOption {
                id: o.option_id.0.to_string(),
                name: o.name.clone(),
                kind: enum_str(&o.kind),
            })
            .collect(),
        diff,
    });
    let shared = shared.clone();
    cx.spawn(async move {
        let answer = rx.await.unwrap_or_default();
        let allowed = answer
            .option
            .as_ref()
            .and_then(|id| options.iter().find(|(oid, _)| oid == id))
            .is_some_and(|(_, kind)| kind.starts_with("allow"));
        shared.state.settle(&request_id, allowed, &answer, is_edit, write_paths);
        responder.respond(permission_response(answer.option))
    })
}

fn slice_lines(content: &str, line: Option<u32>, limit: Option<u32>) -> String {
    if line.is_none() && limit.is_none() {
        return content.to_string();
    }
    let start = line.unwrap_or(1).max(1) as usize - 1;
    let lines = content.split_inclusive('\n').skip(start);
    match limit {
        Some(n) => lines.take(n as usize).collect(),
        None => lines.collect(),
    }
}

async fn handle_read(
    shared: &Arc<Shared>,
    req: ReadTextFileRequest,
) -> agent_client_protocol::Result<ReadTextFileResponse> {
    let path = shared.state.resolve_path(&req.path);
    let content = tokio::fs::read_to_string(&path).await.map_err(|e| {
        agent_client_protocol::Error::resource_not_found(Some(path.display().to_string()))
            .data(serde_json::json!(e.to_string()))
    })?;
    Ok(ReadTextFileResponse::new(slice_lines(
        &content, req.line, req.limit,
    )))
}

async fn write_file(
    path: &Path,
    content: &str,
) -> agent_client_protocol::Result<WriteTextFileResponse> {
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(agent_client_protocol::Error::into_internal_error)?;
    }
    tokio::fs::write(path, content)
        .await
        .map_err(agent_client_protocol::Error::into_internal_error)?;
    Ok(WriteTextFileResponse::new())
}

async fn handle_write(
    shared: &Arc<Shared>,
    req: WriteTextFileRequest,
    responder: agent_client_protocol::Responder<WriteTextFileResponse>,
    cx: ConnectionTo<Agent>,
) -> agent_client_protocol::Result<()> {
    let state = &shared.state;
    if !policy::can_write_files(state.mode) {
        return responder.respond_with_error(agent_client_protocol::Error::new(
            -32001,
            "File writes are disabled in this mode. Describe the change instead.",
        ));
    }
    let path = state.resolve_path(&req.path);
    if state.take_approved_write(&path) || state.auto_allow("edit", true) {
        return match write_file(&path, &req.content).await {
            Ok(r) => responder.respond(r),
            Err(e) => responder.respond_with_error(e),
        };
    }
    let old_text = tokio::fs::read_to_string(&path).await.ok();
    let (request_id, rx) = state.ask(Ask {
        title: format!("Write {}", path.strip_prefix(&state.cwd).unwrap_or(&path).display()),
        options: run_state::allow_reject_options(),
        diff: Some(PermissionDiff {
            path: path.to_string_lossy().into_owned(),
            old_text,
            new_text: req.content.clone(),
        }),
    });
    let shared = shared.clone();
    cx.spawn(async move {
        let answer = rx.await.unwrap_or_default();
        let allowed = answer.option.as_deref() == Some("allow");
        shared.state.settle(&request_id, allowed, &answer, true, Vec::new());
        if !allowed {
            return responder.respond_with_error(agent_client_protocol::Error::new(
                -32001,
                "The user rejected this write.",
            ));
        }
        match write_file(&path, &req.content).await {
            Ok(r) => responder.respond(r),
            Err(e) => responder.respond_with_error(e),
        }
    })
}

enum Command {
    Prompt {
        text: String,
        mode_id: &'static str,
        /// Stop the run rather than prompt outside `mode_id` (`policy::mode_required`).
        mode_required: bool,
        model: RunModel,
        reply: oneshot::Sender<Result<String>>,
    },
    Cancel,
}

pub struct AcpSession {
    agent: AgentKind,
    commands: mpsc::UnboundedSender<Command>,
    shared: Arc<Shared>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub session_id: String,
}

/// Codex's ACP adapter relays a failed API call as reply text (`{"type":"error",...}`) and ends the
/// turn normally, so a run that did nothing but that has failed.
fn relayed_api_error(events: &[AgentEvent]) -> Option<String> {
    if events.iter().any(|e| matches!(e, AgentEvent::ToolCall { .. })) {
        return None;
    }
    events.iter().find_map(|e| {
        let AgentEvent::Text { delta, .. } = e else {
            return None;
        };
        delta.lines().find_map(|line| {
            let v: serde_json::Value = serde_json::from_str(line.trim()).ok()?;
            (v["type"] == "error").then(|| {
                v["error"]["message"]
                    .as_str()
                    .unwrap_or(line.trim())
                    .to_string()
            })
        })
    })
}

fn classify(err: &agent_client_protocol::Error, stderr: &str) -> AppError {
    let code: i32 = err.code.into();
    let text = format!(
        "{} {}",
        err.message,
        err.data.as_ref().map(|d| d.to_string()).unwrap_or_default()
    )
    .to_lowercase();
    let auth = code == -32000
        || text.contains("authenticat")
        || text.contains("auth_required")
        || text.contains("not logged in")
        || text.contains("/login")
        || stderr.to_lowercase().contains("please login");
    let detail = if stderr.trim().is_empty() {
        err.message.clone()
    } else {
        format!("{}\n{}", err.message, stderr.trim())
    };
    if auth {
        return AppError::new("agent_auth_required", detail);
    }
    AppError::new("agent_failed", detail)
}

impl AcpSession {
    pub async fn start(config: SessionConfig) -> Result<Self> {
        let shared = Arc::new(Shared {
            state: RunState::new(config.mode, config.cwd.clone(), config.broker.clone(), config.edit_rejected.clone()),
            tool_titles: Mutex::new(HashMap::new()),
            tool_diffs: Mutex::new(HashMap::new()),
        });

        let stderr_shared = shared.clone();
        let agent = AcpAgent::new(
            AcpAgentConfig::new(config.launch.command.clone())
                .args(config.launch.args.clone())
                .envs(config.launch.env.clone())
                .env("DIFFITY", "1"),
        )
        .with_debug(move |line, dir| {
            if !matches!(dir, LineDirection::Stderr) {
                return;
            }
            tracing::debug!(target: "crate::agents::stderr", "{line}");
            stderr_shared.state.push_stderr(line);
        });

        let mcp = McpServer::Stdio(
            McpServerStdio::new("diffity", config.mcp_command.clone())
                .args(config.mcp_args.clone()),
        );
        let (cmd_tx, mut cmd_rx) = mpsc::unbounded_channel::<Command>();
        let (ready_tx, ready_rx) = oneshot::channel::<Result<String>>();
        let ready_tx = Arc::new(Mutex::new(Some(ready_tx)));

        let s_notif = shared.clone();
        let s_read = shared.clone();
        let s_write = shared.clone();
        let s_perm = shared.clone();
        let s_main = shared.clone();
        let s_err = shared.clone();
        let ready_main = ready_tx.clone();
        let cwd = config.cwd.clone();
        let extra_dirs = config.additional_dirs.clone();
        let resume = config.resume_session_id.clone();

        let task = tokio::spawn(async move {
            let result = agent_client_protocol::Client
                .builder()
                .name("diffity")
                .on_receive_notification(
                    async move |n: SessionNotification, _cx| {
                        s_notif.on_update(n.update);
                        Ok(())
                    },
                    agent_client_protocol::on_receive_notification!(),
                )
                .on_receive_request(
                    async move |req: ReadTextFileRequest, responder, _cx| match handle_read(&s_read, req).await {
                        Ok(r) => responder.respond(r),
                        Err(e) => responder.respond_with_error(e),
                    },
                    agent_client_protocol::on_receive_request!(),
                )
                .on_receive_request(
                    async move |req: WriteTextFileRequest, responder, cx| handle_write(&s_write, req, responder, cx).await,
                    agent_client_protocol::on_receive_request!(),
                )
                .on_receive_request(
                    async move |req: RequestPermissionRequest, responder, cx| handle_permission(&s_perm, req, responder, cx).await,
                    agent_client_protocol::on_receive_request!(),
                )
                .connect_with(agent, async move |cx: ConnectionTo<Agent>| {
                    let init = cx
                        .send_request(
                            InitializeRequest::new(ProtocolVersion::V1)
                                .client_capabilities(
                                    ClientCapabilities::new()
                                        .fs(FileSystemCapabilities::new().read_text_file(true).write_text_file(true))
                                        .terminal(false),
                                )
                                .client_info(Implementation::new("diffity", env!("CARGO_PKG_VERSION"))),
                        )
                        .block_task()
                        .await?;

                    let mut session_id: Option<String> = None;
                    let mut modes: Option<SessionModeState> = None;
                    let mut options: Vec<SessionConfigOption> = Vec::new();
                    if let (Some(prev), true) = (resume, init.agent_capabilities.load_session) {
                        let load = cx
                            .send_request(LoadSessionRequest::new(prev.clone(), cwd.clone())
                                    .additional_directories(extra_dirs.clone())
                                    .mcp_servers(vec![mcp.clone()]))
                            .block_task()
                            .await;
                        match load {
                            Ok(loaded) => {
                                modes = loaded.modes;
                                options = loaded.config_options.unwrap_or_default();
                                session_id = Some(prev);
                            }
                            Err(e) => tracing::warn!("session/load failed, starting a new session: {e:?}"),
                        }
                    }
                    let session_id = match session_id {
                        Some(id) => id,
                        None => {
                            let created = cx
                                .send_request(NewSessionRequest::new(cwd.clone())
                                    .additional_directories(extra_dirs.clone())
                                    .mcp_servers(vec![mcp.clone()]))
                                .block_task()
                                .await?;
                            tracing::debug!("session/new modes={:?}", created.modes);
                            modes = created.modes;
                            options = created.config_options.unwrap_or_default();
                            created.session_id.0.to_string()
                        }
                    };
                    if let Some(tx) = ready_main.lock().ok().and_then(|mut t| t.take()) {
                        let _ = tx.send(Ok(session_id.clone()));
                    }

                    let mut current_mode = modes.as_ref().map(|m| m.current_mode_id.0.to_string());
                    let available: Vec<String> = modes
                        .map(|m| m.available_modes.into_iter().map(|mode| mode.id.0.to_string()).collect())
                        .unwrap_or_default();
                    while let Some(cmd) = cmd_rx.recv().await {
                        let Command::Prompt { text, mode_id, mode_required, model, reply } = cmd else {
                            continue;
                        };
                        apply_run_model(&cx, &session_id, &mut options, &model).await;
                        let switched = match mode_switch(&available, current_mode.as_deref(), &options, mode_id) {
                            ModeSwitch::Keep => Ok(()),
                            ModeSwitch::SetMode => cx
                                .send_request(SetSessionModeRequest::new(session_id.clone(), mode_id))
                                .block_task()
                                .await
                                .map(|_| current_mode = Some(mode_id.to_string()))
                                .map_err(|e| format!("{e:?}")),
                            ModeSwitch::ConfigOption(option_id) => cx
                                .send_request(SetSessionConfigOptionRequest::new(session_id.clone(), option_id, mode_id))
                                .block_task()
                                .await
                                .map(|response| options = response.config_options)
                                .map_err(|e| format!("{e:?}")),
                            ModeSwitch::Unavailable => Err("the agent does not offer it".to_string()),
                        };
                        if let Err(e) = switched {
                            if mode_required {
                                let _ = reply.send(Err(AppError::new(
                                    "agent_failed",
                                    format!("Could not switch the agent to its `{mode_id}` mode, so the run was stopped: {e}"),
                                )));
                                continue;
                            }
                            tracing::warn!("switching to mode {mode_id} failed: {e}");
                        }
                        let prompt = cx
                            .send_request(PromptRequest::new(
                                session_id.clone(),
                                vec![ContentBlock::Text(TextContent::new(text))],
                            ))
                            .block_task();
                        tokio::pin!(prompt);
                        loop {
                            tokio::select! {
                                res = &mut prompt => {
                                    let out = res
                                        .map(|r| enum_str(&r.stop_reason))
                                        .map_err(|e| classify(&e, &s_main.state.stderr_tail()));
                                    let _ = reply.send(out);
                                    break;
                                }
                                next = cmd_rx.recv() => match next {
                                    Some(Command::Cancel) => {
                                        s_main.state.cancel_pending();
                                        let _ = cx.send_notification(CancelNotification::new(session_id.clone()));
                                    }
                                    Some(Command::Prompt { reply: busy, .. }) => {
                                        let _ = busy.send(Err(AppError::new("agent_busy", "a prompt is already running")));
                                    }
                                    None => return Ok(()),
                                },
                            }
                        }
                    }
                    Ok(())
                })
                .await;
            let err = match result {
                Ok(()) => AppError::new("agent_failed", "agent connection closed"),
                Err(e) => classify(&e, &s_err.state.stderr_tail()),
            };
            if let Some(tx) = ready_tx.lock().ok().and_then(|mut t| t.take()) {
                let _ = tx.send(Err(err));
            }
        });

        let session_id = match ready_rx.await {
            Ok(Ok(id)) => id,
            Ok(Err(mut e)) => {
                let tail = shared.state.stderr_tail();
                if !tail.is_empty() && !e.message.contains(&tail) {
                    e.message = format!("{}\n{}", e.message, tail);
                }
                return Err(e);
            }
            Err(_) => {
                return Err(AppError::new(
                    "agent_failed",
                    format!("agent exited during startup\n{}", shared.state.stderr_tail()),
                ));
            }
        };
        Ok(Self {
            agent: config.agent,
            commands: cmd_tx,
            shared,
            task: Mutex::new(Some(task)),
            session_id,
        })
    }

    pub fn is_alive(&self) -> bool {
        self.task
            .lock()
            .map(|t| t.as_ref().is_some_and(|h| !h.is_finished()))
            .unwrap_or(false)
    }

    pub async fn prompt(
        &self,
        text: String,
        run: RunPermissions,
        model: RunModel,
        sink: EventSink,
    ) -> Result<Vec<AgentEvent>> {
        self.shared.state.begin_turn(run, sink)?;
        let mut guard = TurnGuard {
            session: self,
            finished: false,
        };
        let (reply_tx, reply_rx) = oneshot::channel();
        let sent = self.commands.send(Command::Prompt {
            text,
            mode_id: run.acp_mode_id(self.agent),
            mode_required: policy::mode_required(self.agent),
            model,
            reply: reply_tx,
        });
        let outcome = match sent {
            Ok(()) => reply_rx.await.unwrap_or_else(|_| {
                Err(AppError::new(
                    "agent_failed",
                    format!("agent process exited\n{}", self.shared.state.stderr_tail()),
                ))
            }),
            Err(_) => Err(AppError::new(
                "agent_failed",
                "agent process is not running",
            )),
        };
        let relayed = match (&outcome, self.agent) {
            (Ok(_), AgentKind::Codex) => self.shared.state.with_events(relayed_api_error).flatten(),
            _ => None,
        };
        let final_event = match &outcome {
            _ if relayed.is_some() => AgentEvent::Error {
                code: "agent_failed".into(),
                message: relayed.unwrap_or_default(),
            },
            Ok(stop) => AgentEvent::Done {
                stop_reason: stop.clone(),
            },
            Err(e) => AgentEvent::Error {
                code: e.code.clone(),
                message: e.message.clone(),
            },
        };
        self.shared.emit(final_event);
        guard.finished = true;
        Ok(self.shared.state.end_turn())
    }

    pub fn cancel(&self) {
        self.shared.state.cancel_pending();
        let _ = self.commands.send(Command::Cancel);
    }

    fn abort(&self) -> Option<tokio::task::JoinHandle<()>> {
        self.shared.state.cancel_pending();
        let handle = self.task.lock().ok().and_then(|mut t| t.take())?;
        handle.abort();
        Some(handle)
    }

    /// Stops the connection and waits until the agent process group has been killed.
    pub async fn close(&self) {
        if let Some(handle) = self.abort() {
            let _ = tokio::time::timeout(std::time::Duration::from_secs(3), handle).await;
        }
    }
}

fn select_option(
    options: &[SessionConfigOption],
    category: SessionConfigOptionCategory,
) -> Option<(&SessionConfigOption, &SessionConfigSelect)> {
    options.iter().find_map(|option| match &option.kind {
        SessionConfigKind::Select(select) if option.category.as_ref() == Some(&category) => Some((option, select)),
        _ => None,
    })
}

fn select_choices(select: &SessionConfigSelect) -> Vec<ConfigChoice> {
    let flat: Vec<_> = match &select.options {
        SessionConfigSelectOptions::Ungrouped(options) => options.iter().collect(),
        SessionConfigSelectOptions::Grouped(groups) => groups.iter().flat_map(|g| g.options.iter()).collect(),
        _ => Vec::new(),
    };
    flat.into_iter()
        .map(|o| ConfigChoice {
            value: o.value.0.to_string(),
            name: o.name.clone(),
            description: o.description.clone().filter(|d| !d.trim().is_empty()),
        })
        .collect()
}

/// Sets the run's model, then its effort (the levels depend on the model). Values the agent no
/// longer offers are skipped, so the agent's own setting applies.
async fn apply_run_model(
    cx: &ConnectionTo<Agent>,
    session_id: &str,
    options: &mut Vec<SessionConfigOption>,
    wanted: &RunModel,
) {
    let steps = [
        (SessionConfigOptionCategory::Model, wanted.model.as_deref()),
        (SessionConfigOptionCategory::ThoughtLevel, wanted.effort.as_deref()),
    ];
    for (category, value) in steps {
        let Some(value) = value else {
            continue;
        };
        let Some((option, select)) = select_option(options, category.clone()) else {
            tracing::warn!("agent offers no {category:?} option; ignoring {value}");
            continue;
        };
        if select.current_value.0.as_ref() == value {
            continue;
        }
        if !select_choices(select).iter().any(|c| c.value == value) {
            tracing::warn!("agent does not offer {value} for {category:?}");
            continue;
        }
        let request = SetSessionConfigOptionRequest::new(session_id.to_string(), option.id.clone(), value);
        match cx.send_request(request).block_task().await {
            Ok(response) => *options = response.config_options,
            Err(e) => tracing::warn!("session/set_config_option {value} failed: {e:?}"),
        }
    }
}

/// Starts a throwaway session to read the models the agent offers and each model's effort levels.
/// Nothing is prompted, so it costs no tokens.
pub async fn probe_models(launch: LaunchSpec, cwd: PathBuf) -> Result<Option<ModelCatalog>> {
    let stderr: Arc<Mutex<VecDeque<String>>> = Arc::default();
    let stderr_sink = stderr.clone();
    let agent = AcpAgent::new(
        AcpAgentConfig::new(launch.command.clone())
            .args(launch.args.clone())
            .envs(launch.env.clone())
            .env("DIFFITY", "1"),
    )
    .with_debug(move |line, dir| {
        if !matches!(dir, LineDirection::Stderr) {
            return;
        }
        if let Ok(mut buf) = stderr_sink.lock() {
            if buf.len() >= STDERR_LINES {
                buf.pop_front();
            }
            buf.push_back(line.to_string());
        }
    });
    let result = agent_client_protocol::Client
        .builder()
        .name("diffity")
        .connect_with(agent, async move |cx: ConnectionTo<Agent>| {
            cx.send_request(
                InitializeRequest::new(ProtocolVersion::V1)
                    .client_capabilities(ClientCapabilities::new().terminal(false))
                    .client_info(Implementation::new("diffity", env!("CARGO_PKG_VERSION"))),
            )
            .block_task()
            .await?;
            let created = cx.send_request(NewSessionRequest::new(cwd)).block_task().await?;
            let session_id = created.session_id.0.to_string();
            let mut options = created.config_options.unwrap_or_default();
            let Some((model_option, select)) = select_option(&options, SessionConfigOptionCategory::Model) else {
                return Ok(None);
            };
            let config_id = model_option.id.clone();
            let current_model = Some(select.current_value.0.to_string());
            let mut models = Vec::new();
            for choice in select_choices(select) {
                let switched = cx
                    .send_request(SetSessionConfigOptionRequest::new(
                        session_id.clone(),
                        config_id.clone(),
                        choice.value.as_str(),
                    ))
                    .block_task()
                    .await;
                let efforts = match switched {
                    Ok(response) => {
                        options = response.config_options;
                        select_option(&options, SessionConfigOptionCategory::ThoughtLevel)
                            .map(|(_, effort)| select_choices(effort))
                            .unwrap_or_default()
                    }
                    Err(e) => {
                        tracing::warn!("probe: switching to {} failed: {e:?}", choice.value);
                        Vec::new()
                    }
                };
                models.push(ModelChoice {
                    value: choice.value,
                    name: choice.name,
                    description: choice.description,
                    efforts,
                });
            }
            Ok(Some(ModelCatalog {
                models,
                current_model,
                fetched_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            }))
        })
        .await;
    result.map_err(|e| {
        let tail = stderr.lock().map(|b| b.iter().cloned().collect::<Vec<_>>().join("\n")).unwrap_or_default();
        classify(&e, &tail)
    })
}

#[derive(Debug, PartialEq)]
enum ModeSwitch {
    Keep,
    /// The mode is one of the session's ACP modes: `session/set_mode`.
    SetMode,
    /// The mode is a choice of this mode config option (OpenCode): `session/set_config_option`.
    ConfigOption(SessionConfigId),
    Unavailable,
}

/// How to put the session in `wanted`. Agents offer modes either as ACP session modes or as a config
/// option in the mode category; switch only when the mode isn't already active.
fn mode_switch(available: &[String], current: Option<&str>, options: &[SessionConfigOption], wanted: &str) -> ModeSwitch {
    if current == Some(wanted) {
        return ModeSwitch::Keep;
    }
    if available.iter().any(|m| m == wanted) {
        return ModeSwitch::SetMode;
    }
    let Some((option, select)) = select_option(options, SessionConfigOptionCategory::Mode) else {
        return ModeSwitch::Unavailable;
    };
    if select.current_value.0.as_ref() == wanted {
        return ModeSwitch::Keep;
    }
    if select_choices(select).iter().any(|c| c.value == wanted) {
        return ModeSwitch::ConfigOption(option.id.clone());
    }
    ModeSwitch::Unavailable
}

/// Cancels the turn and frees the turn slot when a `prompt` future is dropped before completion.
struct TurnGuard<'a> {
    session: &'a AcpSession,
    finished: bool,
}

impl Drop for TurnGuard<'_> {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        self.session.cancel();
        self.session.shared.state.end_turn();
    }
}

impl Drop for AcpSession {
    fn drop(&mut self) {
        self.abort();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slices_lines() {
        let c = "a\nb\nc\nd\n";
        assert_eq!(slice_lines(c, None, None), c);
        assert_eq!(slice_lines(c, Some(2), Some(2)), "b\nc\n");
        assert_eq!(slice_lines(c, Some(3), None), "c\nd\n");
        assert_eq!(slice_lines(c, None, Some(1)), "a\n");
        assert_eq!(slice_lines(c, Some(10), None), "");
    }

    #[test]
    fn switches_mode_only_when_offered() {
        let offered = vec!["default".to_string(), "bypassPermissions".to_string()];
        assert_eq!(mode_switch(&offered, Some("default"), &[], "bypassPermissions"), ModeSwitch::SetMode);
        assert_eq!(mode_switch(&offered, Some("bypassPermissions"), &[], "bypassPermissions"), ModeSwitch::Keep);
        assert_eq!(mode_switch(&offered, Some("bypassPermissions"), &[], "default"), ModeSwitch::SetMode);
        assert_eq!(mode_switch(&["default".to_string()], Some("default"), &[], "bypassPermissions"), ModeSwitch::Unavailable);
        assert_eq!(mode_switch(&[], None, &[], "bypassPermissions"), ModeSwitch::Unavailable);
    }

    /// OpenCode lists its agents as a mode config option, not as ACP modes (as OpenCode 2.0.26 sends it).
    fn opencode_mode_option(current: &str) -> Vec<SessionConfigOption> {
        let option = serde_json::json!({
            "id": "mode",
            "name": "Mode",
            "category": "mode",
            "type": "select",
            "currentValue": current,
            "options": [{ "value": "build", "name": "build" }, { "value": "plan", "name": "plan" }],
        });
        vec![serde_json::from_value(option).unwrap()]
    }

    #[test]
    fn switches_mode_through_a_mode_config_option() {
        assert_eq!(
            mode_switch(&[], None, &opencode_mode_option("plan"), "build"),
            ModeSwitch::ConfigOption(SessionConfigId::new("mode")),
        );
        assert_eq!(mode_switch(&[], None, &opencode_mode_option("build"), "build"), ModeSwitch::Keep);
        assert_eq!(mode_switch(&[], None, &opencode_mode_option("yolo"), "review"), ModeSwitch::Unavailable);
    }

    #[test]
    fn spots_api_errors_relayed_as_text() {
        let text = |s: &str| AgentEvent::Text { message_id: "m".into(), delta: s.into() };
        let err = r#"Warning: Model metadata not found.

{"type":"error","status":400,"error":{"type":"invalid_request_error","message":"needs a newer Codex"}}

"#;
        assert_eq!(relayed_api_error(&[text(err)]).as_deref(), Some("needs a newer Codex"));
        assert_eq!(relayed_api_error(&[text("Looks good, no issues.")]), None);
        let tool = AgentEvent::ToolCall { id: "t".into(), title: "x".into(), kind: "read".into(), status: "completed".into(), locations: vec![] };
        assert_eq!(relayed_api_error(&[tool, text(err)]), None);
    }

    #[test]
    fn classifies_auth_errors() {
        let e = agent_client_protocol::Error::auth_required();
        assert_eq!(classify(&e, "").code, "agent_auth_required");
        let e = agent_client_protocol::Error::internal_error();
        assert_eq!(classify(&e, "boom").code, "agent_failed");
    }
}
