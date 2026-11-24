use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

use tokio::process::Command;

use crate::agents::types::AgentInfo;

pub const CLAUDE_ACP_PACKAGE: &str = "@agentclientprotocol/claude-agent-acp@0.84.0";
pub const CODEX_ACP_PACKAGE: &str = "@agentclientprotocol/codex-acp@2.0.0";

const PROBE_TIMEOUT: Duration = Duration::from_secs(8);

/// Config Diffity starts OpenCode with (`OPENCODE_CONFIG_CONTENT`, which outranks the user's config
/// files; the project's are off, see `opencode_launch`). OpenCode allows edits and shell commands
/// without asking by default, but Diffity keeps reviews read-only by answering permission requests,
/// so edits, commands and fetches must ask. The rules are repeated on the `build` agent because a
/// user's config can grant that agent more, and subagents are denied because one may be set up to
/// edit freely. Runs always use `build` (see `RunPermissions::acp_mode_id`).
pub const OPENCODE_CONFIG: &str = r#"{"permission":{"edit":"ask","bash":"ask","webfetch":"ask","task":"deny"},"agent":{"build":{"permission":{"edit":"ask","bash":"ask","webfetch":"ask","task":"deny"}}}}"#;

/// The oldest pi with what Diffity relies on: MCP servers registered by an extension (0.99), `*` patterns in
/// `--tools` (1.0.4), `--tools +name` and `aborted` on `agent_settled` (1.1.0).
pub const PI_MIN_VERSION: (u64, u64, u64) = (1, 1, 0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentKind {
    Claude,
    Codex,
    Gemini,
    OpenCode,
    Pi,
}

/// How Diffity talks to an agent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Transport {
    /// Agent Client Protocol, spoken by the agent or by an adapter in front of it.
    Acp,
    /// pi's own JSON-lines RPC mode (`pi --mode rpc`).
    PiRpc,
}

impl AgentKind {
    pub const ALL: [AgentKind; 5] = [AgentKind::Claude, AgentKind::Codex, AgentKind::Gemini, AgentKind::OpenCode, AgentKind::Pi];
    /// Agents exposed to the app. Gemini launch code is kept intact — add it here to enable it.
    pub const ENABLED: [AgentKind; 4] = [AgentKind::Claude, AgentKind::Codex, AgentKind::OpenCode, AgentKind::Pi];

    pub fn transport(self) -> Transport {
        match self {
            Self::Pi => Transport::PiRpc,
            _ => Transport::Acp,
        }
    }

    pub fn is_enabled(self) -> bool {
        Self::ENABLED.contains(&self)
    }

    /// Settings key holding a user-provided binary path (Settings → custom binary path).
    pub fn path_setting_key(self) -> String {
        format!("agent.{}.path", self.id())
    }

