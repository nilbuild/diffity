use std::future::Future;
use std::pin::Pin;

use diffity_core::types::{
    AuthorType, DiffResult, NewThread, Review, ReviewSession, Side, Thread, ThreadStatus,
};
use diffity_core::Result;

pub type BoxFut<'a, T> = Pin<Box<dyn Future<Output = Result<T>> + Send + 'a>>;

/// Review data the MCP tools operate on. Implemented over `diffity_core` in production and faked in tests.
pub trait ReviewBackend: Send + Sync + 'static {
    fn session(&self, session_id: &str) -> BoxFut<'_, ReviewSession>;
    fn get_or_create_session(&self, repo_path: &str, r#ref: &str) -> BoxFut<'_, ReviewSession>;
    fn diff(&self, repo_path: &str, r#ref: &str) -> BoxFut<'_, DiffResult>;
    /// Number of lines of `path` on `side`, `None` when the file does not exist on that side.
    fn side_line_count(
        &self,
        repo_path: &str,
        r#ref: &str,
        path: &str,
        old_path: Option<&str>,
        side: Side,
    ) -> BoxFut<'_, Option<u32>>;
    fn list_threads(
        &self,
        session_id: &str,
        status: Option<ThreadStatus>,
    ) -> BoxFut<'_, Vec<Thread>>;
    fn find_thread(&self, session_id: &str, id_or_prefix: &str) -> BoxFut<'_, Thread>;
    /// Thread by full id in any session (includes pending drafts; callers filter).
    fn get_thread(&self, thread_id: &str) -> BoxFut<'_, Thread>;
    fn get_review(&self, review_id: &str) -> BoxFut<'_, Review>;
    fn create_thread(&self, input: NewThread) -> BoxFut<'_, Thread>;
    fn add_reply(
        &self,
        thread_id: &str,
        body: &str,
        author_type: AuthorType,
        author_name: &str,
    ) -> BoxFut<'_, Thread>;
    fn set_thread_status(
        &self,
        thread_id: &str,
        status: ThreadStatus,
        summary: Option<&str>,
        author_name: &str,
    ) -> BoxFut<'_, Thread>;
}
