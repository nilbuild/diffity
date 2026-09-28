pub mod diff;
pub mod editor;
pub mod error;
pub mod git;
pub mod store;
pub mod tree;
pub mod types;
pub mod watch;

use std::path::Path;

pub use error::{AppError, Result};
pub use store::Store;

use types::{DiffFileSummary, DiffResult, TREE_REF};

/// Unified patch + file list for a (repo, ref) pair, without Tauri.
pub fn diff_for_session(repo_path: &str, r#ref: &str, ignore_whitespace: bool) -> Result<DiffResult> {
    diff::get_diff(Path::new(repo_path), r#ref, ignore_whitespace)
}

/// Diff for a stored review session. Fails with `invalid` for the file-browser session (`__tree__`).
pub fn diff_for_session_id(store: &Store, session_id: &str) -> Result<DiffResult> {
    let session = store.get_session_by_id(session_id)?;
    if session.r#ref == TREE_REF {
        return Err(AppError::invalid("the file browser session has no diff"));
    }
    diff_for_session(&session.repo_path, &session.r#ref, false)
}

/// Changed files for a (repo, ref) pair (cheaper to reason about than the full patch).
pub fn diff_files(repo_path: &str, r#ref: &str) -> Result<Vec<DiffFileSummary>> {
    Ok(diff_for_session(repo_path, r#ref, false)?.files)
}
