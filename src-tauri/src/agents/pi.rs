//! pi (pi.dev) over its own RPC mode: JSON lines on stdin and stdout (`pi --mode rpc`, see pi's docs/rpc.md).
//!
//! pi runs tools without asking, so Diffity loads a small extension (`pi_extension.ts`) that sends every tool call
//! that could change something here first, as a `confirm` dialog, and blocks it unless Diffity says yes. The same
//! extension registers Diffity's MCP server for the session. Read-only chats also leave pi's shell and edit tools out.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, oneshot};

use crate::agents::detect::LaunchSpec;
use crate::agents::policy::{self, RunPermissions};
use crate::agents::run_state::{self, Ask, EventSink, RunState, Verdict};
use crate::agents::session::SessionConfig;
use crate::agents::types::{AgentEvent, ConfigChoice, ModelCatalog, ModelChoice, PermissionDiff, RunModel};
use crate::core::{AppError, Result};

const EXTENSION: &str = include_str!("pi_extension.ts");
const EXTENSION_NAME: &str = "diffity-extension.ts";
const PERMISSION_TITLE: &str = "diffity:permission";
/// The name Diffity's MCP server gets inside pi; its tools are `mcp__diffity__<tool>`, as the prompts say.
const SERVER: &str = "diffity";
/// The name Settings → Terminal registers Diffity under in pi's own config. A server in pi's config wins over one an
/// extension registers with the same name, so it can't be `diffity`.
pub const TERMINAL_SERVER: &str = "diffity-terminal";

