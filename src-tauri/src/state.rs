use std::path::PathBuf;
use std::sync::Arc;

use crate::agents::AgentManager;
use crate::core::store::Store;
use crate::github::GithubService;

pub struct AppState {
    pub store: Arc<Store>,
    pub agents: Arc<AgentManager>,
    pub github: Arc<GithubService>,
    /// Where task worktrees are created (`~/.diffity/worktrees`).
    pub worktrees_root: PathBuf,
}
