use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use diffity_agents::core_backend::CoreBackend;
use diffity_agents::tools::Binding;
use diffity_agents::{AgentMode, McpBridge};
use diffity_core::types::ThreadStatus;
use diffity_core::Store;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn git(repo: &Path, args: &[&str]) {
    let status = Command::new("git")
        .args([
            "-c",
            "user.name=t",
            "-c",
            "user.email=t@t",
            "-c",
            "commit.gpgsign=false",
        ])
        .args(args)
        .current_dir(repo)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .unwrap();
    assert!(status.success(), "git {args:?}");
}

struct McpClient {
    stdin: tokio::process::ChildStdin,
    stdout: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    next_id: u64,
}

impl McpClient {
    async fn send(&mut self, msg: Value) {
        let mut line = msg.to_string();
        line.push('\n');
        self.stdin.write_all(line.as_bytes()).await.unwrap();
        self.stdin.flush().await.unwrap();
    }

    async fn request(&mut self, method: &str, params: Value) -> Value {
        self.next_id += 1;
        let id = self.next_id;
        self.send(json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }))
            .await;
        loop {
            let line = tokio::time::timeout(Duration::from_secs(10), self.stdout.next_line())
                .await
                .expect("timed out waiting for MCP response")
                .unwrap()
                .expect("diffity-mcp exited");
            let msg: Value = serde_json::from_str(&line).unwrap();
            if msg.get("id") == Some(&json!(id)) {
                return msg;
            }
        }
    }
}

async fn start_client(socket: &Path, token: &str) -> (tokio::process::Child, McpClient) {
    let mut child = tokio::process::Command::new(env!("CARGO_BIN_EXE_diffity-mcp"))
        .args(["--socket", &socket.to_string_lossy(), "--token", token])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let stdin = child.stdin.take().unwrap();
    let stdout = BufReader::new(child.stdout.take().unwrap()).lines();
    let mut client = McpClient {
        stdin,
        stdout,
        next_id: 0,
    };
    let init = client
        .request(
            "initialize",
            json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "test", "version": "0" } }),
        )
        .await;
    assert!(init.get("result").is_some(), "initialize failed: {init}");
    client
        .send(json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }))
        .await;
    (child, client)
}

fn tool_names(list: &Value) -> Vec<String> {
    list["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap().to_string())
        .collect()
}

#[tokio::test]
async fn mcp_tool_call_reaches_bridge_and_creates_thread() {
    let repo_dir = tempfile::tempdir().unwrap();
    let repo = repo_dir.path();
    git(repo, &["init", "-q"]);
    std::fs::write(repo.join("a.txt"), "one\ntwo\nthree\n").unwrap();
    git(repo, &["add", "."]);
    git(repo, &["commit", "-q", "-m", "init"]);
    std::fs::write(repo.join("a.txt"), "one\nTWO\nthree\nfour\n").unwrap();
    let repo_path = repo.canonicalize().unwrap().to_string_lossy().into_owned();

    let store = Arc::new(Store::open_in_memory().unwrap());
    let session = store.get_or_create_session(&repo_path, "work").unwrap();
    let sock_dir = tempfile::Builder::new()
        .prefix("dm")
        .tempdir_in("/tmp")
        .unwrap();
    let socket = sock_dir.path().join("mcp.sock");
    let bridge = McpBridge::new(socket.clone(), Arc::new(CoreBackend::new(store.clone())));
    let notified: Arc<Mutex<Vec<String>>> = Arc::default();
    let sink = notified.clone();
    bridge.set_hook(Arc::new(move |sid: &str| {
        sink.lock().unwrap().push(sid.to_string())
    }));
    bridge.ensure_started().await.unwrap();

    let binding = Binding {
        repo_path: repo_path.clone(),
        session_id: session.id.clone(),
        r#ref: "work".into(),
        mode: AgentMode::Review,
        agent_name: "Claude".into(),
        edit_rejected: Default::default(),
    };
    let token = bridge.register(binding.clone());
    let (_child, mut client) = start_client(&socket, &token).await;

    let list = client.request("tools/list", json!({})).await;
    assert_eq!(tool_names(&list).len(), 7, "{list}");

    let diff = client
        .request("tools/call", json!({ "name": "get_diff", "arguments": {} }))
        .await;
    let text = diff["result"]["content"][0]["text"].as_str().unwrap();
    assert!(text.contains("+TWO"), "{text}");

    let call = client
        .request(
            "tools/call",
            json!({ "name": "add_comment", "arguments": { "file": "a.txt", "startLine": 2, "body": "Why uppercase?", "severity": "question" } }),
        )
        .await;
    assert_ne!(call["result"]["isError"], json!(true), "{call}");

    let threads = store
        .list_threads(&session.id, Some(ThreadStatus::Open))
        .unwrap();
    assert_eq!(threads.len(), 1);
    assert_eq!(threads[0].file_path, "a.txt");
    assert_eq!(threads[0].anchor_content.as_deref(), Some("TWO"));
    assert_eq!(threads[0].comments[0].author_name, "Claude");
    assert_eq!(*notified.lock().unwrap(), vec![session.id.clone()]);

    let bad = client
        .request("tools/call", json!({ "name": "add_comment", "arguments": { "file": "nope.txt", "startLine": 1, "body": "x" } }))
        .await;
    assert_eq!(bad["result"]["isError"], json!(true), "{bad}");

    let out_of_range = client
        .request("tools/call", json!({ "name": "add_comment", "arguments": { "file": "a.txt", "startLine": 40, "body": "x" } }))
        .await;
    assert_eq!(
        out_of_range["result"]["isError"],
        json!(true),
        "{out_of_range}"
    );

    let short = &threads[0].id[..8];
    let resolved = client
        .request("tools/call", json!({ "name": "resolve", "arguments": { "threadId": short, "summary": "Intentional." } }))
        .await;
    assert_ne!(resolved["result"]["isError"], json!(true), "{resolved}");
    let thread = store.get_thread(&threads[0].id).unwrap();
    assert_eq!(thread.status, ThreadStatus::Resolved);
    assert_eq!(thread.comments.len(), 2);

    let ask_token = bridge.register(Binding {
        mode: AgentMode::Ask,
        ..binding
    });
    let (_ask_child, mut ask) = start_client(&socket, &ask_token).await;
    let list = ask.request("tools/list", json!({})).await;
    assert_eq!(tool_names(&list), ["get_diff", "list_threads"]);
    let denied = ask
        .request(
            "tools/call",
            json!({ "name": "add_general_comment", "arguments": { "body": "x" } }),
        )
        .await;
    assert_eq!(denied["result"]["isError"], json!(true), "{denied}");
}
