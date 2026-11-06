//! Tasks: an agent working on its own branch in a worktree Diffity creates under `~/.diffity/worktrees`, reviewed
//! in rounds. Each agent run ends in a commit on the task branch (a round), so "what changed since I last looked"
//! is a plain git diff and nothing is lost when the folder is archived.

use std::path::{Path, PathBuf};

use rusqlite::{params, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::core::error::{AppError, Result};
use crate::core::git;
use crate::core::store::{new_id, now, Store};

pub const BRANCH_PREFIX: &str = "diffity/";

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TaskState {
    /// The setup command (`pnpm install`…) is running; the agent starts when it passes.
    SettingUp,
    /// The agent is (or was last) working; the live state comes from the app's runs.
    Working,
    /// A round finished that you haven't opened yet.
    Ready,
    /// Nothing new since you last opened the task.
    Idle,
    /// The last run stopped with an error.
    Failed,
}

impl TaskState {
    fn as_str(self) -> &'static str {
        match self {
            TaskState::SettingUp => "settingUp",
            TaskState::Working => "working",
            TaskState::Ready => "ready",
            TaskState::Idle => "idle",
            TaskState::Failed => "failed",
        }
    }

    fn parse(value: &str) -> TaskState {
        match value {
            "settingUp" => TaskState::SettingUp,
            "ready" => TaskState::Ready,
            "idle" => TaskState::Idle,
            "failed" => TaskState::Failed,
            _ => TaskState::Working,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    /// The repository's main checkout.
    pub repo_path: String,
    /// The task's worktree folder.
    pub path: String,
    pub branch: String,
    pub base_ref: String,
    pub base_sha: String,
    pub title: String,
    pub prompt: String,
    pub agent_id: String,
    pub state: TaskState,
    /// Created by Diffity, so archiving may remove its folder.
    pub owned: bool,
    pub pr_number: Option<i64>,
    pub pr_url: Option<String>,
    /// Shipped: merged locally or its pull request was merged.
    pub merged_at: Option<String>,
    pub rounds: i64,
    pub last_round_sha: Option<String>,
    /// The newest round you had reviewed when the agent started again (0 when none); "since last review" diffs
    /// from its commit.
    pub reviewed_round: i64,
    pub reviewed_sha: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    /// The folder was deleted outside Diffity; restoring recreates it from the branch.
    pub missing: bool,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewTask {
    pub repo_path: String,
    pub title: String,
    pub prompt: String,
    pub agent_id: String,
    pub base_ref: String,
    #[serde(default)]
    pub branch: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskRound {
    pub round: i64,
    pub commit_sha: String,
}

/// Where task folders go: `~/.diffity/worktrees` (no spaces, unlike Application Support, so setup scripts and tools
/// that split on spaces keep working).
pub fn default_root(dev: bool) -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(std::env::temp_dir);
    home.join(if dev { ".diffity-dev" } else { ".diffity" }).join("worktrees")
}

/// `Add a reset() to the store!` → `add-a-reset-to-the-store`, at most six words.
pub fn slugify(title: &str) -> String {
    let words: Vec<String> = title
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .take(6)
        .map(|w| w.to_ascii_lowercase())
        .collect();
    let slug = words.join("-");
    if slug.is_empty() {
        return "task".to_string();
    }
    slug.chars().take(48).collect::<String>().trim_end_matches('-').to_string()
}

const SELECT: &str = "SELECT t.id, t.repo_path, t.path, t.branch, t.base_ref, t.base_sha, t.title, t.prompt, t.agent_id, t.state,
  t.owned, t.pr_number, t.created_at, t.updated_at, t.archived_at,
  (SELECT count(*) FROM task_rounds r WHERE r.task_id = t.id),
  (SELECT r.commit_sha FROM task_rounds r WHERE r.task_id = t.id ORDER BY r.round DESC LIMIT 1),
  t.pr_url, t.merged_at,
  (SELECT coalesce(max(r.round), 0) FROM task_rounds r WHERE r.task_id = t.id AND r.reviewed_at IS NOT NULL),
  coalesce(t.reviewed_head, (SELECT r.commit_sha FROM task_rounds r WHERE r.task_id = t.id AND r.reviewed_at IS NOT NULL ORDER BY r.round DESC LIMIT 1))
FROM tasks t";

fn from_row(r: &Row) -> rusqlite::Result<Task> {
    let state: String = r.get(9)?;
    Ok(Task {
        id: r.get(0)?,
        repo_path: r.get(1)?,
        path: r.get(2)?,
        branch: r.get(3)?,
        base_ref: r.get(4)?,
        base_sha: r.get(5)?,
        title: r.get(6)?,
        prompt: r.get(7)?,
        agent_id: r.get(8)?,
        state: TaskState::parse(&state),
        owned: r.get::<_, i64>(10)? != 0,
        pr_number: r.get(11)?,
        created_at: r.get(12)?,
        updated_at: r.get(13)?,
        archived_at: r.get(14)?,
        rounds: r.get(15)?,
        last_round_sha: r.get(16)?,
        pr_url: r.get(17)?,
        merged_at: r.get(18)?,
        reviewed_round: r.get(19)?,
        reviewed_sha: r.get(20)?,
        missing: false,
    })
    .map(|mut task| {
        task.missing = task.archived_at.is_none() && !Path::new(&task.path).exists();
        task
    })
}

pub fn get(store: &Store, id: &str) -> Result<Task> {
    let conn = store.conn()?;
    conn.query_row(&format!("{SELECT} WHERE t.id = ?1"), [id], from_row)
        .optional()?
        .ok_or_else(|| AppError::not_found(format!("task {id} not found")))
}

pub fn find_by_path(store: &Store, path: &str) -> Result<Option<Task>> {
    let conn = store.conn()?;
    Ok(conn
        .query_row(&format!("{SELECT} WHERE t.path = ?1 AND t.archived_at IS NULL"), [path], from_row)
        .optional()?)
}

/// Active tasks, newest first; every repository's when `repo_path` is `None`.
pub fn list(store: &Store, repo_path: Option<&str>) -> Result<Vec<Task>> {
    let conn = store.conn()?;
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE t.archived_at IS NULL AND (?1 IS NULL OR t.repo_path = ?1) ORDER BY t.created_at DESC"
    ))?;
    let rows = stmt.query_map(params![repo_path], from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Archived tasks of a repository, newest first.
pub fn list_archived(store: &Store, repo_path: &str) -> Result<Vec<Task>> {
    let conn = store.conn()?;
    let mut stmt = conn.prepare(&format!("{SELECT} WHERE t.archived_at IS NOT NULL AND t.repo_path = ?1 ORDER BY t.archived_at DESC LIMIT 50"))?;
    let rows = stmt.query_map([repo_path], from_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Marks every round so far as reviewed, and remembers the folder's commit at this point: the next "since last review"
/// view starts there, so a merge from the base made after it isn't shown as the task's work.
pub fn mark_reviewed(store: &Store, id: &str) -> Result<()> {
    let task = get(store, id)?;
    let head = git::run_trim(Path::new(&task.path), &["rev-parse", "HEAD"]).ok();
    let conn = store.conn()?;
    conn.execute("UPDATE task_rounds SET reviewed_at = ?2 WHERE task_id = ?1 AND reviewed_at IS NULL", params![id, now()])?;
    conn.execute("UPDATE tasks SET reviewed_head = ?2 WHERE id = ?1", params![id, head])?;
    Ok(())
}

pub fn set_pr(store: &Store, id: &str, number: i64, url: &str) -> Result<Task> {
    store.conn()?.execute(
        "UPDATE tasks SET pr_number = ?2, pr_url = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, number, url, now()],
    )?;
    get(store, id)
}

pub fn set_merged(store: &Store, id: &str) -> Result<Task> {
    let at = now();
    store
        .conn()?
        .execute("UPDATE tasks SET merged_at = coalesce(merged_at, ?2), updated_at = ?2 WHERE id = ?1", params![id, at])?;
    get(store, id)
}

/// A run or setup that was going when Diffity quit can't finish: mark it failed so its task offers a retry.
pub fn fail_interrupted(store: &Store) -> Result<usize> {
    Ok(store.conn()?.execute(
        "UPDATE tasks SET state = ?1, updated_at = ?2 WHERE archived_at IS NULL AND state IN (?3, ?4)",
        params![TaskState::Failed.as_str(), now(), TaskState::Working.as_str(), TaskState::SettingUp.as_str()],
    )?)
}

pub fn set_state(store: &Store, id: &str, state: TaskState) -> Result<Task> {
    store
        .conn()?
        .execute("UPDATE tasks SET state = ?2, updated_at = ?3 WHERE id = ?1", params![id, state.as_str(), now()])?;
    get(store, id)
}

pub fn rename(store: &Store, id: &str, title: &str) -> Result<Task> {
    let title = title.trim();
    if title.is_empty() {
        return Err(AppError::invalid("a task needs a title"));
    }
    store
        .conn()?
        .execute("UPDATE tasks SET title = ?2, updated_at = ?3 WHERE id = ?1", params![id, title, now()])?;
    get(store, id)
}

/// The repository's main checkout for any of its working trees.
pub fn main_checkout(repo: &Path) -> Result<String> {
    let trees = git::list_worktrees(repo)?;
    if let Some(main) = trees.into_iter().find(|tree| tree.is_main) {
        return Ok(main.path);
    }
    git::run_trim(repo, &["rev-parse", "--show-toplevel"])
}

fn branch_exists(repo: &Path, branch: &str) -> bool {
    git::run_opt(repo, &["rev-parse", "--verify", "--quiet", &format!("refs/heads/{branch}")])
        .ok()
        .flatten()
        .is_some()
}

fn unique_branch(repo: &Path, wanted: &str) -> String {
    if !branch_exists(repo, wanted) {
        return wanted.to_string();
    }
    (2..).map(|n| format!("{wanted}-{n}")).find(|b| !branch_exists(repo, b)).unwrap_or_default()
}

/// A folder name nobody uses: not on disk and not recorded for any task, archived ones included (they may be restored).
fn unique_dir(store: &Store, parent: &Path, slug: &str) -> Result<PathBuf> {
    let conn = store.conn()?;
    let taken = |p: &Path| -> bool {
        p.exists()
            || conn
                .query_row("SELECT 1 FROM tasks WHERE path = ?1", [p.to_string_lossy()], |_| Ok(()))
                .optional()
                .ok()
                .flatten()
                .is_some()
    };
    let first = parent.join(slug);
    if !taken(&first) {
        return Ok(first);
    }
    Ok((2..).map(|n| parent.join(format!("{slug}-{n}"))).find(|p| !taken(p)).unwrap_or(first))
}

fn valid_branch(repo: &Path, branch: &str) -> bool {
    git::run_opt(repo, &["check-ref-format", "--branch", branch]).ok().flatten().is_some()
}

/// `.diffity/workspace.json` in the main checkout: what a new task folder needs. Every field is optional.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct TaskConfig {
    /// Extra files to copy from your checkout (`.env*`, `apps/web/.env.local`, `config/*.local.json`).
    #[serde(default)]
    pub copy: Vec<String>,
    /// Runs in the new folder before the agent starts (`pnpm install`).
    #[serde(default)]
    pub setup: Option<String>,
    /// Runs in the folder before it is archived (`docker compose down`).
    #[serde(default)]
    pub archive: Option<String>,
    /// Not in the file: a setup command guessed from the lockfile, for the New task dialog to offer.
    #[serde(default, skip_deserializing)]
    pub suggested_setup: Option<String>,
    /// Whether `.diffity/workspace.json` exists.
    #[serde(default, skip_deserializing)]
    pub from_file: bool,
}

const LOCKFILES: [(&str, &str); 8] = [
    ("pnpm-lock.yaml", "pnpm install"),
    ("bun.lock", "bun install"),
    ("bun.lockb", "bun install"),
    ("yarn.lock", "yarn install"),
    ("package-lock.json", "npm ci"),
    ("uv.lock", "uv sync"),
    ("poetry.lock", "poetry install"),
    ("Gemfile.lock", "bundle install"),
];

pub fn config(repo: &Path) -> TaskConfig {
    let file = repo.join(".diffity").join("workspace.json");
    let mut config = std::fs::read_to_string(&file)
        .ok()
        .and_then(|text| match serde_json::from_str::<TaskConfig>(&text) {
            Ok(config) => Some(config),
            Err(e) => {
                tracing::warn!("task: ignoring {}: {e}", file.display());
                None
            }
        })
        .map(|config| TaskConfig { from_file: true, ..config })
        .unwrap_or_default();
    config.suggested_setup = LOCKFILES
        .iter()
        .find(|(lock, _)| repo.join(lock).is_file())
        .map(|(_, command)| command.to_string());
    config
}

/// Files under `repo` matching `pattern`: a relative path, optionally with one `*` in its last part.
fn matching_files(repo: &Path, pattern: &str) -> Vec<String> {
    let pattern = pattern.trim().trim_start_matches("./");
    if pattern.is_empty() || pattern.starts_with('/') || pattern.split('/').any(|part| part == "..") {
        return Vec::new();
    }
    let (dir, name) = pattern.rsplit_once('/').unwrap_or(("", pattern));
    let Some((prefix, suffix)) = name.split_once('*') else {
        return if repo.join(pattern).is_file() { vec![pattern.to_string()] } else { Vec::new() };
    };
    let Ok(entries) = std::fs::read_dir(repo.join(dir)) else {
        return Vec::new();
    };
    let mut found: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|file| file.starts_with(prefix) && file.ends_with(suffix) && file.len() >= prefix.len() + suffix.len())
        .map(|file| if dir.is_empty() { file } else { format!("{dir}/{file}") })
        .collect();
    found.sort();
    found
}

/// Whether git ignores `name` in `repo`. Only ignored files are copied into a task, so a round can never commit them.
fn ignored(repo: &Path, name: &str) -> bool {
    git::run_opt(repo, &["check-ignore", "-q", "--", name]).ok().flatten().is_some()
}

/// Copies files the checkout has but a fresh worktree lacks. Skips symlinks, anything resolving outside the repository,
/// and files git doesn't ignore (they would be committed by the next round and pushed with the PR).
fn copy_into(repo: &Path, dir: &Path, files: &[String]) {
    let Some(root) = canonical(repo) else {
        return;
    };
    for name in files {
        let source = repo.join(name);
        let target = dir.join(name);
        if target.exists() {
            continue;
        }
        if source.symlink_metadata().map(|m| m.file_type().is_symlink()).unwrap_or(true) {
            tracing::warn!("task: not copying {name}: it is a symlink or missing");
            continue;
        }
        if !canonical(&source).is_some_and(|real| real.starts_with(&root)) {
            tracing::warn!("task: not copying {name}: it resolves outside the repository");
            continue;
        }
        if !ignored(repo, name) {
            tracing::warn!("task: not copying {name}: git doesn't ignore it, so a round would commit it");
            continue;
        }
        if let Some(parent) = target.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Err(e) = std::fs::copy(repo.join(name), &target) {
            tracing::warn!("task: could not copy {name}: {e}");
        }
    }
}

/// Gitignored env files at the top of the checkout (`.env`, `.env.local`, `.env.development.local`…), which a fresh
/// worktree lacks. Tracked ones and templates (`.env.example`) are already in the worktree.
fn env_files(repo: &Path) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(repo) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name == ".env" || name.starts_with(".env."))
        .filter(|name| ![".example", ".sample", ".template", ".dist"].iter().any(|s| name.ends_with(s)))
        .collect();
    names.retain(|name| ignored(repo, name));
    names.sort();
    names
}

pub fn create(store: &Store, root: &Path, input: &NewTask) -> Result<Task> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(AppError::invalid("a task needs a title"));
    }
    let main = main_checkout(Path::new(&input.repo_path))?;
    let repo = Path::new(&main);
    let base_sha = git::run_trim(repo, &["rev-parse", "--verify", &format!("{}^{{commit}}", input.base_ref)])
        .map_err(|_| AppError::invalid_ref(format!("{} is not a branch or commit in this repository", input.base_ref)))?;
    let slug = slugify(title);
    let wanted = input
        .branch
        .as_deref()
        .map(str::trim)
        .filter(|b| !b.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!("{BRANCH_PREFIX}{slug}"));
    if !valid_branch(repo, &wanted) {
        return Err(AppError::invalid(format!("`{wanted}` is not a valid branch name")));
    }
    let branch = unique_branch(repo, &wanted);
    let repo_name = repo.file_name().and_then(|n| n.to_str()).unwrap_or("repo");
    let parent = root.join(repo_name);
    std::fs::create_dir_all(&parent).map_err(|e| AppError::io(format!("could not create {}: {e}", parent.display())))?;
    let parent = parent.canonicalize().unwrap_or(parent);
    let dir = unique_dir(store, &parent, &slug)?;
    let dir_str = dir.to_string_lossy().into_owned();
    git::run(repo, &["worktree", "add", "-b", &branch, &dir_str, &base_sha])?;
    copy_into(repo, &dir, &env_files(repo));
    let extra: Vec<String> = config(repo).copy.iter().flat_map(|pattern| matching_files(repo, pattern)).collect();
    copy_into(repo, &dir, &extra);
    let path = git::run_trim(&dir, &["rev-parse", "--show-toplevel"]).unwrap_or(dir_str);
    let id = new_id();
    let at = now();
    store.conn()?.execute(
        "INSERT INTO tasks (id, repo_path, path, branch, base_ref, base_sha, title, prompt, agent_id, state, owned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?11)",
        params![id, main, path, branch, input.base_ref, base_sha, title, input.prompt, input.agent_id, TaskState::Working.as_str(), at],
    )?;
    get(store, &id)
}

