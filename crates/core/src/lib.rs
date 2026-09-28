pub mod diff;
pub mod error;
pub mod git;
pub mod store;
pub mod tree;
pub mod types;
pub mod watch;

pub use error::{AppError, Result};
pub use store::Store;
