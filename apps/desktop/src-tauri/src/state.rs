use std::sync::Arc;

use diffity_agents::AgentManager;
use diffity_core::store::Store;
use diffity_github::GithubService;

pub struct AppState {
    pub store: Arc<Store>,
    pub agents: Arc<AgentManager>,
    pub github: Arc<GithubService>,
}