/// pi's config folder: `PI_CODING_AGENT_DIR`, else `~/.pi/agent`.
fn agent_dir() -> Option<PathBuf> {
    std::env::var_os("PI_CODING_AGENT_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| Path::new(&home).join(".pi").join("agent")))
}

/// Environment variables pi signs in to a provider with (pi's docs/providers.md).
const PROVIDER_ENV: &[&str] = &[
    "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "OPENAI_API_KEY", "AZURE_OPENAI_API_KEY",
    "GEMINI_API_KEY", "GOOGLE_CLOUD_API_KEY", "GOOGLE_APPLICATION_CREDENTIALS", "OPENROUTER_API_KEY", "AI_GATEWAY_API_KEY",
    "MISTRAL_API_KEY", "GROQ_API_KEY", "XAI_API_KEY", "DEEPSEEK_API_KEY", "CEREBRAS_API_KEY", "FIREWORKS_API_KEY",
    "TOGETHER_API_KEY", "MOONSHOT_API_KEY", "KIMI_API_KEY", "ZAI_API_KEY", "MINIMAX_API_KEY", "NVIDIA_API_KEY",
    "HF_TOKEN", "COPILOT_GITHUB_TOKEN", "OPENCODE_API_KEY", "CLOUDFLARE_API_KEY", "BASETEN_API_KEY", "AWS_PROFILE",
    "AWS_ACCESS_KEY_ID", "AWS_BEARER_TOKEN_BEDROCK",
];

/// A cheap guess at whether pi can reach any model: a saved sign-in, custom models, or a provider key in the
/// environment. `false` only means none was spotted: an extension can bring its own provider.
pub fn has_credentials() -> bool {
    if PROVIDER_ENV.iter().any(|key| std::env::var_os(key).is_some_and(|v| !v.is_empty())) {
        return true;
    }
    let Some(dir) = agent_dir() else {
        return false;
    };
    let saved = std::fs::read_to_string(dir.join("auth.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<Value>(&text).ok())
        .is_some_and(|auth| auth.as_object().is_some_and(|providers| !providers.is_empty()));
    saved || dir.join("models.json").is_file()
}

/// Whether pi's user-level `mcp.json` defines `server`.
pub fn user_has_mcp_server(server: &str) -> bool {
    let Some(config) = agent_dir().and_then(|dir| std::fs::read_to_string(dir.join("mcp.json")).ok()) else {
        return false;
    };
    serde_json::from_str::<Value>(&config).is_ok_and(|json| json["mcpServers"].get(server).is_some())
}
/// An allowlist, so a review never gets pi's shell, edits, or an extension's own tools. MCP tools must be named in
/// it to be offered at all; the extension still asks Diffity before any MCP tool other than Diffity's runs.
const READ_ONLY_TOOLS: &str = "read,grep,find,ls,mcp__*";
/// pi's defaults are read, bash, edit and write; searching and listing need no shell.
const EXTRA_TOOLS: &str = "+grep,+find,+ls";
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);
const CALL_TIMEOUT: Duration = Duration::from_secs(30);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(3);

/// Writes the extension under `dir` when it is missing or out of date, and returns its path.
fn install_extension(dir: &Path) -> Result<PathBuf> {
    let path = dir.join("pi").join(EXTENSION_NAME);
    if std::fs::read_to_string(&path).is_ok_and(|current| current == EXTENSION) {
        return Ok(path);
    }
    let parent = path.parent().unwrap_or(dir);
    std::fs::create_dir_all(parent).map_err(|e| AppError::internal(format!("pi extension folder: {e}")))?;
    let staged = parent.join(format!(".diffity-extension-{}.ts", uuid::Uuid::new_v4()));
    std::fs::write(&staged, EXTENSION).map_err(|e| AppError::internal(format!("pi extension: {e}")))?;
    std::fs::rename(&staged, &path).map_err(|e| AppError::internal(format!("pi extension: {e}")))?;
    Ok(path)
}

/// Diffity's own Settings → Terminal registration in pi's config (`diffity-terminal`, or `diffity-dev` for the dev
/// build). It works for terminal runs, not for a chat, so in-app runs leave it out.
const TERMINAL_TOOLS: &str = "mcp__diffity_terminal__*,mcp__diffity_dev__*";

/// The flags one chat's pi runs with, after the launch spec's own. Sessions live in Diffity's own folder: pi reads a
/// project's `sessionDir` setting before it checks trust, so a branch under review could otherwise pick where they go.
fn session_args(session_id: &str, session_dir: &Path, extension: &Path, can_write: bool) -> Vec<String> {
    vec![
        "--session-dir".into(),
        session_dir.to_string_lossy().into_owned(),
        "--session-id".into(),
        session_id.into(),
        "-e".into(),
        extension.to_string_lossy().into_owned(),
        "--tools".into(),
        if can_write { EXTRA_TOOLS } else { READ_ONLY_TOOLS }.into(),
        "--exclude-tools".into(),
        TERMINAL_TOOLS.into(),
    ]
}

/// Requests to pi and their answers. Lines go out through a writer task, so sending never waits.
struct Rpc {
    /// Dropping it ends the writer task, which closes pi's stdin: pi's signal to shut down.
    out: Mutex<Option<mpsc::UnboundedSender<String>>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Value>>>,
    next_id: AtomicU64,
}

impl Rpc {
    fn send(&self, message: Value) -> bool {
        self.out
            .lock()
            .ok()
            .and_then(|out| out.as_ref().map(|out| out.send(message.to_string()).is_ok()))
            .unwrap_or(false)
    }

    fn close(&self) {
        if let Ok(mut out) = self.out.lock() {
            out.take();
        }
    }

    /// Sends a command and waits for its response; a failed command becomes an error with pi's message.
    async fn call(&self, command: Value) -> Result<Value> {
        self.call_within(command, Some(CALL_TIMEOUT)).await
    }

    async fn call_within(&self, mut command: Value, limit: Option<Duration>) -> Result<Value> {
        let id = format!("d{}", self.next_id.fetch_add(1, Ordering::SeqCst));
        command["id"] = json!(id);
        let (tx, rx) = oneshot::channel();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(id.clone(), tx);
        }
        let name = command["type"].as_str().unwrap_or("command").to_string();
        if !self.send(command) {
            if let Ok(mut pending) = self.pending.lock() {
                pending.remove(&id);
            }
            return Err(AppError::new("agent_failed", "pi is not running"));
        }
        let answer = match limit {
            Some(limit) => tokio::time::timeout(limit, rx).await,
            None => Ok(rx.await),
        };
        let response = match answer {
            Ok(Ok(response)) => response,
            Ok(Err(_)) => return Err(AppError::new("agent_failed", "pi exited")),
            Err(_) => {
                if let Ok(mut pending) = self.pending.lock() {
                    pending.remove(&id);
                }
                return Err(AppError::new("agent_failed", format!("pi didn't answer `{name}`")));
            }
        };
        if response["success"].as_bool() == Some(true) {
            return Ok(response["data"].clone());
        }
        let message = response["error"].as_str().unwrap_or("pi refused the command").to_string();
        Err(classify(&message))
    }

    fn answer(&self, response: Value) {
        let Some(id) = response["id"].as_str() else {
            return;
        };
        let tx = self.pending.lock().ok().and_then(|mut p| p.remove(id));
        if let Some(tx) = tx {
            let _ = tx.send(response);
        }
    }

    /// pi is gone: answers every waiting call with an error and stops new ones.
    fn fail_all(&self) {
        self.close();
        if let Ok(mut pending) = self.pending.lock() {
            pending.clear();
        }
    }
}

/// How a prompt ended.
struct Settled {
    aborted: bool,
}

#[derive(Default)]
struct Progress {
    message_id: Option<String>,
    /// The last failed model call (`stopReason: "error"`); pi retries some, so only the last one counts.
    error: Option<String>,
    /// Stop was pressed. pi ignores `abort` until its run has started, so it is sent again once it has.
    cancelled: bool,
    settled: Option<oneshot::Sender<Settled>>,
}

struct Shared {
    state: RunState,
    rpc: Rpc,
    progress: Mutex<Progress>,
    alive: AtomicBool,
    /// A prompt was started and pi hasn't said `agent_settled` for it yet.
    unsettled: AtomicBool,
    /// Diffity's extension failed in pi (say, MCP support is off), so Diffity's tools are missing.
    extension_failure: Mutex<Option<String>>,
}

/// What a pi tool call looks like in Diffity's activity: an ACP-style title and kind, and the files it touches.
#[derive(Debug, PartialEq)]
struct ToolView {
    title: String,
    kind: &'static str,
    locations: Vec<String>,
}

fn arg_str<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key).and_then(Value::as_str).filter(|s| !s.is_empty())
}

