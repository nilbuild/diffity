//! What a session keeps between the agent and the app whatever protocol it speaks: the running turn and
//! its events, the run's permissions, and the permission requests waiting on the user.

use std::collections::{HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::oneshot;

use crate::agents::policy::{self, PermissionDecision, RunPermissions};
use crate::agents::types::{AgentEvent, AgentMode, PermissionDiff, PermissionOption};
use crate::core::{AppError, Result};

pub type EventSink = Arc<dyn Fn(AgentEvent) + Send + Sync>;

const STDERR_LINES: usize = 40;

/// The user's answer to a permission request. `for_run` means "Allow for this run"; `skip_prompts`
/// means "Don't ask again", which also stops prompts for the rest of the current run.
#[derive(Debug, Default)]
pub struct Choice {
    pub option: Option<String>,
    pub for_run: bool,
    pub skip_prompts: bool,
}

#[derive(Default)]
pub struct PermissionBroker {
    pending: Mutex<std::collections::HashMap<String, oneshot::Sender<Choice>>>,
}

impl PermissionBroker {
    fn register(&self) -> (String, oneshot::Receiver<Choice>) {
        let id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        if let Ok(mut map) = self.pending.lock() {
            map.insert(id.clone(), tx);
        }
        (id, rx)
    }

    pub fn respond(
        &self,
        request_id: &str,
        option_id: Option<String>,
        for_run: bool,
        skip_prompts: bool,
    ) -> bool {
        let tx = self
            .pending
            .lock()
            .ok()
            .and_then(|mut m| m.remove(request_id));
        match tx {
            Some(tx) => tx
                .send(Choice {
                    option: option_id,
                    for_run,
                    skip_prompts,
                })
                .is_ok(),
            None => false,
        }
    }

    fn cancel_all(&self, ids: &[String]) {
        for id in ids {
            self.respond(id, None, false, false);
        }
    }
}

struct Turn {
    sink: EventSink,
    events: Vec<AgentEvent>,
    fallback_message_id: String,
}

/// What to do with a tool call the agent wants to make.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Allow,
    Deny,
    Ask,
}

/// A permission request shown to the user.
pub struct Ask {
    pub title: String,
    pub options: Vec<PermissionOption>,
    pub diff: Option<PermissionDiff>,
}

pub fn merge_event(events: &mut Vec<AgentEvent>, ev: AgentEvent) {
    match (events.last_mut(), &ev) {
        (
            Some(AgentEvent::Text { message_id, delta }),
            AgentEvent::Text {
                message_id: id,
                delta: d,
            },
        ) if message_id == id => {
            delta.push_str(d);
        }
        (Some(AgentEvent::Thought { delta }), AgentEvent::Thought { delta: d }) => {
            delta.push_str(d)
        }
        _ => events.push(ev),
    }
}

pub struct RunState {
    pub mode: AgentMode,
    pub cwd: PathBuf,
    broker: Arc<PermissionBroker>,
    turn: Mutex<Option<Turn>>,
    pending: Mutex<HashSet<String>>,
    approved_writes: Mutex<HashSet<PathBuf>>,
    stderr: Mutex<VecDeque<String>>,
    pub edit_rejected: Arc<AtomicBool>,
    run: Mutex<RunPermissions>,
    run_approved: AtomicBool,
}

impl RunState {
    pub fn new(mode: AgentMode, cwd: PathBuf, broker: Arc<PermissionBroker>, edit_rejected: Arc<AtomicBool>) -> Self {
        Self {
            mode,
            cwd,
            broker,
            turn: Mutex::new(None),
            pending: Mutex::new(HashSet::new()),
            approved_writes: Mutex::new(HashSet::new()),
            stderr: Mutex::new(VecDeque::new()),
            edit_rejected,
            run: Mutex::new(if policy::can_write_files(mode) {
                RunPermissions::AskEach
            } else {
                RunPermissions::ReadOnly
            }),
            run_approved: AtomicBool::new(false),
        }
    }

    pub fn emit(&self, ev: AgentEvent) {
        let sink = {
            let Ok(mut turn) = self.turn.lock() else {
                return;
            };
            let Some(turn) = turn.as_mut() else {
                return;
            };
            merge_event(&mut turn.events, ev.clone());
            turn.sink.clone()
        };
        sink(ev);
    }

    pub fn fallback_message_id(&self) -> String {
        self.turn
            .lock()
            .ok()
            .and_then(|t| t.as_ref().map(|t| t.fallback_message_id.clone()))
            .unwrap_or_default()
    }

