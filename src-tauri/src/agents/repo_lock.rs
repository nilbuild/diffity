//! Agent turns in a project share its checked-out code, and each window queues its own runs, so two windows on one
//! project would otherwise run an agent that edits files beside another reading or editing them. A turn takes the
//! project's lock instead: shared for one that only reads the checkout (a review), exclusive for one that may edit. It's
//! freed when the turn ends, whatever happens to the window that started it. Waiting edits go before later readers.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::{Notify, OwnedRwLockReadGuard, OwnedRwLockWriteGuard, RwLock};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Access {
    /// Reads the checked-out code: runs beside other readers.
    Read,
    /// May edit files: runs alone.
    Write,
}

/// Held for the turn; dropping it lets the next one in.
pub enum RepoTurn {
    Read { _guard: OwnedRwLockReadGuard<()> },
    Write { _guard: OwnedRwLockWriteGuard<()> },
}

#[derive(Default)]
pub struct RepoLocks {
    locks: Mutex<HashMap<String, Arc<RwLock<()>>>>,
    /// Chats waiting for a lock, so Stop can end the wait.
    waiting: Mutex<HashMap<String, Arc<Notify>>>,
}

impl RepoLocks {
    fn lock_for(&self, repo: &str) -> Arc<RwLock<()>> {
        let mut locks = self.locks.lock().unwrap_or_else(|e| e.into_inner());
        locks.entry(repo.to_string()).or_default().clone()
    }

    /// The project's lock for a turn of `chat_id`. Calls `on_wait` first when another turn is in the way; None when the
    /// wait was cancelled.
    pub async fn acquire(&self, repo: &str, chat_id: &str, access: Access, on_wait: impl FnOnce()) -> Option<RepoTurn> {
        let lock = self.lock_for(repo);
        let now = match access {
            Access::Read => lock.clone().try_read_owned().ok().map(|guard| RepoTurn::Read { _guard: guard }),
            Access::Write => lock.clone().try_write_owned().ok().map(|guard| RepoTurn::Write { _guard: guard }),
        };
        if now.is_some() {
            return now;
        }
        on_wait();
        let cancel = Arc::new(Notify::new());
        self.waiting
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .insert(chat_id.to_string(), cancel.clone());
        let wait = async move {
            match access {
                Access::Read => RepoTurn::Read { _guard: lock.read_owned().await },
                Access::Write => RepoTurn::Write { _guard: lock.write_owned().await },
            }
        };
        let turn = tokio::select! {
            turn = wait => Some(turn),
            _ = cancel.notified() => None,
        };
        self.waiting.lock().unwrap_or_else(|e| e.into_inner()).remove(chat_id);
        turn
    }

    /// Ends `chat_id`'s wait for a lock; false when it isn't waiting.
    pub fn cancel_wait(&self, chat_id: &str) -> bool {
        let waiting = self.waiting.lock().unwrap_or_else(|e| e.into_inner());
        let Some(cancel) = waiting.get(chat_id) else {
            return false;
        };
        cancel.notify_one();
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::time::Duration;

    async fn waits(locks: &Arc<RepoLocks>, repo: &'static str, chat: &'static str, access: Access) -> (Arc<AtomicBool>, tokio::task::JoinHandle<Option<RepoTurn>>) {
        let waited = Arc::new(AtomicBool::new(false));
        let flag = waited.clone();
        let locks = locks.clone();
        let task = tokio::spawn(async move { locks.acquire(repo, chat, access, move || flag.store(true, Ordering::SeqCst)).await });
        tokio::time::sleep(Duration::from_millis(50)).await;
        (waited, task)
    }

    #[tokio::test]
    async fn an_edit_waits_for_the_turn_before_it() {
        let locks = Arc::new(RepoLocks::default());
        let first = locks.acquire("/a", "c1", Access::Write, || panic!("the first turn shouldn't wait")).await.unwrap();
        let other_project = locks.acquire("/b", "c2", Access::Write, || panic!("another project shouldn't wait")).await;
        assert!(other_project.is_some());

        let (waited, second) = waits(&locks, "/a", "c3", Access::Write).await;
        assert!(waited.load(Ordering::SeqCst));
        assert!(!second.is_finished());
        drop(first);
        assert!(second.await.unwrap().is_some());
    }

    #[tokio::test]
    async fn reviews_share_the_checkout_but_not_with_an_edit() {
        let locks = Arc::new(RepoLocks::default());
        let review = locks.acquire("/a", "r1", Access::Read, || {}).await.unwrap();
        let review2 = locks.acquire("/a", "r2", Access::Read, || panic!("reviews shouldn't wait for each other")).await.unwrap();

        let (waited, edit) = waits(&locks, "/a", "e1", Access::Write).await;
        assert!(waited.load(Ordering::SeqCst));
        let (late_waited, late_review) = waits(&locks, "/a", "r3", Access::Read).await;
        assert!(late_waited.load(Ordering::SeqCst), "a review after a waiting edit goes after it");

        drop(review);
        drop(review2);
        let edit_turn = edit.await.unwrap().unwrap();
        assert!(!late_review.is_finished());
        drop(edit_turn);
        assert!(late_review.await.unwrap().is_some());
    }

    #[tokio::test]
    async fn stop_ends_a_wait() {
        let locks = Arc::new(RepoLocks::default());
        let _first = locks.acquire("/a", "c1", Access::Write, || {}).await.unwrap();
        let (_, second) = waits(&locks, "/a", "c2", Access::Write).await;
        assert!(locks.cancel_wait("c2"));
        assert!(second.await.unwrap().is_none());
        assert!(!locks.cancel_wait("c2"));
    }
}