fn tool_view(name: &str, args: &Value, cwd: &Path) -> ToolView {
    let abs = |key: &str, default: Option<&str>| {
        arg_str(args, key).or(default).map(|p| {
            let path = Path::new(p);
            if path.is_absolute() {
                path.to_string_lossy().into_owned()
            } else {
                cwd.join(path).to_string_lossy().into_owned()
            }
        })
    };
    let path_view = |verb: &str, kind: &'static str, default: Option<&str>| match abs("path", default) {
        Some(path) => ToolView {
            title: format!("{verb} {path}"),
            kind,
            locations: vec![path],
        },
        None => ToolView {
            title: verb.to_string(),
            kind,
            locations: vec![],
        },
    };
    match name {
        "read" => path_view("Read", "read", None),
        "ls" => path_view("List", "search", Some(".")),
        "edit" => path_view("Edit", "edit", None),
        "write" => path_view("Write", "edit", None),
        "bash" => ToolView {
            title: arg_str(args, "command").unwrap_or("Terminal").to_string(),
            kind: "execute",
            locations: vec![],
        },
        "grep" | "find" => ToolView {
            title: arg_str(args, "pattern").unwrap_or(name).to_string(),
            kind: "search",
            locations: vec![],
        },
        _ => ToolView {
            title: name.to_string(),
            kind: "other",
            locations: vec![],
        },
    }
}

/// An approval for a tool Diffity has no words for names its arguments, so the user can see what it would do.
fn ask_title(name: &str, view: &ToolView, args: &Value) -> String {
    if view.kind != "other" || args.as_object().is_none_or(|a| a.is_empty()) {
        return view.title.clone();
    }
    let args = args.to_string();
    let shown: String = args.chars().take(240).collect();
    let more = if shown.len() < args.len() { "…" } else { "" };
    format!("{name} {shown}{more}")
}

