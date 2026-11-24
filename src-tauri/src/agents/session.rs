//! A running agent, whatever protocol it speaks: ACP (Claude Code, Codex, OpenCode) or pi's RPC mode.

use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::agents::acp::{self, AcpSession};
use crate::agents::detect::{AgentKind, LaunchSpec, Transport};
use crate::agents::pi::{self, PiSession};
use crate::agents::policy::RunPermissions;
use crate::agents::types::{AgentEvent, AgentMode, ModelCatalog, RunModel};
use crate::core::Result;

pub use crate::agents::run_state::{EventSink, PermissionBroker};

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
    /// Other projects the agent may work in besides `cwd`; edits there follow the run's permissions.
    pub additional_dirs: Vec<PathBuf>,
    /// The app's data folder, for files an agent needs on disk (pi's Diffity extension).
    pub data_dir: PathBuf,
}

pub enum AgentSession {
    Acp(AcpSession),
    Pi(Box<PiSession>),
}

impl AgentSession {
    pub async fn start(config: SessionConfig) -> Result<Self> {
        match config.agent.transport() {
            Transport::Acp => AcpSession::start(config).await.map(Self::Acp),
            Transport::PiRpc => PiSession::start(config).await.map(|s| Self::Pi(Box::new(s))),
        }
    }

    /// The agent's own id for the session, kept so a later run picks the conversation up again.
    pub fn session_id(&self) -> &str {
        match self {
            Self::Acp(s) => &s.session_id,
            Self::Pi(s) => &s.session_id,
        }
    }

    pub fn is_alive(&self) -> bool {
        match self {
            Self::Acp(s) => s.is_alive(),
            Self::Pi(s) => s.is_alive(),
        }
    }

    pub async fn prompt(&self, text: String, run: RunPermissions, model: RunModel, sink: EventSink) -> Result<Vec<AgentEvent>> {
        match self {
            Self::Acp(s) => s.prompt(text, run, model, sink).await,
            Self::Pi(s) => s.prompt(text, run, model, sink).await,
        }
    }

    pub fn cancel(&self) {
        match self {
            Self::Acp(s) => s.cancel(),
            Self::Pi(s) => s.cancel(),
        }
    }

    pub async fn close(&self) {
        match self {
            Self::Acp(s) => s.close().await,
            Self::Pi(s) => s.close().await,
        }
    }
}

/// Reads the models an agent offers from a throwaway session. Nothing is prompted, so it costs no tokens.
pub async fn probe_models(kind: AgentKind, launch: LaunchSpec, cwd: PathBuf) -> Result<Option<ModelCatalog>> {
    match kind.transport() {
        Transport::Acp => acp::probe_models(launch, cwd).await,
        Transport::PiRpc => pi::probe_models(launch, cwd).await,
    }
}
