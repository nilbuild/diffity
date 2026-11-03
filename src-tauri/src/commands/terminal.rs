//! Settings → Terminal: lets agents the user runs in a terminal reach Diffity (`diffity-mcp --terminal`), and
//! installs the `diffity` command.

use std::path::Path;
use std::process::{Command, Output};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::agents::detect::find_in_path;
use crate::cli_install;
use crate::core::AppError;
use crate::state::AppState;

/// Terminal agents Diffity can register itself with, through their own `mcp add` command.
#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TerminalAgent {
    Claude,
    Codex,
}

impl TerminalAgent {
    const ALL: [TerminalAgent; 2] = [TerminalAgent::Claude, TerminalAgent::Codex];

    fn cli(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
        }
    }

    fn scope_args(self) -> &'static [&'static str] {
        match self {
            Self::Claude => &["--scope", "user"],
            Self::Codex => &[],
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalAgentStatus {
    agent: TerminalAgent,
    /// The agent's command was found on PATH.
    found: bool,
    connected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliCommandStatus {
    name: String,
    path: String,
    installed: bool,
    broken: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatus {
    allowed: bool,
    /// The MCP server's name in agent configs: `diffity`, or `diffity-dev` for the dev build.
    server_name: String,
    /// The command agents run, then its arguments, for setups Diffity can't write itself.
    command: Vec<String>,
    agents: Vec<TerminalAgentStatus>,
    cli: CliCommandStatus,
}

fn server_name() -> &'static str {
    if crate::dev_build() {
        "diffity-dev"
    } else {
        "diffity"
    }
}

fn mcp_command(state: &AppState) -> Vec<String> {
    let mut command = vec![
        state.agents.mcp_binary().to_string_lossy().into_owned(),
        "--terminal".into(),
        "--socket".into(),
        state.agents.socket_path().to_string_lossy().into_owned(),
    ];
    if crate::dev_build() {
        command.extend(["--scheme".into(), "diffity-dev".into()]);
    }
    command
}

/// Runs an agent's CLI, giving up after a while so a hung CLI can't hang Settings.
fn run(program: &Path, args: &[&str]) -> Result<Output, AppError> {
    let mut child = Command::new(program)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| AppError::internal(format!("could not run {}: {e}", program.display())))?;
    let started = std::time::Instant::now();
    loop {
        if child.try_wait().map_err(|e| AppError::internal(e.to_string()))?.is_some() {
            return child.wait_with_output().map_err(|e| AppError::internal(e.to_string()));
        }
        if started.elapsed() > Duration::from_secs(20) {
            let _ = child.kill();
            return Err(AppError::internal(format!("{} did not answer", program.display())));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn agent_status(agent: TerminalAgent) -> TerminalAgentStatus {
    let Some(cli) = find_in_path(agent.cli()) else {
        return TerminalAgentStatus { agent, found: false, connected: false };
    };
    let connected = run(&cli, &["mcp", "get", server_name()]).is_ok_and(|out| out.status.success());
    TerminalAgentStatus { agent, found: true, connected }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, AppError> + Send + 'static) -> Result<T, AppError> {
    tokio::task::spawn_blocking(f).await.map_err(|e| AppError::internal(e.to_string()))?
}

#[tauri::command]
pub async fn terminal_status(state: State<'_, AppState>) -> Result<TerminalStatus, AppError> {
    let allowed = state.agents.terminal_allowed();
    let command = mcp_command(&state);
    let agents = blocking(|| {
        let handles: Vec<_> = TerminalAgent::ALL.into_iter().map(|agent| std::thread::spawn(move || agent_status(agent))).collect();
        Ok(handles.into_iter().filter_map(|h| h.join().ok()).collect())
    })
    .await?;
    let cli = cli_install::status();
    Ok(TerminalStatus {
        allowed,
        server_name: server_name().into(),
        command,
        agents,
        cli: CliCommandStatus { name: cli.name.into(), path: cli.path.to_string_lossy().into_owned(), installed: cli.installed, broken: cli.broken },
    })
}

#[tauri::command]
pub fn terminal_set_allowed(state: State<'_, AppState>, allowed: bool) -> Result<(), AppError> {
    state.agents.set_terminal_allowed(allowed)
}

/// Registers Diffity with the agent for every project (replacing an earlier registration) and allows terminal
/// agents: the click is the consent.
#[tauri::command]
pub async fn terminal_connect(state: State<'_, AppState>, agent: TerminalAgent) -> Result<(), AppError> {
    let command = mcp_command(&state);
    blocking(move || {
        let cli = find_in_path(agent.cli()).ok_or_else(|| AppError::new("not_found", format!("`{}` isn't on your PATH.", agent.cli())))?;
        let mut remove = vec!["mcp", "remove"];
        remove.extend(agent.scope_args());
        remove.push(server_name());
        let _ = run(&cli, &remove);
        let mut add = vec!["mcp", "add"];
        add.extend(agent.scope_args());
        add.extend([server_name(), "--"]);
        add.extend(command.iter().map(String::as_str));
        let out = run(&cli, &add)?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            let detail = if stderr.trim().is_empty() { stdout } else { stderr };
            return Err(AppError::internal(format!("`{} mcp add` failed: {}", agent.cli(), detail.trim())));
        }
        Ok(())
    })
    .await?;
    state.agents.set_terminal_allowed(true)
}

#[tauri::command]
pub async fn terminal_disconnect(agent: TerminalAgent) -> Result<(), AppError> {
    blocking(move || {
        let cli = find_in_path(agent.cli()).ok_or_else(|| AppError::new("not_found", format!("`{}` isn't on your PATH.", agent.cli())))?;
        let mut remove = vec!["mcp", "remove"];
        remove.extend(agent.scope_args());
        remove.push(server_name());
        let out = run(&cli, &remove)?;
        if !out.status.success() && agent_status(agent).connected {
            return Err(AppError::internal(format!("`{} mcp remove` failed: {}", agent.cli(), String::from_utf8_lossy(&out.stderr).trim())));
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn terminal_install_cli() -> Result<String, AppError> {
    blocking(|| cli_install::install().map_err(AppError::internal)).await
}

#[tauri::command]
pub async fn terminal_uninstall_cli() -> Result<(), AppError> {
    blocking(|| cli_install::uninstall().map_err(AppError::internal)).await
}