/// Tracks a worktree you made yourself as a task. Diffity never removes its folder (`owned` is false); archiving
/// only stops tracking it.
pub fn adopt(store: &Store, path: &str, base_ref: &str) -> Result<Task> {
    let dir = Path::new(path);
    let top = git::run_trim(dir, &["rev-parse", "--show-toplevel"])?;
    if find_by_path(store, &top)?.is_some() {
        return Err(AppError::invalid("this folder is already a task"));
    }
    let main = main_checkout(dir)?;
    if Path::new(&main).canonicalize().ok() == Path::new(&top).canonicalize().ok() {
        return Err(AppError::invalid("your main checkout can't be a task"));
    }
    let branch = git::current_branch(dir)?.ok_or_else(|| AppError::invalid("the worktree has no branch checked out"))?;
    let base_sha = git::run_trim(dir, &["rev-parse", "--verify", &format!("{base_ref}^{{commit}}")])?;
    let title = branch.rsplit('/').next().unwrap_or(&branch).replace(['-', '_'], " ");
    let id = new_id();
    let at = now();
    store.conn()?.execute(
        "DELETE FROM tasks WHERE path = ?1 AND archived_at IS NOT NULL",
        params![top],
    )?;
    store.conn()?.execute(
        "INSERT INTO tasks (id, repo_path, path, branch, base_ref, base_sha, title, prompt, agent_id, state, owned, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', 'claude', ?8, 0, ?9, ?9)",
        params![id, main, top, branch, base_ref, base_sha, title, TaskState::Idle.as_str(), at],
    )?;
    get(store, &id)
}

