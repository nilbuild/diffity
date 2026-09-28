use crate::types::AgentMode;

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
