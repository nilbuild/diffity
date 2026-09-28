use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};

use diffity_core::{AppError, Result};

use crate::backend::ReviewBackend;
use crate::policy;
use crate::tools::{self, Binding};

pub type ThreadsChangedHook = Arc<dyn Fn(&str) + Send + Sync>;

/// Pseudo-tool the stdio server calls to learn which tools this token may use.
pub const LIST_TOOLS: &str = "__list_tools";

const MAX_SOCKET_PATH: usize = 100;

#[derive(Deserialize)]
struct Request {
    token: String,
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
}

pub fn socket_path_for(data_dir: &Path) -> PathBuf {
    let preferred = data_dir.join("mcp.sock");
    if preferred.as_os_str().len() <= MAX_SOCKET_PATH {
        return preferred;
    }
    std::env::temp_dir().join(format!("diffity-mcp-{}.sock", std::process::id()))
}

impl McpBridge {
    pub fn new(socket_path: PathBuf, backend: Arc<dyn ReviewBackend>) -> Arc<Self> {
        Arc::new(Self {
            socket_path,
            backend,
            bindings: RwLock::new(HashMap::new()),
            hook: RwLock::new(None),
            started: tokio::sync::Mutex::new(false),
        })
    }

    pub fn socket_path(&self) -> &Path {
        &self.socket_path
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
        let Some(binding) = self.binding(&req.token) else {
            return Err(AppError::new("unauthorized", "unknown or expired token"));
        };
        tracing::debug!(tool = %req.tool, mode = ?binding.mode, "mcp bridge call");
        if req.tool == LIST_TOOLS {
            return Ok(json!(policy::allowed_tools(binding.mode)));
        }
        if !policy::tool_allowed(binding.mode, &req.tool) {
            return Err(AppError::new(
                "forbidden",
                format!(
                    "tool `{}` is not available in {:?} mode",
                    req.tool, binding.mode
                )
                .to_lowercase(),
            ));
        }
        let result = tools::call(self.backend.as_ref(), &binding, &req.tool, req.args).await?;
        if tools::is_mutating(&req.tool) {
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