    /// Opens a turn: one prompt at a time. Read-only chats never run with more than `ReadOnlyQuiet`.
    pub fn begin_turn(&self, run: RunPermissions, sink: EventSink) -> Result<()> {
        let mut turn = self
            .turn
            .lock()
            .map_err(|_| AppError::internal("turn lock poisoned"))?;
        if turn.is_some() {
            return Err(AppError::new("agent_busy", "a prompt is already running"));
        }
        self.edit_rejected.store(false, Ordering::SeqCst);
        self.run_approved.store(false, Ordering::SeqCst);
        if let Ok(mut current) = self.run.lock() {
            *current = if policy::can_write_files(self.mode) || run == RunPermissions::ReadOnlyQuiet {
                run
            } else {
                RunPermissions::ReadOnly
            };
        }
        *turn = Some(Turn {
            sink,
            events: Vec::new(),
            fallback_message_id: uuid::Uuid::new_v4().to_string(),
        });
        Ok(())
    }

    /// Closes the turn and hands back everything it emitted.
    pub fn end_turn(&self) -> Vec<AgentEvent> {
        self.turn
            .lock()
            .ok()
            .and_then(|mut t| t.take())
            .map(|t| t.events)
            .unwrap_or_default()
    }

    pub fn with_events<T>(&self, f: impl FnOnce(&[AgentEvent]) -> T) -> Option<T> {
        self.turn.lock().ok().and_then(|t| t.as_ref().map(|t| f(&t.events)))
    }

    pub fn resolve_path(&self, path: &Path) -> PathBuf {
        if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.cwd.join(path)
        }
    }

    pub fn push_stderr(&self, line: &str) {
        if let Ok(mut buf) = self.stderr.lock() {
            if buf.len() >= STDERR_LINES {
                buf.pop_front();
            }
            buf.push_back(line.to_string());
        }
    }

    pub fn stderr_tail(&self) -> String {
        self.stderr
            .lock()
            .map(|lines| lines.iter().cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default()
    }

    /// Answers every request still waiting on the user with "no".
    pub fn cancel_pending(&self) {
        let ids: Vec<String> = self
            .pending
            .lock()
            .map(|p| p.iter().cloned().collect())
            .unwrap_or_default();
        self.broker.cancel_all(&ids);
    }

    pub fn approve_writes(&self, paths: impl IntoIterator<Item = PathBuf>) {
        if let Ok(mut set) = self.approved_writes.lock() {
            set.extend(paths);
        }
    }

    pub fn take_approved_write(&self, path: &Path) -> bool {
        self.approved_writes
            .lock()
            .map(|mut s| s.remove(path))
            .unwrap_or(false)
    }

    pub fn mark_edit_rejected(&self) {
        self.edit_rejected.store(true, Ordering::SeqCst);
    }

    pub fn run(&self) -> RunPermissions {
        self.run
            .lock()
            .map(|r| *r)
            .unwrap_or(RunPermissions::AskEach)
    }

    pub fn auto_allow(&self, kind: &str, is_edit: bool) -> bool {
        policy::auto_allow(self.run(), kind, is_edit, self.run_approved.load(Ordering::SeqCst))
    }

    /// Whether a tool call of `kind` touching `paths` goes through, is refused, or needs the user.
    pub fn verdict(&self, kind: &str, is_edit: bool, paths: &[PathBuf]) -> Verdict {
        if policy::permission_decision(self.mode, kind) == PermissionDecision::AutoDeny {
            return Verdict::Deny;
        }
        if policy::worktree_allows(self.run(), is_edit, paths, &self.cwd) || self.auto_allow(kind, is_edit) {
            return Verdict::Allow;
        }
        Verdict::Ask
    }

    /// Shows a permission request and returns its id and the user's answer to come.
    pub fn ask(&self, ask: Ask) -> (String, oneshot::Receiver<Choice>) {
        let (request_id, rx) = self.broker.register();
        if let Ok(mut pending) = self.pending.lock() {
            pending.insert(request_id.clone());
        }
        self.emit(AgentEvent::PermissionRequest {
            request_id: request_id.clone(),
            title: ask.title,
            options: ask.options,
            diff: ask.diff,
        });
        (request_id, rx)
    }

    /// Records the user's answer to a request from `ask`.
    pub fn settle(&self, request_id: &str, allowed: bool, answer: &Choice, is_edit: bool, paths: Vec<PathBuf>) {
        if let Ok(mut pending) = self.pending.lock() {
            pending.remove(request_id);
        }
        if allowed && answer.skip_prompts {
            if let Ok(mut run) = self.run.lock() {
                *run = run.skipping_prompts_if(true);
            }
        }
        if allowed && policy::can_write_files(self.mode) {
            self.approve_writes(paths);
            if policy::approves_run(self.run(), is_edit, answer.for_run) {
                self.run_approved.store(true, Ordering::SeqCst);
            }
        }
        if !allowed && is_edit {
            self.mark_edit_rejected();
        }
    }
}

/// The Allow / Reject pair for requests the agent itself offers no options for.
pub fn allow_reject_options() -> Vec<PermissionOption> {
    vec![
        PermissionOption {
            id: "allow".into(),
            name: "Allow".into(),
            kind: "allow_once".into(),
        },
        PermissionOption {
            id: "reject".into(),
            name: "Reject".into(),
            kind: "reject_once".into(),
        },
    ]
}

