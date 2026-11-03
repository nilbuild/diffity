use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use crate::core::{AppError, Result};

use crate::agents::backend::ReviewBackend;
use crate::agents::policy;
use crate::agents::terminal::{self, TerminalClient};
use crate::agents::tools::{self, Binding};

pub type ThreadsChangedHook = Arc<dyn Fn(&str) + Send + Sync>;

/// Pseudo-tool the stdio server calls to learn which tools this token may use.
pub const LIST_TOOLS: &str = "__list_tools";

const MAX_SOCKET_PATH: usize = 100;

/// A tool call from `diffity-mcp`: an in-app run carries its `token`, a terminal agent its `terminal` client.
#[derive(Deserialize)]
struct Request {
    #[serde(default)]
    token: String,
    #[serde(default)]
    terminal: Option<TerminalClient>,
    tool: String,
    #[serde(default)]
    args: Value,
}

pub struct McpBridge {
    socket_path: PathBuf,
    backend: Arc<dyn ReviewBackend>,
    bindings: RwLock<HashMap<String, Binding>>,
    hook: RwLock<Option<ThreadsChangedHook>>,
    started: tokio::sync::Mutex<bool>,
    terminal_allowed: AtomicBool,
}

/// A fixed path, so `diffity-mcp --terminal` registered in a terminal agent can always find the app: the data
/// dir's `mcp.sock`, or `/tmp/diffity[-dev]-<uid>.sock` when that path is too long for a unix socket.
pub fn socket_path_for(data_dir: &Path) -> PathBuf {
    let preferred = data_dir.join("mcp.sock");
    if preferred.as_os_str().len() <= MAX_SOCKET_PATH {
        return preferred;
    }
    #[cfg(unix)]
    let uid = {
        use std::os::unix::fs::MetadataExt;
        std::fs::metadata(data_dir).map(|m| m.uid()).unwrap_or(0)
    };
    #[cfg(not(unix))]
    let uid = 0;
    let channel = if crate::dev_build() { "diffity-dev" } else { "diffity" };
    PathBuf::from(format!("/tmp/{channel}-{uid}.sock"))
}

impl McpBridge {
    pub fn new(socket_path: PathBuf, backend: Arc<dyn ReviewBackend>) -> Arc<Self> {
        Arc::new(Self {
            socket_path,
            backend,
            bindings: RwLock::new(HashMap::new()),
            hook: RwLock::new(None),
            started: tokio::sync::Mutex::new(false),
            terminal_allowed: AtomicBool::new(false),
        })
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
    }

    pub fn set_terminal_allowed(&self, allowed: bool) {
        self.terminal_allowed.store(allowed, Ordering::Relaxed);
    }

    pub fn set_hook(&self, hook: ThreadsChangedHook) {
        if let Ok(mut slot) = self.hook.write() {
            *slot = Some(hook);
        }
    }

    fn notify(&self, session_id: &str) {
        let hook = self.hook.read().ok().and_then(|h| h.clone());
        if let Some(hook) = hook {
            hook(session_id);
        }
    }

    pub fn register(&self, binding: Binding) -> String {
        let token = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        if let Ok(mut map) = self.bindings.write() {
            map.insert(token.clone(), binding);
        }
        token
    }

    pub fn update(&self, token: &str, f: impl FnOnce(&mut Binding)) {
        if let Ok(mut map) = self.bindings.write() {
            if let Some(b) = map.get_mut(token) {
                f(b);
            }
        }
    }

    pub fn unregister(&self, token: &str) {
        if let Ok(mut map) = self.bindings.write() {
            map.remove(token);
        }
    }

    fn binding(&self, token: &str) -> Option<Binding> {
        self.bindings
            .read()
            .ok()
            .and_then(|m| m.get(token).cloned())
    }

