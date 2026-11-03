mod tools;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use rmcp::handler::server::ServerHandler;
use rmcp::model::{
    CacheScope, CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, GetPromptRequestParams,
    GetPromptResponse, GetPromptResult, Implementation, ListPromptsResult, ListToolsResult,
    PaginatedRequestParams, Prompt, PromptMessage, Role, ServerCapabilities, ServerConfig,
};
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{ErrorData, ServiceExt};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::unix::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::UnixStream;
use tokio::sync::Mutex;

const LIST_TOOLS: &str = "__list_tools";
const ADDRESS_PROMPT: &str = "address";
const ADDRESS_TEXT: &str = "Address my open review comments in Diffity. Call list_threads, then for each open thread: \
     make the change it asks for, reply saying what you changed, and resolve it. If you disagree or can't do it, reply \
     explaining why and leave it open. Never resolve a thread without a change or a reason. Finish with a short summary.";

/// An in-app run passes `--token`; an agent the user runs in a terminal passes `--terminal` and names the
/// repository with each call (its working directory, or the tool's `path`).
struct Args {
    socket: String,
    token: Option<String>,
    terminal: bool,
    /// The app's link scheme, for `open_in_diffity`: `diffity`, or `diffity-dev` for the dev build.
    scheme: String,
}

fn parse_args() -> anyhow::Result<Args> {
    let mut socket = std::env::var("DIFFITY_MCP_SOCKET").ok();
    let mut token = std::env::var("DIFFITY_MCP_TOKEN").ok();
    let mut terminal = false;
    let mut scheme = "diffity".to_string();
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--socket" => socket = it.next(),
            "--token" => token = it.next(),
            "--terminal" => terminal = true,
            "--scheme" => scheme = it.next().unwrap_or(scheme),
            _ => {}
        }
    }
    let Some(socket) = socket else {
        anyhow::bail!("missing --socket");
    };
    if token.is_none() && !terminal {
        anyhow::bail!("missing --token");
    }
    Ok(Args { socket, token, terminal, scheme })
}

type Conn = (BufReader<OwnedReadHalf>, OwnedWriteHalf);

struct Bridge {
    socket: String,
    token: Option<String>,
    conn: Mutex<Option<Conn>>,
}

/// The `Diffity.app` this binary was bundled in, when it was.
fn app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().and_then(std::fs::canonicalize).ok()?;
    exe.ancestors().find(|dir| dir.extension().is_some_and(|ext| ext == "app")).map(Path::to_path_buf)
}

impl Bridge {
    async fn exchange(conn: &mut Conn, line: &str) -> std::io::Result<String> {
        conn.1.write_all(line.as_bytes()).await?;
        conn.1.flush().await?;
        let mut response = String::new();
        let n = conn.0.read_line(&mut response).await?;
        if n == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "diffity closed the connection",
            ));
        }
        Ok(response)
    }

    /// Connects to the app. A terminal agent's call starts Diffity in the background when it isn't running and
    /// waits for it; an in-app run's app is always running.
    async fn connect(&self, launch: bool) -> Result<Conn, String> {
        match UnixStream::connect(&self.socket).await {
            Ok(stream) => return Ok(split(stream)),
            Err(e) if !launch => return Err(format!("Diffity app is not reachable ({e}). Is it still running?")),
            Err(_) => {}
        }
        let Some(bundle) = app_bundle() else {
            return Err("Diffity isn't running. Open it and try again.".into());
        };
        let launched = tokio::process::Command::new("open").arg("-g").arg(&bundle).status().await;
        if !launched.is_ok_and(|s| s.success()) {
            return Err("Couldn't start Diffity. Is it installed?".into());
        }
        for _ in 0..50 {
            tokio::time::sleep(Duration::from_millis(200)).await;
            if let Ok(stream) = UnixStream::connect(&self.socket).await {
                return Ok(split(stream));
            }
        }
        Err("Diffity started but didn't answer. Try again in a moment.".into())
    }

    async fn call(&self, request: Value) -> Result<Value, String> {
        let mut line = request.to_string();
        line.push('\n');
        let launch = self.token.is_none();
        let mut guard = self.conn.lock().await;
        let mut last_err = String::new();
        for _ in 0..2 {
            if guard.is_none() {
                *guard = Some(self.connect(launch).await?);
            }
            let Some(conn) = guard.as_mut() else {
                continue;
            };
            match Self::exchange(conn, &line).await {
                Ok(response) => {
                    let parsed: Value = serde_json::from_str(response.trim())
                        .map_err(|e| format!("bad response from diffity: {e}"))?;
                    if parsed.get("ok").and_then(Value::as_bool) == Some(true) {
                        return Ok(parsed.get("result").cloned().unwrap_or(Value::Null));
                    }
                    let message = parsed
                        .get("error")
                        .and_then(Value::as_str)
                        .unwrap_or("unknown error");
                    return Err(message.to_string());
                }
                Err(e) => {
                    last_err = e.to_string();
                    *guard = None;
                }
            }
        }
        Err(format!("lost connection to diffity: {last_err}"))
    }
}

fn split(stream: UnixStream) -> Conn {
    let (r, w) = stream.into_split();
    (BufReader::new(r), w)
}

