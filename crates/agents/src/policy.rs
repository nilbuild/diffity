use crate::types::{AgentAction, AgentMode};

pub const READ_TOOLS: &[&str] = &["get_diff", "list_threads"];
pub const WRITE_TOOLS: &[&str] = &[
    "add_comment",
    "add_general_comment",
    "reply",
    "resolve",
    "dismiss",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionDecision {
    AutoDeny,
    AskUser,
}

pub fn can_write_files(mode: AgentMode) -> bool {
    matches!(mode, AgentMode::Resolve | AgentMode::Edit)
}

/// `kind` is the ACP `ToolKind` in snake_case (`read`, `edit`, `delete`, `move`, `execute`, ...).
pub fn permission_decision(mode: AgentMode, kind: &str) -> PermissionDecision {
    if can_write_files(mode) {
        return PermissionDecision::AskUser;
    }
    match kind {
        "edit" | "delete" | "move" | "execute" => PermissionDecision::AutoDeny,
        _ => PermissionDecision::AskUser,
    }
}

/// Settings key for Settings → Claude Code → Permissions.
pub const PERMISSIONS_SETTING: &str = "agent.permissions";

/// What the user chose for runs that may edit files.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PermissionSetting {
    /// Run in the adapter's bypass mode: no prompts at all.
    #[default]
    Skip,
    /// The first allowed edit covers every later edit in the same run.
    AskOnce,
    /// Prompt for every edit.
    AskEach,
}

impl PermissionSetting {
    pub fn parse(value: Option<&str>) -> Self {
        match value.map(str::trim) {
            Some("askOnce") => Self::AskOnce,
            Some("askEach") => Self::AskEach,
            _ => Self::Skip,
        }
    }
}

/// How one turn handles permission requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunPermissions {
    /// Review / ask: file mutations and shell commands are denied without asking.
    ReadOnly,
    /// No prompts; the adapter runs in `bypassPermissions` when it offers it.
    Bypass,
    /// Ask for the first edit; allowing it approves the rest of the run's edits. Shell commands still ask.
    AskOnce,
    /// Ask for every edit and command.
    AskEach,
}

pub const BYPASS_MODE_ID: &str = "bypassPermissions";
pub const DEFAULT_MODE_ID: &str = "default";

impl RunPermissions {
    /// The ACP session mode (`session/set_mode`) this turn should run in.
    pub fn acp_mode_id(self) -> &'static str {
        match self {
            Self::Bypass => BYPASS_MODE_ID,
            _ => DEFAULT_MODE_ID,
        }
    }
}

/// Actions that are expected to change code. Read-style actions never get bypass, even in a writable chat.
fn action_edits(action: &AgentAction) -> bool {
    matches!(
        action,
        AgentAction::Chat
            | AgentAction::Resolve { .. }
            | AgentAction::Thread { .. }
            | AgentAction::ReviewFeedback { .. }
    )
}

pub fn run_permissions(
    mode: AgentMode,
    action: &AgentAction,
    setting: PermissionSetting,
) -> RunPermissions {
    if !can_write_files(mode) {
        return RunPermissions::ReadOnly;
    }
    if !action_edits(action) {
        return RunPermissions::AskEach;
    }
    match setting {
        PermissionSetting::Skip => RunPermissions::Bypass,
        PermissionSetting::AskOnce => RunPermissions::AskOnce,
        PermissionSetting::AskEach => RunPermissions::AskEach,
    }
}

/// Whether a request of this ACP tool kind is an edit (the kind "Allow for this run" covers).
pub fn is_edit_kind(kind: &str) -> bool {
    matches!(kind, "edit" | "delete" | "move")
}

/// Requests answered without showing the user anything, given the run and whether edits were already approved.
pub fn auto_allow(run: RunPermissions, is_edit: bool, run_approved: bool) -> bool {
    match run {
        RunPermissions::Bypass => true,
        RunPermissions::ReadOnly => false,
        RunPermissions::AskOnce | RunPermissions::AskEach => is_edit && run_approved,
    }
}

/// Whether allowing this request approves the remaining edits of the run.
pub fn approves_run(run: RunPermissions, is_edit: bool, for_run: bool) -> bool {
    if !is_edit {
        return false;
    }
    for_run || run == RunPermissions::AskOnce
}

pub fn allowed_tools(mode: AgentMode) -> Vec<&'static str> {
    let mut tools = READ_TOOLS.to_vec();
    if mode != AgentMode::Ask {
        tools.extend_from_slice(WRITE_TOOLS);
    }
    tools
}

