use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use agent_client_protocol::schema::v1::{
    CancelNotification, ClientCapabilities, ContentBlock, FileSystemCapabilities, Implementation,
    InitializeRequest, LoadSessionRequest, McpServer, McpServerStdio, NewSessionRequest,
    PromptRequest, ReadTextFileRequest, ReadTextFileResponse, RequestPermissionOutcome,
    RequestPermissionRequest, RequestPermissionResponse, SelectedPermissionOutcome,
    SessionConfigKind, SessionConfigOption, SessionConfigOptionCategory, SessionConfigSelect,
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
use crate::agents::policy::{self, PermissionDecision, RunPermissions};
use crate::agents::types::{
    AgentEvent, AgentMode, ConfigChoice, ModelCatalog, ModelChoice, PermissionDiff, PermissionOption, PlanEntry,
    RunModel,
};

pub type EventSink = Arc<dyn Fn(AgentEvent) + Send + Sync>;

const STDERR_LINES: usize = 40;

/// The user's answer to a permission request. `for_run` means "Allow for this run"; `skip_prompts`
/// means "Don't ask again", which also stops prompts for the rest of the current run.
#[derive(Debug, Default)]
struct Choice {
    option: Option<String>,
    for_run: bool,
    skip_prompts: bool,
}

#[derive(Default)]
pub struct PermissionBroker {
    pending: Mutex<HashMap<String, oneshot::Sender<Choice>>>,
}

impl PermissionBroker {
    fn register(&self) -> (String, oneshot::Receiver<Choice>) {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        if let Ok(mut map) = self.pending.lock() {
            map.insert(id.clone(), tx);
        }
        (id, rx)
    }

    pub fn respond(
        &self,
        request_id: &str,
        option_id: Option<String>,
        for_run: bool,
        skip_prompts: bool,
    ) -> bool {
        let tx = self
            .pending
            .lock()
            .ok()
            .and_then(|mut m| m.remove(request_id));
        match tx {
            Some(tx) => tx
                .send(Choice {
                    option: option_id,
                    for_run,
                    skip_prompts,
                })
                .is_ok(),
            None => false,
        }
    }

    fn cancel_all(&self, ids: &[String]) {
        for id in ids {
            self.respond(id, None, false, false);
        }
    }
}

struct Turn {
    sink: EventSink,
    events: Vec<AgentEvent>,
    fallback_message_id: String,
}

struct Shared {
    mode: AgentMode,
    cwd: PathBuf,
    broker: Arc<PermissionBroker>,
    turn: Mutex<Option<Turn>>,
    pending: Mutex<HashSet<String>>,
    approved_writes: Mutex<HashSet<PathBuf>>,
    stderr: Mutex<VecDeque<String>>,
    edit_rejected: Arc<AtomicBool>,
    run: Mutex<RunPermissions>,
    run_approved: AtomicBool,
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

fn merge_event(events: &mut Vec<AgentEvent>, ev: AgentEvent) {
    match (events.last_mut(), &ev) {
        (
            Some(AgentEvent::Text { message_id, delta }),
            AgentEvent::Text {
                message_id: id,
                delta: d,
            },
        ) if message_id == id => {
            delta.push_str(d);
        }
        (Some(AgentEvent::Thought { delta }), AgentEvent::Thought { delta: d }) => {
            delta.push_str(d)
        }
        _ => events.push(ev),
    }
}

impl Shared {
    fn emit(&self, ev: AgentEvent) {
        let sink = {
            let Ok(mut turn) = self.turn.lock() else {
                return;
            };
            let Some(turn) = turn.as_mut() else {
                return;
            };
            merge_event(&mut turn.events, ev.clone());
            turn.sink.clone()
        };
        sink(ev);
    }

    fn fallback_message_id(&self) -> String {
        self.turn
            .lock()
            .ok()
            .and_then(|t| t.as_ref().map(|t| t.fallback_message_id.clone()))
            .unwrap_or_default()
    }

    fn resolve_path(&self, path: &Path) -> PathBuf {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.cwd.join(path)
        }
    }

    fn stderr_tail(&self) -> String {
        self.stderr
            .lock()
            .map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default()
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
                    .unwrap_or_else(|| self.fallback_message_id());
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
                if let (Some(diff), Ok(mut diffs)) = (first_diff(&call.content), self.tool_diffs.lock()) {
                    diffs.insert(id, diff);
                }
                self.emit(AgentEvent::ToolCall {
                    id: call.tool_call_id.0.to_string(),
                    title: call.title,
                    kind: enum_str(&call.kind),
                    status: enum_str(&call.status),
                    locations: call
                        .locations
                        .iter()
                        .map(|l| l.path.to_string_lossy().into_owned())
                        .collect(),
                });
            }
            SessionUpdate::ToolCallUpdate(update) => {
                let status = update.fields.status.as_ref().map(enum_str);
                if status.is_none() && update.fields.title.is_none() {
                    return;
                }
                if let (Some(title), Ok(mut titles)) = (&update.fields.title, self.tool_titles.lock()) {
                    titles.insert(update.tool_call_id.0.to_string(), title.clone());
                }
                let diff = update.fields.content.as_deref().and_then(first_diff);
                if let (Some(diff), Ok(mut diffs)) = (diff, self.tool_diffs.lock()) {
                    diffs.insert(update.tool_call_id.0.to_string(), diff);
                }
                self.emit(AgentEvent::ToolCallUpdate {
                    id: update.tool_call_id.0.to_string(),
                    status: status.unwrap_or_else(|| "in_progress".into()),
                    title: update.fields.title,
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

    fn track(&self, id: &str, add: bool) {
        if let Ok(mut pending) = self.pending.lock() {
            if add {
                pending.insert(id.to_string());
            } else {
                pending.remove(id);
            }
        }
    }

    fn cancel_pending(&self) {
        let ids: Vec<String> = self
            .pending
            .lock()
            .map(|p| p.iter().cloned().collect())
            .unwrap_or_default();
        self.broker.cancel_all(&ids);
    }

    fn approve_writes(&self, paths: impl IntoIterator<Item = PathBuf>) {
        if let Ok(mut set) = self.approved_writes.lock() {
            set.extend(paths);
        }
    }

    fn mark_edit_rejected(&self) {
        self.edit_rejected.store(true, Ordering::SeqCst);
    }

    fn run(&self) -> RunPermissions {
        self.run
            .lock()
            .map(|r| *r)
            .unwrap_or(RunPermissions::AskEach)
    }

    fn auto_allow(&self, kind: &str, is_edit: bool) -> bool {
        policy::auto_allow(self.run(), kind, is_edit, self.run_approved.load(Ordering::SeqCst))
    }

    fn skip_prompts(&self) {
        if let Ok(mut run) = self.run.lock() {
            *run = run.skipping_prompts_if(true);
        }
    }

    fn record_allow(&self, is_edit: bool, for_run: bool) {
        if policy::approves_run(self.run(), is_edit, for_run) {
            self.run_approved.store(true, Ordering::SeqCst);
        }
    }

    fn tool_title(&self, id: &str) -> Option<String> {
        self.tool_titles.lock().ok().and_then(|titles| titles.get(id).cloned())
    }

    fn tool_diff(&self, id: &str) -> Option<PermissionDiff> {
        self.tool_diffs.lock().ok().and_then(|diffs| diffs.get(id).cloned())
    }

    fn take_approved_write(&self, path: &Path) -> bool {
        self.approved_writes
            .lock()
            .map(|mut s| s.remove(path))
            .unwrap_or(false)
    }
}

/// Diffity's own MCP tools are already gated by mode on the bridge, so they never need a user prompt.
/// Matched by exact name so a shell command that merely mentions a tool doesn't pass: Claude titles
/// them `mcp__diffity__add_comment`, Codex `mcp.diffity.add_comment`, opencode `tools.diffity.add_comment`.
fn is_own_tool(title: Option<&str>) -> bool {
    let Some(title) = title else {
        return false;
    };
    let lower = title.trim().to_ascii_lowercase();
    let Some(rest) = ["mcp__diffity__", "mcp.diffity.", "diffity.", "tools.diffity."]
        .iter()
        .find_map(|prefix| lower.strip_prefix(prefix))
    else {
        return false;
    };
    let name = rest.split(|c: char| c.is_whitespace() || c == '(').next().unwrap_or_default();
    policy::READ_TOOLS.iter().chain(policy::WRITE_TOOLS).any(|t| *t == name)
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
    if is_own_tool(title.as_deref()) {
        let allow = req
            .options
            .iter()
            .find(|o| enum_str(&o.kind) == "allow_always")
            .or_else(|| {
                req.options
                    .iter()
                    .find(|o| enum_str(&o.kind).starts_with("allow"))
            })
            .map(|o| o.option_id.0.to_string());
        return responder.respond(permission_response(allow));
    }

    if policy::permission_decision(shared.mode, &kind) == PermissionDecision::AutoDeny {
        let reject = req
            .options
            .iter()
            .find(|o| enum_str(&o.kind) == "reject_once")
            .or_else(|| {
                req.options
                    .iter()
                    .find(|o| enum_str(&o.kind).starts_with("reject"))
            })
            .map(|o| o.option_id.0.to_string());
        return responder.respond(permission_response(reject));
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
        .map(|locs| locs.iter().map(|l| shared.resolve_path(&l.path)).collect())
        .unwrap_or_default();
    if let Some(d) = &diff {
        write_paths.push(shared.resolve_path(Path::new(&d.path)));
    }
    let is_edit = diff.is_some() || policy::is_edit_kind(&kind);
    if shared.auto_allow(&kind, is_edit) {
        let allow = req
            .options
            .iter()
            .find(|o| enum_str(&o.kind) == "allow_once")
            .or_else(|| {
                req.options
                    .iter()
                    .find(|o| enum_str(&o.kind).starts_with("allow"))
            })
            .map(|o| o.option_id.0.to_string());
        if allow.is_some() {
            shared.approve_writes(write_paths);
            return responder.respond(permission_response(allow));
        }
    }
    let options: Vec<(String, String)> = req
        .options
        .iter()
        .map(|o| (o.option_id.0.to_string(), enum_str(&o.kind)))
        .collect();

    let (request_id, rx) = shared.broker.register();
    shared.track(&request_id, true);
    shared.emit(AgentEvent::PermissionRequest {
        request_id: request_id.clone(),
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
        let choice = answer.option;
        shared.track(&request_id, false);
        let allowed = choice
            .as_ref()
            .and_then(|id| options.iter().find(|(oid, _)| oid == id))
            .is_some_and(|(_, kind)| kind.starts_with("allow"));
        if allowed && answer.skip_prompts {
            shared.skip_prompts();
        }
        if allowed && policy::can_write_files(shared.mode) {
            shared.approve_writes(write_paths);
            shared.record_allow(is_edit, answer.for_run);
        }
        if !allowed && is_edit {
            shared.mark_edit_rejected();
        }
        responder.respond(permission_response(choice))
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
    let path = shared.resolve_path(&req.path);
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
    if !policy::can_write_files(shared.mode) {
        return responder.respond_with_error(agent_client_protocol::Error::new(
            -32001,
            "File writes are disabled in this mode. Describe the change instead.",
        ));
    }
    let path = shared.resolve_path(&req.path);
    if shared.take_approved_write(&path) || shared.auto_allow("edit", true) {
        return match write_file(&path, &req.content).await {
            Ok(r) => responder.respond(r),
            Err(e) => responder.respond_with_error(e),
        };
    }
    let old_text = tokio::fs::read_to_string(&path).await.ok();
    let (request_id, rx) = shared.broker.register();
    shared.track(&request_id, true);
    shared.emit(AgentEvent::PermissionRequest {
        request_id: request_id.clone(),
        title: format!(
            "Write {}",
            path.strip_prefix(&shared.cwd).unwrap_or(&path).display()
        ),
        options: vec![
            PermissionOption {
                id: "allow".into(),
                name: "Allow".into(),
                kind: "allow_once".into(),
            },
            PermissionOption {
                id: "reject".into(),
                name: "Reject".into(),
                kind: "reject_once".into(),
            },
        ],
        diff: Some(PermissionDiff {
            path: path.to_string_lossy().into_owned(),
            old_text,
            new_text: req.content.clone(),
        }),
    });
    let shared = shared.clone();
    cx.spawn(async move {
        let answer = rx.await.unwrap_or_default();
        shared.track(&request_id, false);
        if answer.option.as_deref() != Some("allow") {
            shared.mark_edit_rejected();
            return responder.respond_with_error(agent_client_protocol::Error::new(
                -32001,
                "The user rejected this write.",
            ));
        }
        if answer.skip_prompts {
            shared.skip_prompts();
        }
        shared.record_allow(true, answer.for_run);
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
        model: RunModel,
        reply: oneshot::Sender<Result<String>>,
    },
    Cancel,
}

pub struct SessionConfig {
    pub agent: AgentKind,
    pub launch: LaunchSpec,
    pub cwd: PathBuf,
    pub mode: AgentMode,
    pub mcp_command: PathBuf,
    pub mcp_args: Vec<String>,
    pub resume_session_id: Option<String>,
    pub broker: Arc<PermissionBroker>,
    /// Shared with the MCP bridge binding; reset at the start of every turn.
    pub edit_rejected: Arc<AtomicBool>,
}

pub struct AgentSession {
    agent: AgentKind,
    commands: mpsc::UnboundedSender<Command>,
    shared: Arc<Shared>,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    pub acp_session_id: String,
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

impl AgentSession {
    pub async fn start(config: SessionConfig) -> Result<Self> {
        let shared = Arc::new(Shared {
            mode: config.mode,
            cwd: config.cwd.clone(),
            broker: config.broker.clone(),
            turn: Mutex::new(None),
            pending: Mutex::new(HashSet::new()),
            approved_writes: Mutex::new(HashSet::new()),
            stderr: Mutex::new(VecDeque::new()),
            edit_rejected: config.edit_rejected.clone(),
            run: Mutex::new(if policy::can_write_files(config.mode) {
                RunPermissions::AskEach
            } else {
                RunPermissions::ReadOnly
            }),
            run_approved: AtomicBool::new(false),
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
            if let Ok(mut buf) = stderr_shared.stderr.lock() {
                if buf.len() >= STDERR_LINES {
                    buf.pop_front();
                }
                buf.push_back(line.to_string());
            }
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
                            .send_request(LoadSessionRequest::new(prev.clone(), cwd.clone()).mcp_servers(vec![mcp.clone()]))
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
                                .send_request(NewSessionRequest::new(cwd.clone()).mcp_servers(vec![mcp.clone()]))
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
                        let Command::Prompt { text, mode_id, model, reply } = cmd else {
                            continue;
                        };
                        apply_run_model(&cx, &session_id, &mut options, &model).await;
                        if needs_mode_switch(&available, current_mode.as_deref(), mode_id) {
                            let switched = cx
                                .send_request(SetSessionModeRequest::new(session_id.clone(), mode_id))
                                .block_task()
                                .await;
                            match switched {
                                Ok(_) => {
                                    tracing::debug!("session/set_mode {mode_id}");
                                    current_mode = Some(mode_id.to_string());
                                }
                                Err(e) => tracing::warn!("session/set_mode {mode_id} failed: {e:?}"),
                            }
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
                                        .map_err(|e| classify(&e, &s_main.stderr_tail()));
                                    let _ = reply.send(out);
                                    break;
                                }
                                next = cmd_rx.recv() => match next {
                                    Some(Command::Cancel) => {
                                        s_main.cancel_pending();
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
                Err(e) => classify(&e, &s_err.stderr_tail()),
            };
            if let Some(tx) = ready_tx.lock().ok().and_then(|mut t| t.take()) {
                let _ = tx.send(Err(err));
            }
        });

        let acp_session_id = match ready_rx.await {
            Ok(Ok(id)) => id,
            Ok(Err(mut e)) => {
                let tail = shared.stderr_tail();
                if !tail.is_empty() && !e.message.contains(&tail) {
                    e.message = format!("{}\n{}", e.message, tail);
                }
                return Err(e);
            }
            Err(_) => {
                return Err(AppError::new(
                    "agent_failed",
                    format!("agent exited during startup\n{}", shared.stderr_tail()),
                ));
            }
        };
        Ok(Self {
            agent: config.agent,
            commands: cmd_tx,
            shared,
            task: Mutex::new(Some(task)),
            acp_session_id,
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
        {
            let mut turn = self
                .shared
                .turn
                .lock()
                .map_err(|_| AppError::internal("turn lock poisoned"))?;
            if turn.is_some() {
                return Err(AppError::new("agent_busy", "a prompt is already running"));
            }
            self.shared.edit_rejected.store(false, Ordering::SeqCst);
            self.shared.run_approved.store(false, Ordering::SeqCst);
            if let Ok(mut current) = self.shared.run.lock() {
                *current = if policy::can_write_files(self.shared.mode)
                    || run == RunPermissions::ReadOnlyQuiet
                {
                    run
                } else {
                    RunPermissions::ReadOnly
                };
            }
            *turn = Some(Turn {
                sink,
                events: Vec::new(),
                fallback_message_id: uuid::Uuid::new_v4().to_string(),
            });
        }
        let mut guard = TurnGuard {
            session: self,
            finished: false,
        };
        let (reply_tx, reply_rx) = oneshot::channel();
        let sent = self.commands.send(Command::Prompt {
            text,
            mode_id: run.acp_mode_id(self.agent),
            model,
            reply: reply_tx,
        });
        let outcome = match sent {
            Ok(()) => reply_rx.await.unwrap_or_else(|_| {
                Err(AppError::new(
                    "agent_failed",
                    format!("agent process exited\n{}", self.shared.stderr_tail()),
                ))
            }),
            Err(_) => Err(AppError::new(
                "agent_failed",
                "agent process is not running",
            )),
        };
        let final_event = match &outcome {
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
        let turn = self.shared.turn.lock().ok().and_then(|mut t| t.take());
        Ok(turn.map(|t| t.events).unwrap_or_default())
    }

    pub fn cancel(&self) {
        self.shared.cancel_pending();
        let _ = self.commands.send(Command::Cancel);
    }

    fn abort(&self) -> Option<tokio::task::JoinHandle<()>> {
        self.shared.cancel_pending();
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

/// Switch only to a mode the agent advertises, and only when it isn't already active.
fn needs_mode_switch(available: &[String], current: Option<&str>, wanted: &str) -> bool {
    if current == Some(wanted) {
        return false;
    }
    available.iter().any(|m| m == wanted)
}

/// Cancels the turn and frees the turn slot when a `prompt` future is dropped before completion.
struct TurnGuard<'a> {
    session: &'a AgentSession,
    finished: bool,
}

impl Drop for TurnGuard<'_> {
    fn drop(&mut self) {
        if self.finished {
            return;
        }
        self.session.cancel();
        if let Ok(mut turn) = self.session.shared.turn.lock() {
            *turn = None;
        }
    }
}

impl Drop for AgentSession {
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
    fn merges_text_deltas() {
        let mut events = Vec::new();
        merge_event(
            &mut events,
            AgentEvent::Text {
                message_id: "m".into(),
                delta: "Hel".into(),
            },
        );
        merge_event(
            &mut events,
            AgentEvent::Text {
                message_id: "m".into(),
                delta: "lo".into(),
            },
        );
        merge_event(&mut events, AgentEvent::Thought { delta: "x".into() });
        merge_event(
            &mut events,
            AgentEvent::Text {
                message_id: "m".into(),
                delta: "!".into(),
            },
        );
        assert_eq!(events.len(), 3);
        assert!(matches!(&events[0], AgentEvent::Text { delta, .. } if delta == "Hello"));
    }

    #[test]
    fn recognizes_own_tools() {
        assert!(is_own_tool(Some("mcp__diffity__add_comment")));
        assert!(is_own_tool(Some("mcp.diffity.add_comment")));
        assert!(is_own_tool(Some("diffity.list_threads")));
        assert!(is_own_tool(Some("mcp__diffity__reply (MCP)")));
        assert!(!is_own_tool(Some("mcp__other__add_comment")));
        assert!(!is_own_tool(Some("Edit diffity.rs")));
        assert!(!is_own_tool(Some("echo mcp.diffity.add_comment")));
        assert!(!is_own_tool(Some("mcp.diffity.add_comment; rm -rf .")));
        assert!(!is_own_tool(Some("mcp.diffity.rm_rf")));
        assert!(!is_own_tool(None));
    }

    #[test]
    fn switches_mode_only_when_offered() {
        let offered = vec!["default".to_string(), "bypassPermissions".to_string()];
        assert!(needs_mode_switch(&offered, Some("default"), "bypassPermissions"));
        assert!(!needs_mode_switch(&offered, Some("bypassPermissions"), "bypassPermissions"));
        assert!(needs_mode_switch(&offered, Some("bypassPermissions"), "default"));
        assert!(!needs_mode_switch(&["default".to_string()], Some("default"), "bypassPermissions"));
        assert!(!needs_mode_switch(&[], None, "bypassPermissions"));
    }

    #[test]
    fn broker_carries_run_scope() {
        let broker = PermissionBroker::default();
        let (id, mut rx) = broker.register();
        assert!(broker.respond(&id, Some("allow".into()), true, false));
        let choice = rx.try_recv().unwrap();
        assert_eq!(choice.option.as_deref(), Some("allow"));
        assert!(choice.for_run);
        assert!(!broker.respond(&id, None, false, false), "answered requests are gone");
    }

    #[test]
    fn classifies_auth_errors() {
        let e = agent_client_protocol::Error::auth_required();
        assert_eq!(classify(&e, "").code, "agent_auth_required");
        let e = agent_client_protocol::Error::internal_error();
        assert_eq!(classify(&e, "boom").code, "agent_failed");
    }
}