/// The git top level of `path` (relative to the working directory), canonicalized the way the `diffity` command
/// does, so a worktree under `/tmp` and `/private/tmp` is one review.
async fn repo_root(path: Option<&str>) -> Result<String, String> {
    let cwd = std::env::current_dir().map_err(|e| format!("no working directory: {e}"))?;
    let dir = match path.map(str::trim).filter(|p| !p.is_empty()) {
        Some(p) if p.starts_with("~/") => std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default().join(&p[2..]),
        Some(p) => cwd.join(p),
        None => cwd,
    };
    let out = tokio::process::Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .await
        .map_err(|e| format!("could not run git: {e}"))?;
    if !out.status.success() {
        return Err(format!("{} isn't inside a git repository.", dir.display()));
    }
    let top = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok(std::fs::canonicalize(&top).map(|p| p.to_string_lossy().into_owned()).unwrap_or(top))
}

fn query_escape(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[derive(Clone)]
struct Server {
    bridge: Arc<Bridge>,
    terminal: bool,
    scheme: String,
}

fn render(value: Value) -> String {
    match value {
        Value::String(s) => s,
        other => serde_json::to_string_pretty(&other).unwrap_or_else(|_| other.to_string()),
    }
}

impl Server {
    async fn call_terminal(&self, name: &str, args: Value, client: String) -> Result<String, String> {
        let path = args.get("path").and_then(Value::as_str).map(String::from);
        let repo = repo_root(path.as_deref()).await?;
        if name == tools::OPEN_TOOL {
            return self.open_in_app(&repo, args.get("ref").and_then(Value::as_str)).await;
        }
        let request = json!({ "terminal": { "client": client, "repo": repo }, "tool": name, "args": args });
        let answer = self.bridge.call(request).await?;
        let review = answer.get("review").and_then(Value::as_str).unwrap_or_default().to_string();
        let result = render(answer.get("result").cloned().unwrap_or(Value::Null));
        Ok(format!("{review}\n\n{result}"))
    }

    async fn open_in_app(&self, repo: &str, r#ref: Option<&str>) -> Result<String, String> {
        let mut link = format!("{}://open?path={}", self.scheme, query_escape(repo));
        if let Some(r) = r#ref.map(str::trim).filter(|r| !r.is_empty()) {
            link.push_str(&format!("&ref={}", query_escape(r)));
        }
        let status = tokio::process::Command::new("open").arg(&link).status().await;
        if !status.is_ok_and(|s| s.success()) {
            return Err("Couldn't open Diffity. Is it installed?".into());
        }
        let name = Path::new(repo).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        Ok(format!("Opened {name} in Diffity."))
    }
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerConfig {
        let capabilities = if self.terminal {
            ServerCapabilities::builder().enable_tools().enable_prompts().build()
        } else {
            ServerCapabilities::builder().enable_tools().build()
        };
        let instructions = if self.terminal {
            "Diffity is the desktop app where the user reviews your changes and leaves comments. These tools read and \
             answer those comments for the repository you are working in. When the user asks you to address their \
             Diffity review (or their review comments), list the threads, make the changes, then reply to and resolve \
             each one. Each answer starts with a line naming the repository and the Diffity view it read; mention it \
             when it isn't what the user expects."
        } else {
            "Tools for the Diffity code-review session the user has open: read the diff under review, \
             list review threads, and leave, reply to, resolve or dismiss review comments."
        };
        ServerConfig::new(capabilities)
            .with_server_info(Implementation::new("diffity", env!("CARGO_PKG_VERSION")))
            .with_instructions(instructions)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        // Agents list tools at every session start; a terminal agent must not start Diffity just for that.
        if self.terminal {
            return Ok(ListToolsResult::with_all_items(tools::terminal()));
        }
        let allowed: Option<Vec<String>> = self
            .bridge
            .call(json!({ "token": self.bridge.token, "tool": LIST_TOOLS, "args": Value::Null }))
            .await
            .ok()
            .and_then(|v| serde_json::from_value(v).ok());
        let tools = tools::all()
            .into_iter()
            .filter(|t| {
                allowed
                    .as_ref()
                    .is_none_or(|names| names.iter().any(|n| n == t.name.as_ref()))
            })
            .collect();
        Ok(ListToolsResult::with_all_items(tools)
            .with_ttl_ms(0)
            .with_cache_scope(CacheScope::Private))
    }

    async fn list_prompts(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListPromptsResult, ErrorData> {
        if !self.terminal {
            return Ok(ListPromptsResult::default());
        }
        let address = Prompt::new(ADDRESS_PROMPT, Some("Address your open Diffity review comments"), None);
        Ok(ListPromptsResult::with_all_items(vec![address]))
    }

    async fn get_prompt(
        &self,
        request: GetPromptRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<GetPromptResponse, ErrorData> {
        if !self.terminal || request.name != ADDRESS_PROMPT {
            return Err(ErrorData::invalid_params(format!("unknown prompt `{}`", request.name), None));
        }
        Ok(GetPromptResult::new(vec![PromptMessage::new_text(Role::User, ADDRESS_TEXT)]).into())
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let args = request.arguments.map(Value::Object).unwrap_or(Value::Null);
        let outcome = if self.terminal {
            let client = context.peer.peer_info().map(|info| info.client_info.name.clone()).unwrap_or_default();
            self.call_terminal(&request.name, args, client).await
        } else {
            self.bridge
                .call(json!({ "token": self.bridge.token, "tool": request.name, "args": args }))
                .await
                .map(render)
        };
        let result = match outcome {
            Ok(text) => CallToolResult::success(vec![ContentBlock::text(text)]),
            Err(message) => CallToolResult::error(vec![ContentBlock::text(message)]),
        };
        Ok(result.into())
    }
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let args = parse_args()?;
    let server = Server {
        bridge: Arc::new(Bridge {
            socket: args.socket,
            token: args.token,
            conn: Mutex::new(None),
        }),
        terminal: args.terminal,
        scheme: args.scheme,
    };
    let service = server.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}
