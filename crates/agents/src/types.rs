use diffity_core::types::Side;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AgentMode {
    Ask,
    Review,
    Resolve,
    Edit,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AgentInfo {
    pub id: String,
    pub name: String,
    pub installed: bool,
    pub binary_path: Option<String>,
    pub authenticated: Option<bool>,
    pub note: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContextChip {
    pub file_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub side: Option<Side>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end_line: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AgentAction {
    Chat,
    Review {
        #[serde(rename = "ref")]
        r#ref: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        focus: Option<String>,
        /// Free-form guidance from the user, prioritised over the generic checklist.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        instructions: Option<String>,
        /// Limit the review (and `get_diff`) to these files. Empty or absent means the whole diff.
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        paths: Vec<String>,
    },
    Resolve {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        thread_id: Option<String>,
    },
    Explain {
        path: String,
    },
    Summarize {
        #[serde(rename = "ref")]
        r#ref: String,
    },
    /// Address one thread (e.g. after an `@claude` mention): answer via `reply`, or change code and `resolve`.
    Thread {
        thread_id: String,
    },
    /// Address every thread of a submitted review plus its summary body.
    ReviewFeedback {
        review_id: String,
    },
}

impl AgentAction {
    /// Actions that may edit files and must run in a chat whose mode allows writes (`resolve` / `edit`).
    pub fn needs_write_mode(&self) -> bool {
        matches!(
            self,
            AgentAction::Thread { .. } | AgentAction::ReviewFeedback { .. }
        )
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StartChat {
    pub repo_path: String,
    pub agent_id: String,
    pub mode: AgentMode,
    pub session_id: String,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Chat {
    pub id: String,
    pub repo_path: String,
    pub agent_id: String,
    pub mode: AgentMode,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlanEntry {
    pub content: String,
    pub status: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PermissionDiff {
    pub path: String,
    pub old_text: Option<String>,
    pub new_text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AgentEvent {
    Text {
        message_id: String,
        delta: String,
    },
    Thought {
        delta: String,
    },
    ToolCall {
        id: String,
        title: String,
        kind: String,
        status: String,
        locations: Vec<String>,
    },
    ToolCallUpdate {
        id: String,
        status: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        title: Option<String>,
    },
    Plan {
        entries: Vec<PlanEntry>,
    },
    PermissionRequest {
        request_id: String,
        title: String,
        options: Vec<PermissionOption>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        diff: Option<PermissionDiff>,
    },
    Done {
        stop_reason: String,
    },
    Error {
        message: String,
    },
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ChatRole {
    User,
    Agent,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UserMessageContent {
    pub text: String,
    pub context: Vec<ContextChip>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(untagged)]
pub enum ChatMessageContent {
    Agent(Vec<AgentEvent>),
    User(UserMessageContent),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub chat_id: String,
    pub role: ChatRole,
    pub content: ChatMessageContent,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serde_shapes_match_contract() {
        let ev = AgentEvent::PermissionRequest {
            request_id: "r".into(),
            title: "t".into(),
            options: vec![],
            diff: None,
        };
        assert_eq!(
            serde_json::to_string(&ev).unwrap(),
            r#"{"type":"permissionRequest","requestId":"r","title":"t","options":[]}"#
        );
        let a: AgentAction = serde_json::from_str(r#"{"kind":"resolve","threadId":"x"}"#).unwrap();
        assert!(matches!(a, AgentAction::Resolve { thread_id: Some(_) }));
        let a: AgentAction = serde_json::from_str(r#"{"kind":"review","ref":"work"}"#).unwrap();
        assert!(matches!(a, AgentAction::Review { .. }));
        let a: AgentAction = serde_json::from_str(r#"{"kind":"chat"}"#).unwrap();
        assert!(matches!(a, AgentAction::Chat));
        let a: AgentAction = serde_json::from_str(r#"{"kind":"thread","threadId":"t"}"#).unwrap();
        assert!(matches!(a, AgentAction::Thread { ref thread_id } if thread_id == "t"));
        let a: AgentAction = serde_json::from_str(r#"{"kind":"reviewFeedback","reviewId":"r"}"#).unwrap();
        assert!(matches!(a, AgentAction::ReviewFeedback { ref review_id } if review_id == "r"));
        assert_eq!(
            serde_json::to_string(&AgentAction::ReviewFeedback { review_id: "r".into() }).unwrap(),
            r#"{"kind":"reviewFeedback","reviewId":"r"}"#
        );
    }
}
