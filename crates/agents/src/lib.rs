pub mod backend;
pub mod bridge;
mod chats;
pub mod core_backend;
pub mod detect;
pub mod manager;
pub mod mentions {
    pub use diffity_core::mentions::*;
}
pub mod patch;
pub mod policy;
pub mod prompts;
pub mod session;
pub mod tools;
pub mod types;

pub use backend::ReviewBackend;
pub use bridge::{McpBridge, ThreadsChangedHook};
pub use manager::AgentManager;
pub use types::*;