pub fn tool_allowed(mode: AgentMode, tool: &str) -> bool {
    allowed_tools(mode).contains(&tool)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_only_modes_deny_mutations() {
        for mode in [AgentMode::Ask, AgentMode::Review] {
            assert!(!can_write_files(mode));
            for kind in ["edit", "delete", "move", "execute"] {
                assert_eq!(
                    permission_decision(mode, kind),
                    PermissionDecision::AutoDeny,
                    "{mode:?} {kind}"
                );
            }
            for kind in ["read", "search", "fetch", "think", "other"] {
                assert_eq!(
                    permission_decision(mode, kind),
                    PermissionDecision::AskUser,
                    "{mode:?} {kind}"
                );
            }
        }
    }

    #[test]
    fn write_modes_forward_everything() {
        for mode in [AgentMode::Resolve, AgentMode::Edit] {
            assert!(can_write_files(mode));
            for kind in ["edit", "delete", "execute", "read", "other"] {
                assert_eq!(permission_decision(mode, kind), PermissionDecision::AskUser);
            }
        }
    }

    fn resolve() -> AgentAction {
        AgentAction::Resolve {
            thread_id: None,
            thread_ids: vec![],
            note: None,
        }
    }

    #[test]
    fn parses_permission_setting() {
        assert_eq!(PermissionSetting::parse(None), PermissionSetting::Skip);
        assert_eq!(PermissionSetting::parse(Some("")), PermissionSetting::Skip);
        assert_eq!(PermissionSetting::parse(Some("askOnce")), PermissionSetting::AskOnce);
        assert_eq!(PermissionSetting::parse(Some("askEach")), PermissionSetting::AskEach);
        assert_eq!(PermissionSetting::parse(Some("bogus")), PermissionSetting::Skip);
    }

    #[test]
    fn editing_actions_follow_the_setting() {
        let editing = [
            resolve(),
            AgentAction::Thread {
                thread_id: "t".into(),
            },
            AgentAction::ReviewFeedback {
                review_id: "r".into(),
            },
            AgentAction::Chat,
        ];
        for mode in [AgentMode::Resolve, AgentMode::Edit] {
            for action in &editing {
                assert_eq!(
                    run_permissions(mode, action, PermissionSetting::Skip),
                    RunPermissions::Bypass,
                    "{mode:?} {action:?}"
                );
                assert_eq!(
                    run_permissions(mode, action, PermissionSetting::AskOnce),
                    RunPermissions::AskOnce
                );
                assert_eq!(
                    run_permissions(mode, action, PermissionSetting::AskEach),
                    RunPermissions::AskEach
                );
            }
        }
        assert_eq!(RunPermissions::Bypass.acp_mode_id(), "bypassPermissions");
        assert_eq!(RunPermissions::AskOnce.acp_mode_id(), "default");
    }

    #[test]
    fn review_and_ask_never_bypass() {
        let review = AgentAction::Review {
            r#ref: "work".into(),
            focus: None,
            instructions: None,
            paths: vec![],
        };
        for mode in [AgentMode::Ask, AgentMode::Review] {
            for action in [review.clone(), resolve(), AgentAction::Chat] {
                let run = run_permissions(mode, &action, PermissionSetting::Skip);
                assert_eq!(run, RunPermissions::ReadOnly, "{mode:?} {action:?}");
                assert_eq!(run.acp_mode_id(), "default");
            }
        }
        let explain = AgentAction::Explain { path: "a.rs".into() };
        assert_eq!(
            run_permissions(AgentMode::Resolve, &explain, PermissionSetting::Skip),
            RunPermissions::AskEach
        );
        assert_eq!(
            run_permissions(AgentMode::Edit, &review, PermissionSetting::Skip),
            RunPermissions::AskEach
        );
    }

    #[test]
    fn auto_allow_rules() {
        assert!(auto_allow(RunPermissions::Bypass, false, false));
        assert!(auto_allow(RunPermissions::Bypass, true, false));
        assert!(!auto_allow(RunPermissions::ReadOnly, true, true));
        assert!(!auto_allow(RunPermissions::AskOnce, true, false));
        assert!(auto_allow(RunPermissions::AskOnce, true, true));
        assert!(!auto_allow(RunPermissions::AskOnce, false, true), "shell keeps asking");
        assert!(auto_allow(RunPermissions::AskEach, true, true));
        assert!(!auto_allow(RunPermissions::AskEach, false, true));
    }

    #[test]
    fn run_approval_rules() {
        assert!(approves_run(RunPermissions::AskOnce, true, false));
        assert!(!approves_run(RunPermissions::AskEach, true, false));
        assert!(approves_run(RunPermissions::AskEach, true, true));
        assert!(!approves_run(RunPermissions::AskOnce, false, true), "commands never approve the run");
    }

    #[test]
    fn ask_mode_exposes_only_read_tools() {
        assert_eq!(
            allowed_tools(AgentMode::Ask),
            vec!["get_diff", "list_threads"]
        );
        assert!(!tool_allowed(AgentMode::Ask, "add_comment"));
        assert!(tool_allowed(AgentMode::Review, "add_comment"));
        assert!(tool_allowed(AgentMode::Resolve, "resolve"));
        assert!(tool_allowed(AgentMode::Edit, "dismiss"));
        assert!(!tool_allowed(AgentMode::Review, "rm_rf"));
    }
}
