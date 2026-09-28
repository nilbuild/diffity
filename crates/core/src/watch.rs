use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use ignore::gitignore::{Gitignore, GitignoreBuilder};
use notify::RecursiveMode;
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};

use crate::error::{AppError, Result};

pub const DEBOUNCE: Duration = Duration::from_millis(250);

pub type ChangeCallback = Arc<dyn Fn(&str) + Send + Sync>;

type RepoDebouncer = Debouncer<notify::RecommendedWatcher, RecommendedCache>;

fn build_ignore(root: &Path) -> Gitignore {
    let mut builder = GitignoreBuilder::new(root);
    let _ = builder.add(root.join(".gitignore"));
    let _ = builder.add(root.join(".git").join("info").join("exclude"));
    builder.build().unwrap_or_else(|_| Gitignore::empty())
}

/// Whether a changed path should trigger `repo-changed`: `.git` internals are ignored except
/// HEAD, index, packed-refs and refs/**; gitignored paths are ignored.
pub fn is_relevant(root: &Path, matcher: &Gitignore, path: &Path) -> bool {
    let Ok(rel) = path.strip_prefix(root) else {
        return false;
    };
    let mut comps = rel.components();
    let Some(first) = comps.next() else {
        return false;
    };
    if first.as_os_str() == ".git" {
        let rest: PathBuf = comps.collect();
        let rest = rest.to_string_lossy();
        return rest == "HEAD" || rest == "index" || rest == "packed-refs" || rest.starts_with("refs");
    }
    let is_dir = path.is_dir();
    !matcher.matched_path_or_any_parents(rel, is_dir).is_ignore()
}

struct Entry {
    debouncer: RepoDebouncer,
}

/// Registry of per-repo file watchers. `watch` is idempotent per path.
#[derive(Default)]
pub struct WatcherRegistry {
    watchers: Mutex<HashMap<String, Entry>>,
}

impl WatcherRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn is_watching(&self, repo_path: &str) -> bool {
        self.watchers
            .lock()
            .map(|w| w.contains_key(repo_path))
            .unwrap_or(false)
    }

    pub fn watch(&self, repo_path: &str, on_change: ChangeCallback) -> Result<()> {
        let mut watchers = self
            .watchers
            .lock()
            .map_err(|_| AppError::internal("watcher registry poisoned"))?;
        if watchers.contains_key(repo_path) {
            return Ok(());
        }
        let root = PathBuf::from(repo_path);
        if !root.is_dir() {
            return Err(AppError::not_found(format!("{repo_path} is not a directory")));
        }
        let canonical_root = root.canonicalize().unwrap_or_else(|_| root.clone());
        let matcher = Arc::new(Mutex::new(build_ignore(&canonical_root)));
        let key = repo_path.to_string();
        let handler_root = canonical_root.clone();
        let handler = move |res: DebounceEventResult| {
            let Ok(events) = res else {
                return;
            };
            let touches_ignore = events.iter().any(|e| {
                e.paths
                    .iter()
                    .any(|p| p.file_name().is_some_and(|n| n == ".gitignore" || n == "exclude"))
            });
            let Ok(mut m) = matcher.lock() else {
                return;
            };
            if touches_ignore {
                *m = build_ignore(&handler_root);
            }
            let relevant = events.iter().any(|e| {
                e.paths
                    .iter()
                    .any(|p| is_relevant(&handler_root, &m, p) || is_relevant(&handler_root, &m, &normalize(p)))
            });
            drop(m);
            if relevant {
                on_change(&key);
            }
        };
        let mut debouncer = new_debouncer(DEBOUNCE, None, handler)
            .map_err(|e| AppError::io(format!("failed to create watcher: {e}")))?;
        debouncer
            .watch(&canonical_root, RecursiveMode::Recursive)
            .map_err(|e| AppError::io(format!("failed to watch {repo_path}: {e}")))?;
        watchers.insert(repo_path.to_string(), Entry { debouncer });
        Ok(())
    }

    pub fn unwatch(&self, repo_path: &str) -> Result<()> {
        let entry = self
            .watchers
            .lock()
            .map_err(|_| AppError::internal("watcher registry poisoned"))?
            .remove(repo_path);
        if let Some(entry) = entry {
            entry.debouncer.stop_nonblocking();
        }
        Ok(())
    }
}

fn normalize(p: &Path) -> PathBuf {
    p.canonicalize().unwrap_or_else(|_| p.to_path_buf())
}