    pub async fn ensure_started(self: &Arc<Self>) -> Result<()> {
        let mut started = self.started.lock().await;
        if *started {
            return Ok(());
        }
        if let Some(parent) = self.socket_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if self.socket_path.exists() {
            std::fs::remove_file(&self.socket_path)?;
        }
        let listener = UnixListener::bind(&self.socket_path)
            .map_err(|e| AppError::internal(format!("bind {}: {e}", self.socket_path.display())))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ =
                std::fs::set_permissions(&self.socket_path, std::fs::Permissions::from_mode(0o600));
        }
        let this = Arc::downgrade(self);
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    continue;
                };
                let Some(bridge) = this.upgrade() else {
                    return;
                };
                tokio::spawn(async move { bridge.serve(stream).await });
            }
        });
        *started = true;
        Ok(())
    }

    async fn serve(self: Arc<Self>, stream: UnixStream) {
        let (read, mut write) = stream.into_split();
        let mut lines = BufReader::new(read).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let response = match self.handle_line(&line).await {
                Ok(result) => json!({ "ok": true, "result": result }),
                Err(e) => json!({ "ok": false, "error": e.message }),
            };
            let mut out = response.to_string();
            out.push('\n');
            if write.write_all(out.as_bytes()).await.is_err() {
                return;
            }
        }
    }

    pub async fn handle_line(&self, line: &str) -> Result<Value> {
        let req: Request = serde_json::from_str(line)
            .map_err(|e| AppError::invalid(format!("bad request: {e}")))?;
        if let Some(client) = &req.terminal {
            return self.handle_terminal(client, &req.tool, req.args).await;
        }
        let Some(binding) = self.binding(&req.token) else {
            return Err(AppError::new("unauthorized", "unknown or expired token"));
        };
        tracing::debug!(tool = %req.tool, mode = ?binding.mode, "mcp bridge call");
        if req.tool == LIST_TOOLS {
            return Ok(json!(policy::allowed_tools(binding.mode)));
        }
        self.run(&binding, &req.tool, req.args).await
    }

    /// A terminal agent's call: answered only while terminal agents are allowed, as `{ review, result }` where
    /// `review` names the repository, view and thread counts it read.
    async fn handle_terminal(&self, client: &TerminalClient, tool: &str, args: Value) -> Result<Value> {
        if !self.terminal_allowed.load(Ordering::Relaxed) {
            return Err(AppError::new("forbidden", terminal::NOT_ALLOWED));
        }
        tracing::debug!(tool, client = %client.client, "terminal mcp call");
        let resolved = terminal::resolve(self.backend.as_ref(), client, &args).await?;
        let result = self.run(&resolved.binding, tool, args).await?;
        Ok(json!({ "review": resolved.header, "result": result }))
    }

    async fn run(&self, binding: &Binding, tool: &str, args: Value) -> Result<Value> {
        if !policy::tool_allowed(binding.mode, tool) {
            return Err(AppError::new(
                "forbidden",
                format!("tool `{tool}` is not available in {:?} mode", binding.mode).to_lowercase(),
            ));
        }
        let result = tools::call(self.backend.as_ref(), binding, tool, args).await?;
        if tools::is_mutating(tool) {
            self.notify(&binding.session_id);
        }
        Ok(result)
    }
}

impl Drop for McpBridge {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.socket_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn terminal_agents_need_the_setting() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(crate::core::Store::open_in_memory().unwrap());
        let backend: Arc<dyn ReviewBackend> = Arc::new(crate::agents::core_backend::CoreBackend::new(store));
        let bridge = McpBridge::new(dir.path().join("mcp.sock"), backend);
        let line = json!({
            "terminal": { "client": "claude-code", "repo": dir.path().to_string_lossy() },
            "tool": "list_threads",
            "args": {}
        })
        .to_string();
        let err = bridge.handle_line(&line).await.unwrap_err();
        assert_eq!(err.message, terminal::NOT_ALLOWED);

        bridge.set_terminal_allowed(true);
        let answer = bridge.handle_line(&line).await.unwrap();
        assert!(answer["review"].as_str().unwrap().contains("Uncommitted changes · 0 open threads"));
        assert!(answer["result"]["threads"].as_array().unwrap().is_empty());
    }
}