fn git_identity_args(repo: &Path) -> Vec<&'static str> {
    let has_email = git::run_trim(repo, &["config", "user.email"]).is_ok_and(|v| !v.is_empty());
    if has_email {
        return Vec::new();
    }
    vec!["-c", "user.name=Diffity", "-c", "user.email=diffity@localhost"]
}

/// Commits everything in the task folder as the next round. `None` when the run changed nothing.
/// Hooks are skipped so a round can't fail halfway through the loop; they run on the commit that ships.
/// Files of an open merge that still have conflict markers in them.
fn unresolved_conflicts(dir: &Path) -> Result<Vec<String>> {
    if git::run_opt(dir, &["rev-parse", "--verify", "--quiet", "MERGE_HEAD"])?.is_none() {
        return Ok(Vec::new());
    }
    let unmerged = git::run(dir, &["diff", "--name-only", "--diff-filter=U"])?;
    Ok(unmerged
        .lines()
        .filter(|file| !file.is_empty())
        .filter(|file| {
            std::fs::read(dir.join(file))
                .map(|bytes| String::from_utf8_lossy(&bytes).lines().any(|line| line.starts_with("<<<<<<<") || line.starts_with(">>>>>>>")))
                .unwrap_or(false)
        })
        .map(str::to_string)
        .collect())
}

