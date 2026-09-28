mod tools;

use std::sync::Arc;

use rmcp::handler::server::ServerHandler;
use rmcp::model::{
    CacheScope, CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock,
    Implementation, ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig,
};
use rmcp::service::{RequestContext, RoleServer};
use rmcp::{ErrorData, ServiceExt};
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::unix::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::UnixStream;
use tokio::sync::Mutex;

const LIST_TOOLS: &str = "__list_tools";

struct Args {
    socket: String,
    token: String,
}

fn parse_args() -> anyhow::Result<Args> {
    let mut socket = std::env::var("DIFFITY_MCP_SOCKET").ok();
    let mut token = std::env::var("DIFFITY_MCP_TOKEN").ok();
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--socket" => socket = it.next(),
            "--token" => token = it.next(),
            _ => {}
        }
    }
    let Some(socket) = socket else {
        anyhow::bail!("missing --socket");
    };
    let Some(token) = token else {
        anyhow::bail!("missing --token");
    };
    Ok(Args { socket, token })
}

type Conn = (BufReader<OwnedReadHalf>, OwnedWriteHalf);

struct Bridge {
    socket: String,
    token: String,
    conn: Mutex<Option<Conn>>,
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

    async fn call(&self, tool: &str, args: Value) -> Result<Value, String> {
        let mut line = json!({ "token": self.token, "tool": tool, "args": args }).to_string();
        line.push('\n');
        let mut guard = self.conn.lock().await;
        let mut last_err = String::new();
        for _ in 0..2 {
            if guard.is_none() {
                match UnixStream::connect(&self.socket).await {
                    Ok(stream) => {
                        let (r, w) = stream.into_split();
                        *guard = Some((BufReader::new(r), w));
                    }
                    Err(e) => {
                        return Err(format!(
                            "Diffity app is not reachable ({e}). Is it still running?"
                        ))
                    }
                }
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

#[derive(Clone)]
struct Server {
    bridge: Arc<Bridge>,
}

fn render(value: Value) -> String {
    match value {
        Value::String(s) => s,
        other => serde_json::to_string_pretty(&other).unwrap_or_else(|_| other.to_string()),
    }
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("diffity", env!("CARGO_PKG_VERSION")))
            .with_instructions(
                "Tools for the Diffity code-review session the user has open: read the diff under review, \
                 list review threads, and leave, reply to, resolve or dismiss review comments.",
            )
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let allowed: Option<Vec<String>> = self
            .bridge
            .call(LIST_TOOLS, Value::Null)
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

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let args = request.arguments.map(Value::Object).unwrap_or(Value::Null);
        let result = match self.bridge.call(&request.name, args).await {
            Ok(value) => CallToolResult::success(vec![ContentBlock::text(render(value))]),
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
    };
    let service = server.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}