/// Applies pi's `edit` replacements to the file so the approval shows the whole change in context. Falls back to
/// the replaced snippets when the file can't be read or a snippet isn't in it.
fn edit_diff(path: &Path, args: &Value) -> PermissionDiff {
    let edits: Vec<(String, String)> = args["edits"]
        .as_array()
        .map(|edits| {
            edits
                .iter()
                .map(|e| {
                    (
                        e["oldText"].as_str().unwrap_or_default().to_string(),
                        e["newText"].as_str().unwrap_or_default().to_string(),
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    let display = path.to_string_lossy().into_owned();
    if let Some((original, changed)) = std::fs::read_to_string(path).ok().and_then(|original| {
        let changed = apply_edits(&original, &edits)?;
        Some((original, changed))
    }) {
        return PermissionDiff {
            path: display,
            old_text: Some(original),
            new_text: changed,
        };
    }
    let join = |pick: fn(&(String, String)) -> &str| edits.iter().map(pick).collect::<Vec<_>>().join("\n⋯\n");
    PermissionDiff {
        path: display,
        old_text: Some(join(|e| &e.0)),
        new_text: join(|e| &e.1),
    }
}

/// pi's edit: every `oldText` is found in the original file and replaced, the replacements not overlapping.
fn apply_edits(original: &str, edits: &[(String, String)]) -> Option<String> {
    let mut spans: Vec<(usize, usize, &str)> = Vec::with_capacity(edits.len());
    for (old, new) in edits {
        if old.is_empty() {
            return None;
        }
        let start = original.find(old.as_str())?;
        spans.push((start, start + old.len(), new.as_str()));
    }
    if spans.is_empty() {
        return None;
    }
    spans.sort_by_key(|span| span.0);
    let mut out = String::with_capacity(original.len());
    let mut at = 0;
    for (start, end, new) in spans {
        if start < at {
            return None;
        }
        out.push_str(&original[at..start]);
        out.push_str(new);
        at = end;
    }
    out.push_str(&original[at..]);
    Some(out)
}

fn write_diff(path: &Path, args: &Value) -> PermissionDiff {
    PermissionDiff {
        path: path.to_string_lossy().into_owned(),
        old_text: std::fs::read_to_string(path).ok(),
        new_text: arg_str(args, "content").unwrap_or_default().to_string(),
    }
}

fn classify(message: &str) -> AppError {
    let lower = message.to_lowercase();
    let auth = ["api key", "no model", "/login", "unauthorized", "authenticat", "401", "credential"]
        .iter()
        .any(|needle| lower.contains(needle));
    if auth {
        return AppError::new(
            "agent_auth_required",
            format!("{message}\nSign in to a provider: run `pi` in a terminal and use /login, or set a provider API key such as ANTHROPIC_API_KEY."),
        );
    }
    AppError::new("agent_failed", message.to_string())
}

impl Shared {
    fn extension_failed(&self) -> Option<AppError> {
        let failure = self.extension_failure.lock().ok()?.clone()?;
        Some(AppError::new(
            "agent_failed",
            format!("pi couldn't load Diffity's review tools: {failure}\nCheck that pi's MCP support is on (Diffity relies on pi's built-in MCP extension)."),
        ))
    }

    fn on_line(self: &Arc<Self>, line: &str) {
        let Ok(message) = serde_json::from_str::<Value>(line) else {
            tracing::debug!(target: "crate::agents::stderr", "pi: {line}");
            return;
        };
        match message["type"].as_str().unwrap_or_default() {
            "response" => self.rpc.answer(message),
            "message_start" if message["message"]["role"] == "assistant" => {
                if let Ok(mut progress) = self.progress.lock() {
                    progress.message_id = Some(uuid::Uuid::new_v4().to_string());
                }
            }
            "message_update" => self.on_message_update(&message["assistantMessageEvent"]),
            "message_end" if message["message"]["role"] == "assistant" => {
                let ended = &message["message"];
                if let Ok(mut progress) = self.progress.lock() {
                    progress.error = match ended["stopReason"].as_str() {
                        Some("error") => Some(ended["errorMessage"].as_str().unwrap_or("The model call failed").to_string()),
                        _ => None,
                    };
                }
            }
            "tool_execution_start" => {
                let id = message["toolCallId"].as_str().unwrap_or_default().to_string();
                let name = message["toolName"].as_str().unwrap_or_default();
                let view = tool_view(name, &message["args"], &self.state.cwd);
                self.state.emit(AgentEvent::ToolCall {
                    id,
                    title: view.title,
                    kind: view.kind.into(),
                    status: "in_progress".into(),
                    locations: view.locations,
                });
            }
            "tool_execution_end" => {
                let failed = message["isError"].as_bool().unwrap_or(false);
                self.state.emit(AgentEvent::ToolCallUpdate {
                    id: message["toolCallId"].as_str().unwrap_or_default().to_string(),
                    status: if failed { "failed" } else { "completed" }.into(),
                    title: None,
                    kind: None,
                    locations: None,
                });
            }
            "agent_settled" => {
                self.unsettled.store(false, Ordering::SeqCst);
                let tx = self.progress.lock().ok().and_then(|mut p| p.settled.take());
                if let Some(tx) = tx {
                    let _ = tx.send(Settled {
                        aborted: message["aborted"].as_bool().unwrap_or(false),
                    });
                }
            }
            "extension_ui_request" => self.on_dialog(message),
            "extension_error" => {
                let error = message["error"].as_str().unwrap_or_default();
                let path = message["extensionPath"].as_str().unwrap_or_default();
                tracing::warn!("pi extension error in {path}: {error}");
                self.state.push_stderr(&format!("extension error: {error}"));
                if path.contains(EXTENSION_NAME) {
                    if let Ok(mut failure) = self.extension_failure.lock() {
                        failure.get_or_insert_with(|| error.to_string());
                    }
                }
            }
            _ => {}
        }
    }

    fn on_message_update(&self, update: &Value) {
        match update["type"].as_str().unwrap_or_default() {
            "text_delta" => {
                let message_id = self
                    .progress
                    .lock()
                    .ok()
                    .and_then(|p| p.message_id.clone())
                    .unwrap_or_else(|| self.state.fallback_message_id());
                self.state.emit(AgentEvent::Text {
                    message_id,
                    delta: update["delta"].as_str().unwrap_or_default().to_string(),
                });
            }
            "thinking_delta" => self.state.emit(AgentEvent::Thought {
                delta: update["delta"].as_str().unwrap_or_default().to_string(),
            }),
            _ => {}
        }
    }

    /// Dialogs from pi's extensions. Diffity's own permission check is answered from the run's permissions; another
    /// extension's yes/no question goes to the user as an approval; anything else needs a UI Diffity doesn't have.
    fn on_dialog(self: &Arc<Self>, request: Value) {
        let id = request["id"].as_str().unwrap_or_default().to_string();
        let method = request["method"].as_str().unwrap_or_default();
        if !matches!(method, "confirm" | "select" | "input" | "editor") {
            return;
        }
        if method != "confirm" {
            self.rpc.send(json!({ "type": "extension_ui_response", "id": id, "cancelled": true }));
            return;
        }
        let shared = self.clone();
        tokio::spawn(async move {
            let confirmed = if request["title"] == PERMISSION_TITLE {
                shared.permit(request["message"].as_str().unwrap_or_default()).await
            } else {
                let title = request["title"].as_str().unwrap_or("Allow?");
                let message = request["message"].as_str().unwrap_or_default();
                let title = if message.is_empty() { title.to_string() } else { format!("{title} {message}") };
                shared.ask_user(title, None, "other", false, Vec::new()).await
            };
            shared.rpc.send(json!({ "type": "extension_ui_response", "id": id, "confirmed": confirmed }));
        });
    }

    /// Decides one tool call the extension asked about.
    async fn permit(&self, request: &str) -> bool {
        // pi can start a run Diffity didn't ask for (an extension command, say); with no turn there's nothing to judge it by.
        if self.state.with_events(|_| ()).is_none() {
            return false;
        }
        let Ok(request) = serde_json::from_str::<Value>(request) else {
            return false;
        };
        let name = request["toolName"].as_str().unwrap_or_default();
        let input = &request["input"];
        if run_state::is_own_tool(Some(name)) {
            return true;
        }
        let view = tool_view(name, input, &self.state.cwd);
        let path = arg_str(input, "path").map(PathBuf::from);
        // The extension hands over the absolute path pi will write; anything else could mean pi reads it differently.
        if matches!(name, "edit" | "write") && !path.as_deref().is_some_and(Path::is_absolute) {
            return false;
        }
        let diff = match (name, &path) {
            ("edit", Some(path)) => Some(edit_diff(path, input)),
            ("write", Some(path)) => Some(write_diff(path, input)),
            _ => None,
        };
        let is_edit = policy::is_edit_kind(view.kind);
        let paths: Vec<PathBuf> = path.into_iter().collect();
        match self.state.verdict(view.kind, is_edit, &paths) {
            Verdict::Deny => {
                if is_edit {
                    self.state.mark_edit_rejected();
                }
                false
            }
            Verdict::Allow => true,
            Verdict::Ask => self.ask_user(ask_title(name, &view, input), diff, view.kind, is_edit, paths).await,
        }
    }

    async fn ask_user(&self, title: String, diff: Option<PermissionDiff>, kind: &str, is_edit: bool, paths: Vec<PathBuf>) -> bool {
        if policy::permission_decision(self.state.mode, kind) == policy::PermissionDecision::AutoDeny {
            return false;
        }
        // Requests go out as turn events; with no turn running nobody would see one.
        if self.state.with_events(|_| ()).is_none() {
            return false;
        }
        let (request_id, rx) = self.state.ask(Ask {
            title,
            options: run_state::allow_reject_options(),
            diff,
        });
        let answer = rx.await.unwrap_or_default();
        let allowed = answer.option.as_deref() == Some("allow");
        self.state.settle(&request_id, allowed, &answer, is_edit, paths);
        allowed
    }
}

/// The model pi is set to, as `provider/id`, and its thinking level.
#[derive(Default)]
struct Applied {
    model: Option<String>,
    effort: Option<String>,
}

/// `provider/id`. pi reports `unknown` while the model it starts on comes from a provider an extension is still
/// registering.
fn model_value(model: &Value) -> Option<String> {
    let provider = model["provider"].as_str().filter(|p| *p != "unknown")?;
    Some(format!("{provider}/{}", model["id"].as_str()?))
}

struct Process {
    shared: Arc<Shared>,
    child: Child,
}

/// Starts pi with its stdout read into `Shared` and its stdin fed from the returned `Rpc`'s queue.
fn spawn(launch: &LaunchSpec, extra_args: &[String], env: &[(String, String)], cwd: &Path, state: RunState) -> Result<Process> {
    let mut command = Command::new(&launch.command);
    command
        .args(&launch.args)
        .args(extra_args)
        .envs(launch.env.iter().cloned())
        .envs(env.iter().cloned())
        .env("DIFFITY", "1")
        .current_dir(cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    let mut child = command.spawn().map_err(|e| {
        AppError::new(
            "agent_failed",
            format!("Couldn't start pi ({}): {e}", launch.command.display()),
        )
    })?;
    let (Some(mut stdin), Some(stdout), Some(stderr)) = (child.stdin.take(), child.stdout.take(), child.stderr.take()) else {
        return Err(AppError::new("agent_failed", "pi started without pipes"));
    };

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let shared = Arc::new(Shared {
        state,
        rpc: Rpc {
            out: Mutex::new(Some(out_tx)),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(1),
        },
        progress: Mutex::new(Progress::default()),
        alive: AtomicBool::new(true),
        unsettled: AtomicBool::new(false),
        extension_failure: Mutex::new(None),
    });

    tokio::spawn(async move {
        while let Some(line) = out_rx.recv().await {
            let written = async {
                stdin.write_all(line.as_bytes()).await?;
                stdin.write_all(b"\n").await?;
                stdin.flush().await
            };
            if written.await.is_err() {
                break;
            }
        }
    });

    let reader = shared.clone();
    tokio::spawn(async move {
        let mut stdout = BufReader::new(stdout);
        let mut line = Vec::new();
        loop {
            line.clear();
            match stdout.read_until(b'\n', &mut line).await {
                Ok(0) | Err(_) => break,
                Ok(_) => reader.on_line(String::from_utf8_lossy(&line).trim_end_matches(['\n', '\r'])),
            }
        }
        reader.alive.store(false, Ordering::SeqCst);
        reader.rpc.fail_all();
        reader.state.cancel_pending();
        if let Ok(mut progress) = reader.progress.lock() {
            progress.settled = None;
        }
    });

    let errors = shared.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            tracing::debug!(target: "crate::agents::stderr", "{line}");
            errors.state.push_stderr(&line);
        }
    });

    Ok(Process { shared, child })
}

/// Ends pi: closing stdin asks it to stop (it shuts its MCP servers down too); after a grace period the whole
/// process group is killed.
async fn shut_down(shared: &Shared, mut child: Child) {
    shared.rpc.close();
    if tokio::time::timeout(SHUTDOWN_GRACE, child.wait()).await.is_ok() {
        return;
    }
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        let _ = std::process::Command::new("kill").args(["-KILL", &format!("-{pid}")]).status();
    }
    let _ = child.kill().await;
}

fn with_stderr(mut error: AppError, shared: &Shared) -> AppError {
    let tail = shared.state.stderr_tail();
    if !tail.is_empty() && !error.message.contains(&tail) {
        error.message = format!("{}\n{tail}", error.message);
    }
    error
}

pub struct PiSession {
    shared: Arc<Shared>,
    child: tokio::sync::Mutex<Option<Child>>,
    applied: tokio::sync::Mutex<Applied>,
    pub session_id: String,
}

impl PiSession {
    pub async fn start(config: SessionConfig) -> Result<Self> {
        if user_has_mcp_server(SERVER) {
            let file = agent_dir().unwrap_or_default().join("mcp.json");
            return Err(AppError::new(
                "agent_failed",
                format!(
                    "Your pi config has its own MCP server named `{SERVER}` ({}), which hides Diffity's review tools from pi. Remove it with `pi mcp remove {SERVER}`; to use pi with Diffity from a terminal, connect it in Settings → Terminal instead.",
                    file.display()
                ),
            ));
        }
        let extension = install_extension(&config.data_dir)?;
        let session_id = config
            .resume_session_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let sessions = config.data_dir.join("pi").join("sessions");
        let args = session_args(&session_id, &sessions, &extension, policy::can_write_files(config.mode));
        let diffity = json!({
            "server": SERVER,
            "command": config.mcp_command.to_string_lossy(),
            "args": config.mcp_args,
        });
        let state = RunState::new(config.mode, config.cwd.clone(), config.broker.clone(), config.edit_rejected.clone());
        let Process { shared, child } = spawn(&config.launch, &args, &[("DIFFITY_PI".into(), diffity.to_string())], &config.cwd, state)?;
        let session = Self {
            shared,
            child: tokio::sync::Mutex::new(Some(child)),
            applied: tokio::sync::Mutex::new(Applied::default()),
            session_id,
        };
        let ready = tokio::time::timeout(STARTUP_TIMEOUT, session.shared.rpc.call(json!({ "type": "get_state" }))).await;
        let state = match ready {
            Ok(Ok(state)) => state,
            Ok(Err(e)) => {
                let error = with_stderr(e, &session.shared);
                session.close().await;
                return Err(error);
            }
            Err(_) => {
                let error = with_stderr(AppError::new("agent_failed", "pi didn't start in time"), &session.shared);
                session.close().await;
                return Err(error);
            }
        };
        if let Some(error) = session.shared.extension_failed() {
            session.close().await;
            return Err(error);
        }
        *session.applied.lock().await = Applied {
            model: model_value(&state["model"]),
            effort: state["thinkingLevel"].as_str().map(String::from),
        };
        Ok(session)
    }

    pub fn is_alive(&self) -> bool {
        self.shared.alive.load(Ordering::SeqCst)
    }

    /// Puts pi on the run's model, then its thinking level (switching models resets it). Anything pi doesn't offer
    /// is skipped, so pi's own setting applies.
    async fn apply_model(&self, wanted: &RunModel) {
        let mut applied = self.applied.lock().await;
        if let Some(model) = wanted.model.as_deref().filter(|m| applied.model.as_deref() != Some(*m)) {
            let Some((provider, id)) = model.split_once('/') else {
                tracing::warn!("pi: model `{model}` has no provider");
                return;
            };
            match self.shared.rpc.call(json!({ "type": "set_model", "provider": provider, "modelId": id })).await {
                Ok(_) => {
                    applied.model = Some(model.to_string());
                    applied.effort = None;
                }
                Err(e) => tracing::warn!("pi: set_model {model} failed: {}", e.message),
            }
        }
        if let Some(effort) = wanted.effort.as_deref().filter(|e| applied.effort.as_deref() != Some(*e)) {
            match self.shared.rpc.call(json!({ "type": "set_thinking_level", "level": effort })).await {
                Ok(_) => applied.effort = Some(effort.to_string()),
                Err(e) => tracing::warn!("pi: set_thinking_level {effort} failed: {}", e.message),
            }
        }
    }

    pub async fn prompt(&self, text: String, run: RunPermissions, model: RunModel, sink: EventSink) -> Result<Vec<AgentEvent>> {
        self.shared.state.begin_turn(run, sink)?;
        let mut guard = TurnGuard {
            session: self,
            finished: false,
        };
        let outcome = self.run_turn(text, &model).await;
        let final_event = match outcome {
            Ok(event) => event,
            Err(e) => {
                let e = if self.is_alive() { e } else { with_stderr(e, &self.shared) };
                AgentEvent::Error {
                    code: e.code,
                    message: e.message,
                }
            }
        };
        self.shared.state.emit(final_event);
        guard.finished = true;
        Ok(self.shared.state.end_turn())
    }

    async fn run_turn(&self, text: String, model: &RunModel) -> Result<AgentEvent> {
        if !self.is_alive() {
            return Err(AppError::new("agent_failed", "pi is not running"));
        }
        // A run that was dropped before pi settled it: stop it first (`abort` answers once pi is idle), so its late
        // `agent_settled` can't end this one.
        if self.shared.unsettled.load(Ordering::SeqCst) {
            if let Err(e) = self.shared.rpc.call(json!({ "type": "abort" })).await {
                tracing::warn!("pi: abort before the next prompt failed: {}", e.message);
            }
            for _ in 0..40 {
                if !self.shared.unsettled.load(Ordering::SeqCst) {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
        self.apply_model(model).await;
        let (tx, rx) = oneshot::channel();
        if let Ok(mut progress) = self.shared.progress.lock() {
            *progress = Progress {
                settled: Some(tx),
                ..Progress::default()
            };
        }
        self.shared.unsettled.store(true, Ordering::SeqCst);
        // pi runs a prompt that starts with `/` as one of its commands, skills or templates.
        let text = if text.trim_start().starts_with('/') { format!("## Request\n\n{text}") } else { text };
        // No time limit: pi answers once the run has started, which can wait on compacting a long chat.
        let started = self.shared.rpc.call_within(json!({ "type": "prompt", "message": text }), None).await;
        let started = match started {
            Ok(started) => started,
            Err(e) => {
                self.shared.unsettled.store(false, Ordering::SeqCst);
                self.shared.rpc.send(json!({ "type": "abort" }));
                return Err(e);
            }
        };
        if started["disposition"] != "started" {
            self.shared.unsettled.store(false, Ordering::SeqCst);
            return Err(AppError::new("agent_failed", "pi handled this message itself, so nothing was sent to the model."));
        }
        if self.shared.progress.lock().is_ok_and(|p| p.cancelled) {
            self.shared.rpc.send(json!({ "type": "abort" }));
        }
        let settled = rx
            .await
            .map_err(|_| AppError::new("agent_failed", "pi exited during the run"))?;
        if settled.aborted {
            return Ok(AgentEvent::Done {
                stop_reason: "cancelled".into(),
            });
        }
        if let Some(error) = self.shared.extension_failed() {
            return Err(error);
        }
        let error = self.shared.progress.lock().ok().and_then(|p| p.error.clone());
        match error {
            Some(message) => Err(classify(&message)),
            None => Ok(AgentEvent::Done {
                stop_reason: "end_turn".into(),
            }),
        }
    }

    pub fn cancel(&self) {
        if let Ok(mut progress) = self.shared.progress.lock() {
            progress.cancelled = true;
        }
        self.shared.state.cancel_pending();
        self.shared.rpc.send(json!({ "type": "abort" }));
    }

    pub async fn close(&self) {
        self.shared.state.cancel_pending();
        self.shared.alive.store(false, Ordering::SeqCst);
        if let Some(child) = self.child.lock().await.take() {
            shut_down(&self.shared, child).await;
        }
    }
}

impl Drop for PiSession {
    /// Without `close()`, `kill_on_drop` would end pi alone; its shell commands and MCP servers share its group.
    fn drop(&mut self) {
        let Ok(mut child) = self.child.try_lock() else {
            return;
        };
        let Some(child) = child.as_mut() else {
            return;
        };
        #[cfg(unix)]
        if let Some(pid) = child.id() {
            let _ = std::process::Command::new("kill").args(["-KILL", &format!("-{pid}")]).status();
        }
        let _ = child.start_kill();
    }
}

/// Cancels the turn and frees the turn slot when a `prompt` future is dropped before completion.
struct TurnGuard<'a> {
    session: &'a PiSession,
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

fn effort_name(level: &str) -> String {
    match level {
        "xhigh" => "Extra high".into(),
        other => {
            let mut chars = other.chars();
            chars.next().map(|c| c.to_uppercase().chain(chars).collect()).unwrap_or_default()
        }
    }
}

/// Reads pi's models from a throwaway, unsaved session: the ones with credentials, each with the thinking levels it
/// takes. `set_model` in RPC mode doesn't touch pi's saved default, so switching through them here is harmless.
pub async fn probe_models(launch: LaunchSpec, cwd: PathBuf) -> Result<Option<ModelCatalog>> {
    let state = RunState::new(crate::agents::types::AgentMode::Ask, cwd.clone(), Arc::default(), Arc::default());
    let args: Vec<String> = ["--no-session", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-context-files", "--tools", READ_ONLY_TOOLS]
        .into_iter()
        .map(String::from)
        .collect();
    let Process { shared, child } = spawn(&launch, &args, &[], &cwd, state)?;
    let result = async {
        let state = tokio::time::timeout(STARTUP_TIMEOUT, shared.rpc.call(json!({ "type": "get_state" })))
            .await
            .map_err(|_| AppError::new("agent_failed", "pi didn't start in time"))??;
        let listed = shared.rpc.call(json!({ "type": "get_available_models" })).await?;
        let mut models = Vec::new();
        for model in listed["models"].as_array().into_iter().flatten() {
            let Some(value) = model_value(model) else {
                continue;
            };
            let name = model["name"].as_str().or(model["id"].as_str()).unwrap_or(&value).to_string();
            let mut efforts = Vec::new();
            if model["reasoning"].as_bool() == Some(true) {
                let switched = shared
                    .rpc
                    .call(json!({ "type": "set_model", "provider": model["provider"], "modelId": model["id"] }))
                    .await;
                let levels = match switched {
                    Ok(_) => shared.rpc.call(json!({ "type": "get_available_thinking_levels" })).await.ok(),
                    Err(_) => None,
                };
                if let Some(levels) = levels {
                    efforts = levels["levels"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                        .map(|level| ConfigChoice {
                            value: level.to_string(),
                            name: effort_name(level),
                            description: None,
                        })
                        .collect();
                }
            }
            models.push(ModelChoice {
                value,
                name: format!("{}/{name}", model["provider"].as_str().unwrap_or_default()),
                description: None,
                efforts,
            });
        }
        // Like pi's own model picker: the model pi starts on first, then the rest by provider.
        let current = model_value(&state["model"]);
        models.sort_by_key(|m| current.as_deref() != Some(m.value.as_str()));
        if models.is_empty() {
            return Err(AppError::new(
                "agent_auth_required",
                "pi has no models to use yet. Run `pi` in a terminal and use /login, or set a provider API key such as ANTHROPIC_API_KEY.",
            ));
        }
        Ok(Some(ModelCatalog {
            models,
            current_model: current,
            fetched_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        }))
    }
    .await;
    let result = result.map_err(|e| with_stderr(e, &shared));
    shut_down(&shared, child).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_only_chats_get_no_shell_or_edit_tools() {
        let ext = Path::new("/data/pi/diffity-extension.ts");
        let dir = Path::new("/data/pi/sessions");
        let args = session_args("chat-1", dir, ext, false);
        assert_eq!(
            args,
            vec![
                "--session-dir", "/data/pi/sessions", "--session-id", "chat-1", "-e", "/data/pi/diffity-extension.ts",
                "--tools", "read,grep,find,ls,mcp__*", "--exclude-tools", TERMINAL_TOOLS,
            ]
        );
        let args = session_args("chat-1", dir, ext, true);
        assert_eq!(args[args.len() - 3], "+grep,+find,+ls");
        assert_eq!(args.last().map(String::as_str), Some(TERMINAL_TOOLS));
    }

    #[test]
    fn describes_tools_like_acp_agents() {
        let cwd = Path::new("/repo");
        let view = tool_view("read", &json!({ "path": "src/a.ts" }), cwd);
        assert_eq!(view, ToolView { title: "Read /repo/src/a.ts".into(), kind: "read", locations: vec!["/repo/src/a.ts".into()] });
        assert_eq!(tool_view("edit", &json!({ "path": "/abs/b.rs" }), cwd).title, "Edit /abs/b.rs");
        assert_eq!(tool_view("write", &json!({ "path": "c" }), cwd).kind, "edit");
        assert_eq!(tool_view("ls", &json!({ "path": "src" }), cwd).title, "List /repo/src");
        let bash = tool_view("bash", &json!({ "command": "cargo test" }), cwd);
        assert_eq!((bash.title.as_str(), bash.kind), ("cargo test", "execute"));
        assert_eq!(tool_view("grep", &json!({ "pattern": "TODO" }), cwd).kind, "search");
        let mcp = tool_view("mcp__diffity__add_comment", &json!({}), cwd);
        assert_eq!((mcp.title.as_str(), mcp.kind), ("mcp__diffity__add_comment", "other"));
    }

    #[test]
    fn edit_approvals_show_the_whole_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.txt");
        std::fs::write(&file, "one\ntwo\nthree\n").unwrap();
        let diff = edit_diff(&file, &json!({ "edits": [{ "oldText": "two", "newText": "2" }, { "oldText": "three", "newText": "3" }] }));
        assert_eq!(diff.old_text.as_deref(), Some("one\ntwo\nthree\n"));
        assert_eq!(diff.new_text, "one\n2\n3\n");
        let diff = edit_diff(&file, &json!({ "edits": [{ "oldText": "missing", "newText": "x" }] }));
        assert_eq!((diff.old_text.as_deref(), diff.new_text.as_str()), (Some("missing"), "x"));
        assert_eq!(
            apply_edits("a b c", &[("c".into(), "C".into()), ("a".into(), "b".into())]).as_deref(),
            Some("b b C"),
            "matched against the original, not the edited text"
        );
        assert_eq!(apply_edits("abc", &[("ab".into(), "x".into()), ("bc".into(), "y".into())]), None);
        let diff = write_diff(&dir.path().join("new.txt"), &json!({ "content": "hi" }));
        assert_eq!((diff.old_text, diff.new_text.as_str()), (None, "hi"));
    }

    #[test]
    fn approvals_for_unknown_tools_show_their_arguments() {
        let cwd = Path::new("/repo");
        let args = json!({ "path": "/etc/hosts", "content": "x" });
        let view = tool_view("mcp__fs__write_file", &args, cwd);
        assert_eq!(ask_title("mcp__fs__write_file", &view, &args), r#"mcp__fs__write_file {"path":"/etc/hosts","content":"x"}"#);
        let long = json!({ "text": "a".repeat(500) });
        assert!(ask_title("deploy", &tool_view("deploy", &long, cwd), &long).ends_with('…'));
        let bash = json!({ "command": "ls" });
        assert_eq!(ask_title("bash", &tool_view("bash", &bash, cwd), &bash), "ls");
    }

    #[test]
    fn spots_missing_credentials() {
        assert_eq!(classify("No API key found for anthropic").code, "agent_auth_required");
        assert_eq!(classify("No model selected").code, "agent_auth_required");
        assert_eq!(classify("Rate limit exceeded").code, "agent_failed");
    }

    #[test]
    fn names_thinking_levels() {
        assert_eq!(effort_name("xhigh"), "Extra high");
        assert_eq!(effort_name("minimal"), "Minimal");
        assert_eq!(effort_name("off"), "Off");
    }

    #[test]
    fn writes_the_extension_once() {
        let dir = tempfile::tempdir().unwrap();
        let path = install_extension(dir.path()).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), EXTENSION);
        std::fs::write(&path, "stale").unwrap();
        assert_eq!(install_extension(dir.path()).unwrap(), path);
        assert_eq!(std::fs::read_to_string(&path).unwrap(), EXTENSION);
    }
}