pub fn commit_round(store: &Store, id: &str) -> Result<Option<TaskRound>> {
    let task = get(store, id)?;
    let dir = Path::new(&task.path);
    let conflicts = unresolved_conflicts(dir)?;
    if !conflicts.is_empty() {
        return Err(AppError::new(
            "conflicts",
            format!("the merge from {} still has conflicts in {}", task.base_ref, conflicts.join(", ")),
        ));
    }
    git::run(dir, &["add", "-A"])?;
    let unchanged = git::run_opt(dir, &["diff", "--cached", "--quiet"])?.is_some();
    if unchanged {
        return Ok(None);
    }
    let round = task.rounds + 1;
    let message = format!("Round {round}: {}", task.title);
    let mut args = git_identity_args(dir);
    args.extend(["commit", "--no-verify", "--quiet", "-m", &message]);
    git::run(dir, &args)?;
    let sha = git::run_trim(dir, &["rev-parse", "HEAD"])?;
    store.conn()?.execute(
        "INSERT INTO task_rounds (task_id, round, commit_sha, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, round, sha, now()],
    )?;
    Ok(Some(TaskRound { round, commit_sha: sha }))
}

fn canonical(path: &Path) -> Option<PathBuf> {
    path.canonicalize().ok()
}

/// Archiving removes the folder only when every check holds: Diffity created it, it sits under the worktrees root,
/// and git lists it as a worktree of the task's repository.
fn removable(task: &Task, root: &Path) -> Result<()> {
    if !task.owned {
        return Err(AppError::invalid("Diffity didn't create this folder, so it won't remove it"));
    }
    let dir = Path::new(&task.path);
    let (Some(dir), Some(root)) = (canonical(dir), canonical(root)) else {
        return Ok(());
    };
    if !dir.starts_with(&root) || dir == root {
        return Err(AppError::invalid(format!("{} is outside {}", dir.display(), root.display())));
    }
    let listed = git::list_worktrees(Path::new(&task.repo_path))?
        .iter()
        .any(|tree| !tree.is_main && canonical(Path::new(&tree.path)).is_some_and(|p| p == dir));
    if !listed {
        return Err(AppError::invalid(format!("git doesn't list {} as a worktree", dir.display())));
    }
    Ok(())
}

/// Removes the task's folder and keeps its branch, rounds and comments. A folder that is already gone just marks the
/// task archived.
pub fn archive(store: &Store, root: &Path, id: &str) -> Result<Task> {
    let task = get(store, id)?;
    if task.archived_at.is_some() {
        return Ok(task);
    }
    let repo = Path::new(&task.repo_path);
    if task.owned && Path::new(&task.path).exists() {
        removable(&task, root)?;
        let status = base_status(store, id)?;
        if status.merging {
            return Err(AppError::invalid(format!(
                "a merge from {} is still open in the task. Finish or abort it before archiving",
                task.base_ref
            )));
        }
        if status.dirty {
            commit_round(store, id)?;
        }
        if let Some(command) = config(repo).archive.filter(|c| !c.trim().is_empty()) {
            if let Err(e) = run_shell(Path::new(&task.path), &command, |_| {}) {
                tracing::warn!("task: archive command failed: {}", e.message);
            }
        }
        git::run(repo, &["worktree", "remove", "--force", &task.path])?;
    }
    if task.owned {
        let _ = git::run(repo, &["worktree", "prune"]);
    }
    store
        .conn()?
        .execute("UPDATE tasks SET archived_at = ?2, updated_at = ?2 WHERE id = ?1", params![id, now()])?;
    get(store, id)
}

/// Brings an archived task back: recreates its folder from the branch.
pub fn restore(store: &Store, id: &str) -> Result<Task> {
    let task = get(store, id)?;
    if task.archived_at.is_none() && !task.missing {
        return Ok(task);
    }
    let repo = Path::new(&task.repo_path);
    if !branch_exists(repo, &task.branch) {
        return Err(AppError::not_found(format!("the branch {} no longer exists", task.branch)));
    }
    if Path::new(&task.path).exists() {
        return Err(AppError::invalid(format!("{} already exists", task.path)));
    }
    let _ = git::run(repo, &["worktree", "prune"]);
    git::run(repo, &["worktree", "add", &task.path, &task.branch])?;
    copy_into(repo, Path::new(&task.path), &env_files(repo));
    store.conn()?.execute(
        "UPDATE tasks SET archived_at = NULL, state = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, TaskState::Idle.as_str(), now()],
    )?;
    get(store, id)
}