/// Diffity's own MCP tools are already gated by mode on the bridge, so they never need a user prompt.
/// Matched by exact name so a shell command that merely mentions a tool doesn't pass: Claude and pi
/// call them `mcp__diffity__add_comment`, Codex `mcp.diffity.add_comment`.
pub fn is_own_tool(title: Option<&str>) -> bool {
    let Some(title) = title else {
        return false;
    };
    let lower = title.trim().to_ascii_lowercase();
    let Some(rest) = ["mcp__diffity__", "mcp.diffity.", "diffity."]
        .iter()
        .find_map(|prefix| lower.strip_prefix(prefix))
    else {
        return false;
    };
    let name = rest.split(|c: char| c.is_whitespace() || c == '(').next().unwrap_or_default();
    policy::READ_TOOLS.iter().chain(policy::WRITE_TOOLS).any(|t| *t == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(mode: AgentMode) -> RunState {
        RunState::new(mode, PathBuf::from("/repo"), Arc::default(), Arc::default())
    }

    #[test]
    fn merges_text_deltas() {
        let mut events = Vec::new();
        let text = |id: &str, d: &str| AgentEvent::Text {
            message_id: id.into(),
            delta: d.into(),
        };
        merge_event(&mut events, text("a", "Hel"));
        merge_event(&mut events, text("a", "lo"));
        merge_event(&mut events, AgentEvent::Thought { delta: "x".into() });
        merge_event(&mut events, AgentEvent::Thought { delta: "y".into() });
        merge_event(&mut events, text("b", "!"));
        assert_eq!(events.len(), 3);
        assert!(matches!(&events[0], AgentEvent::Text { delta, .. } if delta == "Hello"));
        assert!(matches!(&events[1], AgentEvent::Thought { delta } if delta == "xy"));
    }

    #[test]
    fn recognizes_own_tools() {
        assert!(is_own_tool(Some("mcp__diffity__add_comment")));
        assert!(is_own_tool(Some("mcp.diffity.get_diff")));
        assert!(is_own_tool(Some("diffity.reply (thread)")));
        assert!(!is_own_tool(Some("mcp__diffity__rm_rf")));
        assert!(!is_own_tool(Some("mcp__other__add_comment")));
        assert!(!is_own_tool(Some("Edit diffity.rs")));
        assert!(!is_own_tool(Some("mcp.diffity.add_comment; rm -rf .")));
        assert!(!is_own_tool(Some("mcp__diffity_terminal__add_comment")));
        assert!(!is_own_tool(Some("echo mcp__diffity__add_comment")));
        assert!(!is_own_tool(None));
    }

    #[test]
    fn read_only_chats_refuse_edits_and_commands() {
        let s = state(AgentMode::Review);
        assert_eq!(s.verdict("edit", true, &[]), Verdict::Deny);
        assert_eq!(s.verdict("execute", false, &[]), Verdict::Deny);
        assert_eq!(s.verdict("other", false, &[]), Verdict::Ask);
    }

    #[test]
    fn allowing_for_the_run_covers_later_edits() {
        let s = state(AgentMode::Resolve);
        let sink: EventSink = Arc::new(|_| {});
        s.begin_turn(RunPermissions::AskOnce, sink).unwrap();
        assert_eq!(s.verdict("edit", true, &[]), Verdict::Ask);
        s.settle("r", true, &Choice::default(), true, vec![PathBuf::from("/repo/a")]);
        assert_eq!(s.verdict("edit", true, &[]), Verdict::Allow);
        assert!(s.take_approved_write(Path::new("/repo/a")));
        s.end_turn();
    }

    #[test]
    fn rejecting_an_edit_is_remembered() {
        let s = state(AgentMode::Resolve);
        s.settle("r", false, &Choice::default(), true, vec![]);
        assert!(s.edit_rejected.load(Ordering::SeqCst));
    }

    #[test]
    fn broker_carries_run_scope() {
        let broker = PermissionBroker::default();
        let (id, mut rx) = broker.register();
        assert!(broker.respond(&id, Some("allow".into()), true, false));
        let choice = rx.try_recv().unwrap();
        assert_eq!(choice.option.as_deref(), Some("allow"));
        assert!(choice.for_run);
        assert!(!broker.respond(&id, None, false, false), "answered requests are gone");
    }

    #[test]
    fn one_turn_at_a_time() {
        let s = state(AgentMode::Ask);
        let sink: EventSink = Arc::new(|_| {});
        s.begin_turn(RunPermissions::Bypass, sink.clone()).unwrap();
        assert_eq!(s.run(), RunPermissions::ReadOnly);
        assert_eq!(s.begin_turn(RunPermissions::Bypass, sink).unwrap_err().code, "agent_busy");
        s.emit(AgentEvent::Thought { delta: "x".into() });
        assert_eq!(s.end_turn().len(), 1);
    }
}
