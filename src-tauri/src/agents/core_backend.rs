use std::path::Path;
use std::sync::Arc;

use crate::core::store::Store;
use crate::core::types::{
    AuthorType, DiffResult, Guide, NewThread, Review, ReviewSession, Side, Thread, ThreadStatus,
};
use crate::core::{AppError, Result};

use crate::agents::backend::{BoxFut, ReviewBackend};

pub struct CoreBackend {
    store: Arc<Store>,
}

impl CoreBackend {
    pub fn new(store: Arc<Store>) -> Self {
        Self { store }
    }
}

async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T> + Send + 'static) -> Result<T> {
    tokio::task::spawn_blocking(f)
        .await
        .map_err(|e| AppError::internal(format!("task failed: {e}")))?
}

impl ReviewBackend for CoreBackend {
    fn save_guide(&self, guide: Guide) -> BoxFut<'_, ()> {
        let store = self.store.clone();
        Box::pin(blocking(move || store.save_guide(&guide)))
    }

    fn session(&self, session_id: &str) -> BoxFut<'_, ReviewSession> {
        let (store, id) = (self.store.clone(), session_id.to_string());
        Box::pin(blocking(move || store.get_session_by_id(&id)))
    }

    fn get_or_create_session(&self, repo_path: &str, r#ref: &str) -> BoxFut<'_, ReviewSession> {
        let (store, repo, r) = (self.store.clone(), repo_path.to_string(), r#ref.to_string());
        Box::pin(blocking(move || store.get_or_create_session(&repo, &r)))
    }

    fn diff(&self, repo_path: &str, r#ref: &str) -> BoxFut<'_, DiffResult> {
        let (repo, r) = (repo_path.to_string(), r#ref.to_string());
        Box::pin(blocking(move || {
            crate::core::diff_for_session(&repo, &r, false)
        }))
    }

    fn side_line_count(
        &self,
        repo_path: &str,
        r#ref: &str,
        path: &str,
        old_path: Option<&str>,
        side: Side,
    ) -> BoxFut<'_, Option<u32>> {
        let (repo, r, p, o) = (
            repo_path.to_string(),
            r#ref.to_string(),
            path.to_string(),
            old_path.map(String::from),
        );
        Box::pin(blocking(move || {
            crate::core::diff::side_line_count(Path::new(&repo), &r, &p, o.as_deref(), side)
        }))
    }

    fn list_threads(
        &self,
        session_id: &str,
        status: Option<ThreadStatus>,
    ) -> BoxFut<'_, Vec<Thread>> {
        let (store, id) = (self.store.clone(), session_id.to_string());
        Box::pin(blocking(move || store.list_threads(&id, status)))
    }

    fn repo_threads(&self, repo_path: &str) -> BoxFut<'_, Vec<(ReviewSession, Thread)>> {
        let (store, repo) = (self.store.clone(), repo_path.to_string());
        Box::pin(blocking(move || store.list_repo_threads(&repo)))
    }

    fn find_thread(&self, session_id: &str, id_or_prefix: &str) -> BoxFut<'_, Thread> {
        let (store, sid, prefix) = (
            self.store.clone(),
            session_id.to_string(),
            id_or_prefix.to_string(),
        );
        Box::pin(blocking(move || {
            store.find_thread_by_prefix(&prefix, Some(&sid))
        }))
    }

    fn get_thread(&self, thread_id: &str) -> BoxFut<'_, Thread> {
        let (store, id) = (self.store.clone(), thread_id.to_string());
        Box::pin(blocking(move || store.get_thread(&id)))
    }

    fn get_review(&self, review_id: &str) -> BoxFut<'_, Review> {
        let (store, id) = (self.store.clone(), review_id.to_string());
        Box::pin(blocking(move || store.get_review(&id)))
    }

    fn create_thread(&self, input: NewThread) -> BoxFut<'_, Thread> {
        let store = self.store.clone();
        Box::pin(blocking(move || store.create_thread(&input)))
    }

    fn add_reply(
        &self,
        thread_id: &str,
        body: &str,
        author_type: AuthorType,
        author_name: &str,
    ) -> BoxFut<'_, Thread> {
        let (store, id, body, name) = (
            self.store.clone(),
            thread_id.to_string(),
            body.to_string(),
            author_name.to_string(),
        );
        Box::pin(blocking(move || {
            store.add_reply(&id, &body, author_type, Some(&name))
        }))
    }

    fn set_thread_status(
        &self,
        thread_id: &str,
        status: ThreadStatus,
        summary: Option<&str>,
        author_name: &str,
    ) -> BoxFut<'_, Thread> {
        let (store, id, summary, name) = (
            self.store.clone(),
            thread_id.to_string(),
            summary.map(String::from),
            author_name.to_string(),
        );
        Box::pin(blocking(move || {
            store.set_thread_status_as(
                &id,
                status,
                summary.as_deref(),
                AuthorType::Agent,
                Some(&name),
            )
        }))
    }
}