/// Runs `command` with the user's shell in `dir`, passing each output line (stdout and stderr) to `on_line`.
/// Fails with the last lines of output when it exits non-zero.
pub fn run_shell(dir: &Path, command: &str, mut on_line: impl FnMut(&str)) -> Result<()> {
    use std::io::{BufRead, BufReader};
    use std::process::{Command, Stdio};
    let shell = std::env::var("SHELL").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| "/bin/sh".into());
    let mut child = Command::new(shell)
        .arg("-c")
        .arg(format!("exec 2>&1\n{command}"))
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| AppError::io(format!("could not run `{command}`: {e}")))?;
    let mut tail: std::collections::VecDeque<String> = std::collections::VecDeque::new();
    if let Some(out) = child.stdout.take() {
        for line in BufReader::new(out).lines().map_while(|l| l.ok()) {
            on_line(&line);
            tail.push_back(line);
            if tail.len() > 20 {
                tail.pop_front();
            }
        }
    }
    let status = child.wait().map_err(|e| AppError::io(format!("`{command}` did not finish: {e}")))?;
    if status.success() {
        return Ok(());
    }
    let lines = tail.into_iter().collect::<Vec<_>>().join("\n");
    Err(AppError::new("setup_failed", format!("`{command}` exited with {status}\n{lines}")))
}

/// Commits ahead of and behind the base branch.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BaseStatus {
    pub ahead: i64,
    pub behind: i64,
    /// The task folder has changes no round has committed yet (the agent is working, or you edited by hand).
    pub dirty: bool,
    /// A merge from the base is waiting for its conflicts to be resolved.
    pub merging: bool,
}