#[cfg(test)]
mod terminal_e2e {
    use super::*;
    use std::io::{BufRead, Write};

    /// Drives the real `diffity-mcp --terminal` over stdio against a bridge. Needs
    /// `cargo build --features mcp --bin diffity-mcp` first; skipped otherwise.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn terminal_agent_lists_and_replies() {
        let bin = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/debug/diffity-mcp");
        assert!(bin.exists(), "build diffity-mcp first");
        let dir = tempfile::tempdir().unwrap();
        let repo = dir.path().join("repo");
        std::fs::create_dir(&repo).unwrap();
        std::process::Command::new("git").arg("init").arg("-q").arg(&repo).status().unwrap();
        let repo_path = std::fs::canonicalize(&repo).unwrap().to_string_lossy().into_owned();

        let store = Arc::new(crate::core::Store::open_in_memory().unwrap());
        let session = store.get_or_create_session(&repo_path, "work").unwrap();
        let thread = store
            .create_thread(&crate::core::types::NewThread {
                session_id: session.id.clone(),
                file_path: "a.rs".into(),
                side: crate::core::types::Side::New,
                start_line: 1,
                end_line: 1,
                body: "rename this".into(),
                severity: None,
                anchor_content: None,
                author_type: None,
                author_name: None,
                pending: Some(false),
                view_ref: None,
                promoted_from: None,
            })
            .unwrap();
        let backend: Arc<dyn ReviewBackend> = Arc::new(crate::agents::core_backend::CoreBackend::new(store.clone()));
        let socket = dir.path().join("mcp.sock");
        let bridge = McpBridge::new(socket.clone(), backend);
        bridge.set_terminal_allowed(true);
        bridge.ensure_started().await.unwrap();

        let thread_id = thread.id.clone();
        let socket_arg = socket.to_string_lossy().into_owned();
        let output = tokio::task::spawn_blocking(move || {
            let mut child = std::process::Command::new(&bin)
                .args(["--terminal", "--socket", &socket_arg])
                .current_dir(&repo)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .spawn()
                .unwrap();
            let mut stdin = child.stdin.take().unwrap();
            let mut stdout = std::io::BufReader::new(child.stdout.take().unwrap());
            let mut send = |msg: serde_json::Value| writeln!(stdin, "{msg}").unwrap();
            let mut read = || {
                let mut line = String::new();
                stdout.read_line(&mut line).unwrap();
                serde_json::from_str::<serde_json::Value>(&line).unwrap()
            };
            send(json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code","version":"1"}}}));
            let init = read();
            send(json!({"jsonrpc":"2.0","method":"notifications/initialized"}));
            send(json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}));
            let tools = read();
            send(json!({"jsonrpc":"2.0","id":3,"method":"prompts/list"}));
            let prompts = read();
            send(json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_threads","arguments":{}}}));
            let listed = read();
            send(json!({"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"reply","arguments":{"threadId": thread_id, "body":"Renamed."}}}));
            let replied = read();
            drop(stdin);
            let _ = child.kill();
            let _ = child.wait();
            (init, tools, prompts, listed, replied)
        })
        .await
        .unwrap();
        let (init, tools, prompts, listed, replied) = output;
        assert!(init["result"]["capabilities"]["prompts"].is_object(), "{init}");
        let names: Vec<&str> = tools["result"]["tools"].as_array().unwrap().iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(names.contains(&"open_in_diffity") && names.contains(&"list_threads"), "{names:?}");
        assert_eq!(prompts["result"]["prompts"][0]["name"], "address");
        let text = listed["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.starts_with("repo · Uncommitted changes · 1 open thread"), "{text}");
        assert!(text.contains("rename this"), "{text}");
        assert_eq!(replied["result"]["isError"], json!(false), "{replied}");
        let comments = store.get_thread(&thread.id).unwrap().comments;
        assert_eq!(comments.last().unwrap().author_name, "Claude Code (terminal)");
    }
}