    /// Settings key caching the models the agent offers.
    pub fn models_setting_key(self) -> String {
        format!("agent.{}.models", self.id())
    }

    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "claude" => Some(Self::Claude),
            "codex" => Some(Self::Codex),
            "gemini" => Some(Self::Gemini),
            "opencode" => Some(Self::OpenCode),
            "pi" => Some(Self::Pi),
            _ => None,
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
            Self::OpenCode => "opencode",
            Self::Pi => "pi",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::Claude => "Claude Code",
            Self::Codex => "Codex",
            Self::Gemini => "Gemini",
            Self::OpenCode => "OpenCode",
            Self::Pi => "Pi",
        }
    }

    fn cli_binary(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Gemini => "gemini",
            Self::OpenCode => "opencode",
            Self::Pi => "pi",
        }
    }

    fn adapter(self) -> Option<(&'static str, &'static str)> {
        match self {
            Self::Claude => Some(("claude-agent-acp", CLAUDE_ACP_PACKAGE)),
            Self::Codex => Some(("codex-acp", CODEX_ACP_PACKAGE)),
            Self::Gemini | Self::OpenCode | Self::Pi => None,
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

/// OpenCode speaks ACP itself, so no adapter or Node.js is needed. Project config is turned off:
/// OpenCode starts a project's MCP servers and plugins as soon as a session opens, so a branch under
/// review could run code before any permission is asked. That also drops the project's `AGENTS.md`.
fn opencode_launch(bin: &Path) -> LaunchSpec {
    LaunchSpec {
        command: bin.to_path_buf(),
        args: vec!["acp".into()],
        env: vec![
            ("OPENCODE_CONFIG_CONTENT".into(), OPENCODE_CONFIG.into()),
            ("OPENCODE_DISABLE_PROJECT_CONFIG".into(), "1".into()),
        ],
    }
}

/// pi in RPC mode. Project-local `.pi/` extensions, MCP servers and settings are skipped
/// (`--no-approve`): pi would otherwise load them for a trusted folder, so a branch under review could
/// run code before any permission is asked. The user's own extensions and providers still load. The
/// per-chat flags (session, tools, Diffity's extension) are added when a session starts.
fn pi_launch(bin: &Path) -> LaunchSpec {
    LaunchSpec {
        command: bin.to_path_buf(),
        args: vec!["--mode".into(), "rpc".into(), "--no-approve".into()],
        env: vec![("PI_SKIP_VERSION_CHECK".into(), "1".into())],
    }
}

fn parse_version(text: &str) -> Option<(u64, u64, u64)> {
    let word = text
        .split_whitespace()
        .map(|w| w.trim_start_matches('v'))
        .find(|w| w.chars().next().is_some_and(|c| c.is_ascii_digit()))?;
    let mut parts = word.split(['.', '-', '+']).map(|p| p.parse::<u64>().ok());
    Some((parts.next()??, parts.next()??, parts.next().flatten().unwrap_or(0)))
}

/// `pi --version`, checked against `PI_MIN_VERSION`. Another program called `pi` fails here.
async fn pi_launch_checked(bin: &Path) -> Result<LaunchSpec, String> {
    let Some(out) = probe(bin, &["--version"]).await.filter(|o| o.success) else {
        return Err(format!(
            "`{}` didn't answer `--version`. Is it the pi coding agent? Install it with `npm i -g @earendil-works/pi-coding-agent`.",
            bin.display()
        ));
    };
    let Some(version) = parse_version(&out.stdout) else {
        return Err(format!("Couldn't read the pi version from `{}`.", out.stdout.trim()));
    };
    if version < PI_MIN_VERSION {
        let (a, b, c) = version;
        let (x, y, z) = PI_MIN_VERSION;
        return Err(format!("Diffity needs pi {x}.{y}.{z} or newer (found {a}.{b}.{c}). Run `pi update`, then click Re-detect."));
    }
    Ok(pi_launch(bin))
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
            "Found {name}, but Diffity also needs Node.js to talk to it. Install Node.js from nodejs.org or with `brew install node`, then click Re-detect.",
            name = kind.display_name()
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

/// A custom path may point at the agent CLI (`claude`, `codex`, `gemini`, `opencode`, `pi`) or directly at the ACP
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
        AgentKind::OpenCode => Ok(opencode_launch(&cli)),
        AgentKind::Pi => pi_launch_checked(&cli).await,
    };
    info.authenticated = match kind {
        AgentKind::Claude => claude_authenticated(&cli).await,
        AgentKind::Codex => codex_authenticated(&cli).await,
        // Providers are signed in one by one (OpenCode also has free models); the model list shows which.
        AgentKind::Gemini | AgentKind::OpenCode | AgentKind::Pi => None,
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
    note_sign_in(kind, &mut info);
    DetectedAgent {
        kind,
        info,
        launch: Some(launch),
    }
}

/// What to tell the user about signing in. pi signs in per provider, so it is never marked logged out: a run
/// without a usable model fails with pi's own reason.
fn note_sign_in(kind: AgentKind, info: &mut AgentInfo) {
    if kind == AgentKind::Pi {
        if crate::agents::pi::has_credentials() {
            info.authenticated = Some(true);
        } else {
            info.note = Some("No provider found yet. Run `pi` in a terminal and use /login, or set a provider API key such as ANTHROPIC_API_KEY.".into());
        }
        return;
    }
    if info.authenticated == Some(false) {
        info.note = Some(format!(
            "Run `{} login` in a terminal to sign in",
            kind.cli_binary()
        ));
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
            AgentKind::OpenCode => Ok(opencode_launch(&custom)),
            AgentKind::Pi => pi_launch_checked(&custom).await,
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
    note_sign_in(kind, &mut info);
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
    fn reads_pi_versions() {
        assert_eq!(parse_version("1.6.0\n"), Some((1, 6, 0)));
        assert_eq!(parse_version("pi v0.99.3"), Some((0, 99, 3)));
        assert_eq!(parse_version("1.2"), Some((1, 2, 0)));
        assert_eq!(parse_version("2.0.0-beta.1"), Some((2, 0, 0)));
        assert_eq!(parse_version("usage: pi"), None);
        assert!((0, 99, 3) < PI_MIN_VERSION);
    }

    #[test]
    fn pi_runs_rpc_mode_without_project_resources() {
        let spec = pi_launch(Path::new("/usr/local/bin/pi"));
        assert_eq!(spec.args, vec!["--mode", "rpc", "--no-approve"]);
        assert_eq!(AgentKind::Pi.transport(), Transport::PiRpc);
        assert_eq!(AgentKind::Claude.transport(), Transport::Acp);
    }

    #[test]
    fn claude_codex_opencode_and_pi_enabled() {
        assert!(AgentKind::Claude.is_enabled());
        assert!(AgentKind::Codex.is_enabled());
        assert!(AgentKind::OpenCode.is_enabled());
        assert!(AgentKind::Pi.is_enabled());
        assert!(!AgentKind::Gemini.is_enabled());
        assert_eq!(AgentKind::Claude.path_setting_key(), "agent.claude.path");
    }

    #[test]
    fn opencode_runs_its_own_acp_server_with_permissions_that_ask() {
        let spec = opencode_launch(Path::new("/usr/local/bin/opencode"));
        assert_eq!(spec.command, Path::new("/usr/local/bin/opencode"));
        assert_eq!(spec.args, vec!["acp".to_string()]);
        assert!(spec.env.contains(&("OPENCODE_DISABLE_PROJECT_CONFIG".to_string(), "1".to_string())));
        let (key, value) = &spec.env[0];
        assert_eq!(key, "OPENCODE_CONFIG_CONTENT");
        let config: serde_json::Value = serde_json::from_str(value).unwrap();
        for rules in [&config["permission"], &config["agent"]["build"]["permission"]] {
            for tool in ["edit", "bash", "webfetch"] {
                assert_eq!(rules[tool], "ask", "{tool}");
            }
            assert_eq!(rules["task"], "deny");
        }
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