pub fn base_status(store: &Store, id: &str) -> Result<BaseStatus> {
    let task = get(store, id)?;
    let dir = Path::new(&task.path);
    let counts = git::run_trim(dir, &["rev-list", "--left-right", "--count", &format!("HEAD...{}", task.base_ref)])?;
    let mut parts = counts.split_whitespace().map(|n| n.parse::<i64>().unwrap_or(0));
    let ahead = parts.next().unwrap_or(0);
    let behind = parts.next().unwrap_or(0);
    let dirty = !git::run(dir, &["status", "--porcelain"])?.trim().is_empty();
    let merging = git::run_opt(dir, &["rev-parse", "--verify", "--quiet", "MERGE_HEAD"])?.is_some();
    Ok(BaseStatus { ahead, behind, dirty, merging })
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BaseUpdate {
    /// Files left with conflict markers; empty when the merge went through.
    pub conflicts: Vec<String>,
}

/// Merges the base branch into the task branch. A clean merge is committed right away; on conflicts the merge
/// stays open for the agent (or you) to resolve, and the next round's commit concludes it.
pub fn update_from_base(store: &Store, id: &str) -> Result<BaseUpdate> {
    let task = get(store, id)?;
    let dir = Path::new(&task.path);
    let status = base_status(store, id)?;
    if status.merging {
        return Err(AppError::invalid("a merge from the base is already waiting for its conflicts to be resolved"));
    }
    if status.dirty {
        commit_round(store, id)?;
    }
    let mut args = git_identity_args(dir);
    args.extend(["merge", "--no-edit", "--no-verify", &task.base_ref]);
    if git::run(dir, &args).is_ok() {
        if task.reviewed_round == task.rounds {
            let head = git::run_trim(dir, &["rev-parse", "HEAD"])?;
            store.conn()?.execute("UPDATE tasks SET reviewed_head = ?2 WHERE id = ?1", params![id, head])?;
        }
        return Ok(BaseUpdate { conflicts: Vec::new() });
    }
    let conflicts: Vec<String> = git::run(dir, &["diff", "--name-only", "--diff-filter=U"])?
        .lines()
        .map(str::to_string)
        .filter(|l| !l.is_empty())
        .collect();
    if conflicts.is_empty() {
        let _ = git::run(dir, &["merge", "--abort"]);
        return Err(AppError::git_failed(format!("could not merge {} into the task", task.base_ref)));
    }
    Ok(BaseUpdate { conflicts })
}

/// Turns the task's rounds into one commit on top of where it split from the base, running your commit hooks.
/// On failure (a hook said no) the rounds are put back as they were.
pub fn squash(store: &Store, id: &str, message: &str) -> Result<String> {
    squash_onto(store, id, None, message)
}

/// Like `squash`, but only the rounds after `onto` (what the pull request already has), so the result can be pushed
/// on top of it without force.
pub fn squash_onto(store: &Store, id: &str, onto: Option<&str>, message: &str) -> Result<String> {
    let task = get(store, id)?;
    let dir = Path::new(&task.path);
    let status = base_status(store, id)?;
    if status.merging {
        return Err(AppError::invalid("resolve the merge conflicts before shipping"));
    }
    if status.dirty {
        commit_round(store, id)?;
    }
    let head = git::run_trim(dir, &["rev-parse", "HEAD"])?;
    let fork = match onto {
        Some(sha) => sha.to_string(),
        None => git::merge_base(dir, &task.base_ref, "HEAD")?.ok_or_else(|| AppError::invalid("the task shares no history with its base"))?,
    };
    if fork == head {
        return Err(AppError::invalid(if onto.is_some() { "no new rounds since the last push" } else { "the task has no changes to ship" }));
    }
    git::run(dir, &["reset", "--soft", &fork])?;
    let mut args = git_identity_args(dir);
    args.extend(["commit", "--quiet", "-m", message]);
    if let Err(e) = git::run(dir, &args) {
        let _ = git::run(dir, &["reset", "--soft", &head]);
        return Err(e);
    }
    git::run_trim(dir, &["rev-parse", "HEAD"])
}

/// Squash-merges the task into the base branch in your checkout, which must have the base checked out and no
/// uncommitted changes.
pub fn merge_locally(store: &Store, id: &str, message: &str) -> Result<Task> {
    let task = get(store, id)?;
    let main = Path::new(&task.repo_path);
    let current = git::current_branch(main)?;
    if current.as_deref() != Some(task.base_ref.as_str()) {
        return Err(AppError::invalid(format!(
            "your checkout is on {}, not {}. Switch it to {} first",
            current.unwrap_or_else(|| "a detached HEAD".into()),
            task.base_ref,
            task.base_ref
        )));
    }
    if !git::run(main, &["status", "--porcelain", "--untracked-files=no"])?.trim().is_empty() {
        return Err(AppError::invalid("your checkout has uncommitted changes. Commit or stash them first"));
    }
    let status = base_status(store, id)?;
    if status.merging {
        return Err(AppError::invalid("resolve the merge conflicts before shipping"));
    }
    if status.dirty {
        commit_round(store, id)?;
    }
    let before = git::run_trim(main, &["rev-parse", "HEAD"])?;
    // The checkout was clean, so going back to `before` loses nothing; `reset --merge` alone fails when a hook edited files.
    let undo = || {
        if git::run(main, &["reset", "--merge"]).is_err() {
            let _ = git::run(main, &["reset", "--hard", &before]);
        }
    };
    if let Err(e) = git::run(main, &["merge", "--squash", &task.branch]) {
        undo();
        return Err(e);
    }
    let mut args = git_identity_args(main);
    args.extend(["commit", "--quiet", "-m", message]);
    if let Err(e) = git::run(main, &args) {
        undo();
        return Err(e);
    }
    set_merged(store, id)
}

/// Disk used by each active task folder, in bytes (`du`, so hardlinked package stores count once per folder).
pub fn disk_usage(store: &Store, repo_path: Option<&str>) -> Result<Vec<(String, u64)>> {
    let tasks = list(store, repo_path)?;
    Ok(tasks
        .into_iter()
        .filter(|task| Path::new(&task.path).is_dir())
        .map(|task| {
            let kb = std::process::Command::new("du")
                .args(["-sk", &task.path])
                .output()
                .ok()
                .and_then(|out| String::from_utf8_lossy(&out.stdout).split_whitespace().next().and_then(|n| n.parse::<u64>().ok()))
                .unwrap_or(0);
            (task.id, kb * 1024)
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn git_out(dir: &Path, args: &[&str]) -> String {
        let out = Command::new("git").args(args).current_dir(dir).output().unwrap();
        String::from_utf8_lossy(&out.stdout).into_owned()
    }

    fn git_in(dir: &Path, args: &[&str]) {
        let status = Command::new("git").args(args).current_dir(dir).status().unwrap();
        assert!(status.success(), "git {args:?}");
    }

    fn repo() -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("demo");
        std::fs::create_dir_all(&repo).unwrap();
        git_in(&repo, &["init", "-q", "-b", "main"]);
        git_in(&repo, &["config", "user.email", "t@example.com"]);
        git_in(&repo, &["config", "user.name", "T"]);
        std::fs::write(repo.join("a.txt"), "one\n").unwrap();
        std::fs::write(repo.join(".gitignore"), ".env*\n!.env.example\n").unwrap();
        std::fs::write(repo.join(".env"), "SECRET=1\n").unwrap();
        std::fs::write(repo.join(".env.example"), "SECRET=\n").unwrap();
        git_in(&repo, &["add", "a.txt", ".gitignore", ".env.example"]);
        git_in(&repo, &["commit", "-q", "-m", "init"]);
        let repo = repo.canonicalize().unwrap();
        (tmp, repo)
    }

    fn new_task(repo: &Path, title: &str) -> NewTask {
        NewTask {
            repo_path: repo.to_string_lossy().into_owned(),
            title: title.into(),
            prompt: "do it".into(),
            agent_id: "claude".into(),
            base_ref: "main".into(),
            branch: None,
        }
    }

    #[test]
    fn slugify_keeps_six_words() {
        assert_eq!(slugify("Add a reset() to the vanilla store, please"), "add-a-reset-to-the-vanilla");
        assert_eq!(slugify("  !!  "), "task");
    }

    #[test]
    fn create_round_and_archive() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("worktrees");
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &root, &new_task(&repo, "Add reset")).unwrap();
        assert_eq!(task.branch, "diffity/add-reset");
        assert_eq!(task.repo_path, repo.to_string_lossy());
        let dir = PathBuf::from(&task.path);
        assert!(dir.starts_with(root.canonicalize().unwrap()));
        assert!(dir.join(".env").exists(), "gitignored env file is copied");
        assert_eq!(list(&store, Some(&task.repo_path)).unwrap().len(), 1);
        assert!(find_by_path(&store, &task.path).unwrap().is_some());

        assert!(commit_round(&store, &task.id).unwrap().is_none(), "nothing changed");
        std::fs::write(dir.join("a.txt"), "two\n").unwrap();
        std::fs::write(dir.join("b.txt"), "new\n").unwrap();
        let round = commit_round(&store, &task.id).unwrap().unwrap();
        assert_eq!(round.round, 1);
        let task = get(&store, &task.id).unwrap();
        assert_eq!(task.rounds, 1);
        assert_eq!(task.last_round_sha.as_deref(), Some(round.commit_sha.as_str()));
        let log = git::run_trim(&dir, &["log", "-1", "--format=%s"]).unwrap();
        assert_eq!(log, "Round 1: Add reset");
        assert!(!git::run(&dir, &["show", "--name-only", "HEAD"]).unwrap().contains(".env\n"), ".env stays ignored");

        let second = create(&store, &root, &new_task(&repo, "Add reset")).unwrap();
        assert_eq!(second.branch, "diffity/add-reset-2");
        assert_ne!(second.path, task.path);

        let archived = archive(&store, &root, &task.id).unwrap();
        assert!(archived.archived_at.is_some());
        assert!(!dir.exists());
        assert!(branch_exists(&repo, "diffity/add-reset"), "branch is kept");
        assert_eq!(list(&store, None).unwrap().len(), 1);

        let third = create(&store, &root, &new_task(&repo, "Add reset")).unwrap();
        assert_ne!(PathBuf::from(&third.path), dir, "an archived task keeps its folder name");
        assert_eq!(third.branch, "diffity/add-reset-3");
    }

    #[test]
    fn archive_refuses_folders_outside_the_root() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("worktrees");
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &root, &new_task(&repo, "Outside")).unwrap();
        let elsewhere = tmp.path().join("elsewhere");
        std::fs::create_dir_all(&elsewhere).unwrap();
        assert!(archive(&store, &elsewhere, &task.id).is_err());
        assert!(Path::new(&task.path).exists());
    }

    #[test]
    fn recent_repos_skip_task_folders() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("worktrees");
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &root, &new_task(&repo, "Hidden")).unwrap();
        store.touch_repo(&task.repo_path, "demo").unwrap();
        store.touch_repo(&task.path, "hidden").unwrap();
        let recent: Vec<String> = store.recent_repos(10).unwrap().into_iter().map(|r| r.path).collect();
        assert_eq!(recent, vec![task.repo_path.clone()]);
    }

    fn commit_on_main(repo: &Path, file: &str, body: &str) {
        std::fs::write(repo.join(file), body).unwrap();
        git_in(repo, &["add", file]);
        git_in(repo, &["commit", "-q", "-m", file]);
    }

    #[test]
    fn reviewed_round_tracks_the_last_review() {
        let (tmp, repo) = repo();
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &tmp.path().join("w"), &new_task(&repo, "Rounds")).unwrap();
        let dir = PathBuf::from(&task.path);
        std::fs::write(dir.join("a.txt"), "r1\n").unwrap();
        let first = commit_round(&store, &task.id).unwrap().unwrap();
        mark_reviewed(&store, &task.id).unwrap();
        std::fs::write(dir.join("a.txt"), "r2\n").unwrap();
        commit_round(&store, &task.id).unwrap().unwrap();
        let task = get(&store, &task.id).unwrap();
        assert_eq!(task.rounds, 2);
        assert_eq!(task.reviewed_round, 1);
        assert_eq!(task.reviewed_sha.as_deref(), Some(first.commit_sha.as_str()));
    }

    #[test]
    fn config_copies_extra_files_and_suggests_setup() {
        let (tmp, repo) = repo();
        std::fs::create_dir_all(repo.join(".diffity")).unwrap();
        std::fs::create_dir_all(repo.join("config")).unwrap();
        std::fs::write(repo.join("config/dev.local.json"), "{}").unwrap();
        std::fs::write(repo.join("config/other.json"), "{}").unwrap();
        std::fs::write(repo.join("config/team.local.json"), "{}").unwrap();
        std::fs::write(repo.join(".gitignore"), ".env*\n!.env.example\nconfig/dev.local.json\n").unwrap();
        std::fs::write(repo.join(".env.local"), "X=1\n").unwrap();
        std::os::unix::fs::symlink("/etc", repo.join("config/linked.local.json")).unwrap();
        std::fs::write(repo.join("pnpm-lock.yaml"), "").unwrap();
        std::fs::write(repo.join(".diffity/workspace.json"), r#"{"copy": ["config/*.local.json", "../escape"], "archive": "true"}"#).unwrap();
        let cfg = config(&repo);
        assert!(cfg.from_file);
        assert_eq!(cfg.suggested_setup.as_deref(), Some("pnpm install"));
        assert_eq!(matching_files(&repo, "../escape"), Vec::<String>::new());
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &tmp.path().join("w"), &new_task(&repo, "Copy")).unwrap();
        assert!(Path::new(&task.path).join("config/dev.local.json").exists());
        assert!(!Path::new(&task.path).join("config/other.json").exists());
        assert!(!Path::new(&task.path).join("config/team.local.json").exists(), "files git doesn't ignore would be committed");
        assert!(!Path::new(&task.path).join("config/linked.local.json").exists(), "symlinks aren't followed");
        assert!(Path::new(&task.path).join(".env.local").exists());
    }

    #[test]
    fn archive_saves_uncommitted_work_as_a_round() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("w");
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &root, &new_task(&repo, "Keep me")).unwrap();
        std::fs::write(Path::new(&task.path).join("a.txt"), "edited by hand\n").unwrap();
        archive(&store, &root, &task.id).unwrap();
        assert!(!Path::new(&task.path).exists());
        let saved = git_out(&repo, &["show", &format!("{}:a.txt", task.branch)]);
        assert_eq!(saved, "edited by hand\n");
    }

    #[test]
    fn a_round_refuses_conflict_markers() {
        let (tmp, repo) = repo();
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &tmp.path().join("w"), &new_task(&repo, "Clash")).unwrap();
        std::fs::write(Path::new(&task.path).join("a.txt"), "task\n").unwrap();
        commit_round(&store, &task.id).unwrap();
        std::fs::write(repo.join("a.txt"), "main\n").unwrap();
        git_in(&repo, &["commit", "-qam", "main"]);
        let update = update_from_base(&store, &task.id).unwrap();
        assert_eq!(update.conflicts, vec!["a.txt".to_string()]);
        assert!(commit_round(&store, &task.id).is_err(), "markers left in a.txt");
        assert!(archive(&store, &tmp.path().join("w"), &task.id).is_err(), "an open merge blocks archiving");
        std::fs::write(Path::new(&task.path).join("a.txt"), "both\n").unwrap();
        assert!(commit_round(&store, &task.id).unwrap().is_some(), "resolved files conclude the merge");
    }

    #[test]
    fn a_failed_local_merge_leaves_the_checkout_clean() {
        let (tmp, repo) = repo();
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &tmp.path().join("w"), &new_task(&repo, "Hooked")).unwrap();
        std::fs::write(Path::new(&task.path).join("a.txt"), "task\n").unwrap();
        commit_round(&store, &task.id).unwrap();
        let hook = repo.join(".git/hooks/pre-commit");
        std::fs::write(&hook, "#!/bin/sh\necho reformatted >> a.txt\nexit 1\n").unwrap();
        std::fs::set_permissions(&hook, std::os::unix::fs::PermissionsExt::from_mode(0o755)).unwrap();
        assert!(merge_locally(&store, &task.id, "Hooked").is_err());
        assert_eq!(git_out(&repo, &["status", "--porcelain", "--untracked-files=no"]), "");
        assert_eq!(std::fs::read_to_string(repo.join("a.txt")).unwrap(), "one\n");
    }

    #[test]
    fn update_from_base_merges_or_reports_conflicts() {
        let (tmp, repo) = repo();
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &tmp.path().join("w"), &new_task(&repo, "Update")).unwrap();
        let dir = PathBuf::from(&task.path);
        commit_on_main(&repo, "main.txt", "main\n");
        assert_eq!(base_status(&store, &task.id).unwrap().behind, 1);
        assert!(update_from_base(&store, &task.id).unwrap().conflicts.is_empty());
        assert!(dir.join("main.txt").exists());
        assert_eq!(base_status(&store, &task.id).unwrap().behind, 0);

        std::fs::write(dir.join("a.txt"), "task\n").unwrap();
        commit_round(&store, &task.id).unwrap();
        commit_on_main(&repo, "a.txt", "main side\n");
        let update = update_from_base(&store, &task.id).unwrap();
        assert_eq!(update.conflicts, vec!["a.txt".to_string()]);
        assert!(base_status(&store, &task.id).unwrap().merging);
        assert!(squash(&store, &task.id, "x").is_err(), "can't ship mid-merge");
        std::fs::write(dir.join("a.txt"), "resolved\n").unwrap();
        commit_round(&store, &task.id).unwrap().unwrap();
        let status = base_status(&store, &task.id).unwrap();
        assert!(!status.merging && status.behind == 0);
    }

    #[test]
    fn squash_and_merge_locally() {
        let (tmp, repo) = repo();
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &tmp.path().join("w"), &new_task(&repo, "Ship")).unwrap();
        let dir = PathBuf::from(&task.path);
        assert!(squash(&store, &task.id, "nothing").is_err());
        std::fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
        commit_round(&store, &task.id).unwrap();
        std::fs::write(dir.join("c.txt"), "c\n").unwrap();
        let sha = squash(&store, &task.id, "Ship it").unwrap();
        assert_eq!(git::run_trim(&dir, &["rev-list", "--count", "main..HEAD"]).unwrap(), "1");
        assert_eq!(git::run_trim(&dir, &["log", "-1", "--format=%s"]).unwrap(), "Ship it");
        assert_eq!(git::run_trim(&dir, &["rev-parse", "HEAD"]).unwrap(), sha);

        std::fs::write(repo.join("a.txt"), "dirty\n").unwrap();
        assert!(merge_locally(&store, &task.id, "Ship").is_err(), "dirty checkout is refused");
        git_in(&repo, &["checkout", "--", "a.txt"]);
        let merged = merge_locally(&store, &task.id, "Ship (#task)").unwrap();
        assert!(merged.merged_at.is_some());
        assert_eq!(git::run_trim(&repo, &["log", "-1", "--format=%s"]).unwrap(), "Ship (#task)");
        assert!(repo.join("c.txt").exists());
    }

    #[test]
    fn a_deleted_folder_is_missing_and_restores() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("w");
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &root, &new_task(&repo, "Gone")).unwrap();
        std::fs::write(Path::new(&task.path).join("a.txt"), "kept\n").unwrap();
        commit_round(&store, &task.id).unwrap();
        std::fs::remove_dir_all(&task.path).unwrap();
        assert!(get(&store, &task.id).unwrap().missing);
        let back = restore(&store, &task.id).unwrap();
        assert!(!back.missing);
        assert_eq!(std::fs::read_to_string(Path::new(&task.path).join("a.txt")).unwrap(), "kept\n");
    }

    #[test]
    fn interrupted_tasks_are_marked_failed() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("w");
        let store = Store::open_in_memory().unwrap();
        let working = create(&store, &root, &new_task(&repo, "Working")).unwrap();
        let ready = create(&store, &root, &new_task(&repo, "Ready")).unwrap();
        set_state(&store, &ready.id, TaskState::Ready).unwrap();
        assert_eq!(fail_interrupted(&store).unwrap(), 1);
        assert_eq!(get(&store, &working.id).unwrap().state, TaskState::Failed);
        assert_eq!(get(&store, &ready.id).unwrap().state, TaskState::Ready);
    }

    #[test]
    fn restore_brings_an_archived_task_back() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("w");
        let store = Store::open_in_memory().unwrap();
        let task = create(&store, &root, &new_task(&repo, "Restore me")).unwrap();
        std::fs::write(Path::new(&task.path).join("a.txt"), "kept\n").unwrap();
        commit_round(&store, &task.id).unwrap();
        archive(&store, &root, &task.id).unwrap();
        assert_eq!(list_archived(&store, &task.repo_path).unwrap().len(), 1);
        let back = restore(&store, &task.id).unwrap();
        assert!(back.archived_at.is_none());
        assert_eq!(std::fs::read_to_string(Path::new(&task.path).join("a.txt")).unwrap(), "kept\n");
    }

    #[test]
    fn run_shell_reports_failures() {
        let tmp = tempfile::tempdir().unwrap();
        let mut lines = Vec::new();
        run_shell(tmp.path(), "echo hello", |l| lines.push(l.to_string())).unwrap();
        assert_eq!(lines, vec!["hello".to_string()]);
        let err = run_shell(tmp.path(), "echo broke; exit 3", |_| {}).unwrap_err();
        assert!(err.message.contains("broke"));
    }

    #[test]
    fn adopting_a_worktree_never_removes_it() {
        let (tmp, repo) = repo();
        let root = tmp.path().join("w");
        let mine = tmp.path().join("mine");
        git_in(&repo, &["worktree", "add", "-q", "-b", "feature/my-thing", mine.to_str().unwrap()]);
        let store = Store::open_in_memory().unwrap();
        let task = adopt(&store, mine.to_str().unwrap(), "main").unwrap();
        assert!(!task.owned);
        assert_eq!(task.branch, "feature/my-thing");
        assert_eq!(task.title, "my thing");
        assert!(adopt(&store, mine.to_str().unwrap(), "main").is_err(), "already a task");
        assert!(adopt(&store, repo.to_str().unwrap(), "main").is_err(), "main checkout");
        archive(&store, &root, &task.id).unwrap();
        assert!(mine.exists(), "your own folder stays");
        assert!(adopt(&store, mine.to_str().unwrap(), "main").is_ok(), "can be tracked again");
    }
}
