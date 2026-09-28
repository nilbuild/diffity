use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use crate::types::AgentInfo;

pub const CLAUDE_ACP_PACKAGE: &str = "@agentclientprotocol/claude-agent-acp@0.84.0";
pub const CODEX_ACP_PACKAGE: &str = "@agentclientprotocol/codex-acp@2.0.0";

const PROBE_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentKind {
    Claude,
    Codex,
    Gemini,
}

impl AgentKind {
    pub const ALL: [AgentKind; 3] = [AgentKind::Claude, AgentKind::Codex, AgentKind::Gemini];
    /// Agents exposed to the app. Only Claude Code is supported for now; Codex/Gemini launch code is
    /// kept intact — add them back here to re-enable.
    pub const ENABLED: [AgentKind; 1] = [AgentKind::Claude];

    pub fn is_enabled(self) -> bool {
        Self::ENABLED.contains(&self)
    }

    /// Settings key holding a user-provided binary path (Settings → custom binary path).
    pub fn path_setting_key(self) -> String {
        format!("agent.{}.path", self.id())
    }

    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "gemini" => Some(Self::Gemini),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Claude => "Claude Code",
            Self::Codex => "Codex",
            Self::Gemini => "Gemini",
        }
    }

    fn cli_binary(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
        }
    }

    fn adapter(self) -> Option<(&'static str, &'static str)> {
        match self {
            Self::Claude => Some(("claude-agent-acp", CLAUDE_ACP_PACKAGE)),
            Self::Codex => Some(("codex-acp", CODEX_ACP_PACKAGE)),
            Self::Gemini => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaunchSpec {
    pub command: PathBuf,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

#[derive(Debug, Clone)]
pub struct DetectedAgent {
    pub kind: AgentKind,
    pub info: AgentInfo,
    pub launch: Option<LaunchSpec>,
}

pub fn find_in_path(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| is_executable(candidate))
}

fn is_executable(path: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(path) else {
        return false;
    };
    if !meta.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

struct ProbeOutput {
    success: bool,
    stdout: String,
}

async fn probe(bin: &Path, args: &[&str]) -> Option<ProbeOutput> {
    let child = Command::new(bin)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .output();
    let output = tokio::time::timeout(PROBE_TIMEOUT, child)
        .await
        .ok()?
        .ok()?;
    Some(ProbeOutput {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
    })
}

async fn claude_authenticated(bin: &Path) -> Option<bool> {
    let out = probe(bin, &["auth", "status", "--json"]).await?;
    let value: serde_json::Value = serde_json::from_str(out.stdout.trim()).ok()?;
    value.get("loggedIn").and_then(|v| v.as_bool())
}

async fn codex_authenticated(bin: &Path) -> Option<bool> {
    probe(bin, &["login", "status"]).await.map(|o| o.success)
}

async fn gemini_acp_flag(bin: &Path) -> &'static str {
    match probe(bin, &["--help"]).await {
        Some(out)
            if !out.stdout.contains("--acp ") && out.stdout.contains("--experimental-acp") =>
        {
            "--experimental-acp"
        }
        _ => "--acp",
    }
}

pub fn adapter_launch(kind: AgentKind, npx: Option<&Path>) -> Result<LaunchSpec, String> {
    let Some((bin, package)) = kind.adapter() else {
        return Err("no adapter".into());
    };
    if let Some(path) = find_in_path(bin) {
        return Ok(LaunchSpec {
            command: path,
            args: vec![],
            env: vec![],
        });
    }
    let Some(npx) = npx else {
        return Err(format!(
            "Node.js (npx) is required to run {package}, or install `{bin}` on PATH"
        ));
    };
    Ok(LaunchSpec {
        command: npx.to_path_buf(),
        args: vec!["-y".into(), package.into()],
        env: vec![],
    })
}

fn expand_home(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}

/// A custom path may point at the agent CLI (`claude`, `codex`, `gemini`) or directly at the ACP
/// adapter (`claude-agent-acp`, `codex-acp`).
fn is_adapter_path(kind: AgentKind, path: &Path) -> bool {
    let Some((adapter, _)) = kind.adapter() else {
        return false;
    };
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with(adapter))
}

pub async fn detect(kind: AgentKind) -> DetectedAgent {
    detect_with(kind, None).await
}

pub async fn detect_with(kind: AgentKind, custom_path: Option<&str>) -> DetectedAgent {
    let custom = custom_path
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(expand_home);
    if let Some(custom) = custom {
        return detect_custom(kind, custom).await;
    }
    let cli = find_in_path(kind.cli_binary());
    let mut info = AgentInfo {
        id: kind.id().into(),
        name: kind.display_name().into(),
        installed: false,
        binary_path: cli.as_ref().map(|p| p.to_string_lossy().into_owned()),
        authenticated: None,
        note: None,
    };
    let Some(cli) = cli else {
        info.note = Some(format!("`{}` not found on PATH", kind.cli_binary()));
        return DetectedAgent {
            kind,
            info,
            launch: None,
        };
    };

    let launch = match kind {
        AgentKind::Gemini => Ok(LaunchSpec {
            command: cli.clone(),
            args: vec![gemini_acp_flag(&cli).await.into()],
            env: vec![],
        }),
        AgentKind::Codex => adapter_launch(kind, find_in_path("npx").as_deref()).map(|mut spec| {
            if std::env::var_os("CODEX_PATH").is_none() {
                spec.env
                    .push(("CODEX_PATH".into(), cli.to_string_lossy().into_owned()));
            }
            spec
        }),
        AgentKind::Claude => adapter_launch(kind, find_in_path("npx").as_deref()),
    };
    info.authenticated = match kind {
        AgentKind::Claude => claude_authenticated(&cli).await,
        AgentKind::Codex => codex_authenticated(&cli).await,
        AgentKind::Gemini => None,
    };

    let launch = match launch {
        Ok(spec) => spec,
        Err(note) => {
            info.note = Some(note);
            return DetectedAgent {
                kind,
                info,
                launch: None,
            };
        }
    };
    info.installed = true;
    if info.authenticated == Some(false) {
        info.note = Some(format!(
            "Run `{} login` in a terminal to sign in",
            kind.cli_binary()
        ));
    }
    DetectedAgent {
        kind,
        info,
        launch: Some(launch),
    }
}

async fn detect_custom(kind: AgentKind, custom: PathBuf) -> DetectedAgent {
    let display = custom.to_string_lossy().into_owned();
    let mut info = AgentInfo {
        id: kind.id().into(),
        name: kind.display_name().into(),
        installed: false,
        binary_path: Some(display.clone()),
        authenticated: None,
        note: None,
    };
    if !is_executable(&custom) {
        info.note = Some(format!("Custom path `{display}` is not an executable file"));
        return DetectedAgent {
            kind,
            info,
            launch: None,
        };
    }

    let (launch, auth_cli) = if is_adapter_path(kind, &custom) {
        let spec = LaunchSpec {
            command: custom.clone(),
            args: vec![],
            env: vec![],
        };
        (Ok(spec), find_in_path(kind.cli_binary()))
    } else {
        let launch = match kind {
            AgentKind::Gemini => Ok(LaunchSpec {
                command: custom.clone(),
                args: vec![gemini_acp_flag(&custom).await.into()],
                env: vec![],
            }),
            AgentKind::Codex => adapter_launch(kind, find_in_path("npx").as_deref()).map(|mut spec| {
                spec.env.push(("CODEX_PATH".into(), display.clone()));
                spec
            }),
            AgentKind::Claude => adapter_launch(kind, find_in_path("npx").as_deref()).map(|mut spec| {
                spec.env
                    .push(("CLAUDE_CODE_EXECUTABLE".into(), display.clone()));
                spec
            }),
        };
        (launch, Some(custom.clone()))
    };

    info.authenticated = match (kind, auth_cli.as_deref()) {
        (AgentKind::Claude, Some(cli)) => claude_authenticated(cli).await,
        (AgentKind::Codex, Some(cli)) => codex_authenticated(cli).await,
        _ => None,
    };
    let launch = match launch {
        Ok(spec) => spec,
        Err(note) => {
            info.note = Some(note);
            return DetectedAgent {
                kind,
                info,
                launch: None,
            };
        }
    };
    info.installed = true;
    if info.authenticated == Some(false) {
        info.note = Some(format!(
            "Run `{} login` in a terminal to sign in",
            kind.cli_binary()
        ));
    }
    DetectedAgent {
        kind,
        info,
        launch: Some(launch),
    }
}

/// Detects every enabled agent. `custom_paths` maps agent id → user-provided binary path.
pub async fn detect_all(custom_paths: &std::collections::HashMap<String, String>) -> Vec<DetectedAgent> {
    let mut out = Vec::with_capacity(AgentKind::ENABLED.len());
    for kind in AgentKind::ENABLED {
        out.push(detect_with(kind, custom_paths.get(kind.id()).map(String::as_str)).await);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_round_trip() {
        for kind in AgentKind::ALL {
            assert_eq!(AgentKind::from_id(kind.id()), Some(kind));
        }
        assert_eq!(AgentKind::from_id("nope"), None);
    }

    #[test]
    fn adapter_falls_back_to_npx() {
        let spec = adapter_launch(AgentKind::Codex, Some(Path::new("/usr/bin/npx")));
        let Ok(spec) = spec else {
            return;
        };
        if spec.command == Path::new("/usr/bin/npx") {
            assert_eq!(
                spec.args,
                vec!["-y".to_string(), CODEX_ACP_PACKAGE.to_string()]
            );
        }
        assert!(adapter_launch(AgentKind::Gemini, None).is_err());
    }

    #[test]
    fn only_claude_enabled() {
        assert!(AgentKind::Claude.is_enabled());
        assert!(!AgentKind::Codex.is_enabled());
        assert!(!AgentKind::Gemini.is_enabled());
        assert_eq!(AgentKind::Claude.path_setting_key(), "agent.claude.path");
    }

    #[tokio::test]
    async fn custom_path_that_is_not_executable_is_reported() {
        let agent = detect_with(AgentKind::Claude, Some("/definitely/not/here/claude")).await;
        assert!(!agent.info.installed);
        assert!(agent.launch.is_none());
        assert_eq!(agent.info.binary_path.as_deref(), Some("/definitely/not/here/claude"));
        assert!(agent.info.note.unwrap().contains("not an executable"));
    }

    #[tokio::test]
    async fn custom_adapter_path_is_launched_directly() {
        let dir = std::env::temp_dir().join(format!("diffity-detect-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let adapter = dir.join("claude-agent-acp");
        std::fs::write(&adapter, "#!/bin/sh\nexit 0\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&adapter, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let agent = detect_with(AgentKind::Claude, adapter.to_str()).await;
        assert!(agent.info.installed);
        assert_eq!(agent.launch.unwrap().command, adapter);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
