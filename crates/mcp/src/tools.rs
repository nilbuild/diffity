use std::sync::Arc;

use rmcp::model::{JsonObject, Tool, ToolAnnotations};
use serde_json::{json, Value};

fn schema(value: Value) -> Arc<JsonObject> {
    match value {
        Value::Object(map) => Arc::new(map),
        _ => Arc::new(JsonObject::new()),
    }
}

fn tool(name: &'static str, description: &'static str, input: Value, read_only: bool) -> Tool {
    Tool::new(name, description, schema(input))
        .annotate(ToolAnnotations::new().read_only(read_only))
}

const THREAD_ID: &str = "Thread id from list_threads (full id or its first 8 characters).";

pub fn all() -> Vec<Tool> {
    vec![
        tool(
            "get_diff",
            "Get the unified diff for the code review session open in Diffity, preceded by the list of changed files. \
             Line numbers for comments come from the @@ hunk headers: new-side lines for added/context code, old-side lines for removed code.",
            json!({ "type": "object", "properties": {} }),
            true,
        ),
        tool(
            "list_threads",
            "List review comment threads in the current Diffity review session, with every comment, author type (user/agent/github), \
             file path, line range, side, status and severity. General (diff-level) comments have filePath \"__general__\".",
            json!({
                "type": "object",
                "properties": {
                    "status": { "type": "string", "enum": ["open", "resolved", "dismissed"], "description": "Only return threads with this status. Omit for all." }
                }
            }),
            true,
        ),
        tool(
            "add_comment",
            "Leave an inline review comment on lines of a file in the current diff. The file must be part of the diff and the \
             lines must exist on the chosen side. Put the finding in body and its category in severity (not in the body).",
            json!({
                "type": "object",
                "properties": {
                    "file": { "type": "string", "description": "Repository-relative path of a file in the diff." },
                    "startLine": { "type": "integer", "minimum": 0, "description": "First line (1-based) on the chosen side. Use 0 for a file-level comment." },
                    "endLine": { "type": "integer", "minimum": 0, "description": "Last line of the range. Defaults to startLine." },
                    "side": { "type": "string", "enum": ["new", "old"], "description": "\"new\" (default) for added or unchanged code, \"old\" for removed code." },
                    "body": { "type": "string", "description": "Markdown comment. Lead with the problem; be specific and actionable." },
                    "severity": {
                        "type": "string",
                        "enum": ["must-fix", "suggestion", "nit", "question"],
                        "description": "must-fix: bugs, security, data loss. suggestion: concrete improvement with a clear reason. nit: minor. question: needs the author's clarification."
                    }
                },
                "required": ["file", "startLine", "body"]
            }),
            false,
        ),
        tool(
            "add_general_comment",
            "Leave a diff-level review comment not tied to any file or line, e.g. the overall review summary.",
            json!({
                "type": "object",
                "properties": { "body": { "type": "string", "description": "Markdown comment body." } },
                "required": ["body"]
            }),
            false,
        ),
        tool(
            "reply",
            "Reply to an existing review thread, e.g. to ask the reviewer for clarification.",
            json!({
                "type": "object",
                "properties": {
                    "threadId": { "type": "string", "description": THREAD_ID },
                    "body": { "type": "string", "description": "Markdown reply." }
                },
                "required": ["threadId", "body"]
            }),
            false,
        ),
        tool(
            "resolve",
            "Mark a review thread as resolved, optionally with a summary of what was changed or the answer to a question.",
            json!({
                "type": "object",
                "properties": {
                    "threadId": { "type": "string", "description": THREAD_ID },
                    "summary": { "type": "string", "description": "What was done, e.g. \"Fixed: added a null check before ...\"." }
                },
                "required": ["threadId"]
            }),
            false,
        ),
        tool(
            "dismiss",
            "Dismiss a review thread that should not be acted on, optionally with a reason.",
            json!({
                "type": "object",
                "properties": {
                    "threadId": { "type": "string", "description": THREAD_ID },
                    "reason": { "type": "string", "description": "Why the thread is dismissed." }
                },
                "required": ["threadId"]
            }),
            false,
        ),
    ]
}

#[cfg(test)]
mod tests {
    #[test]
    fn tool_names_match_contract() {
        let names: Vec<String> = super::all()
            .into_iter()
            .map(|t| t.name.to_string())
            .collect();
        assert_eq!(
            names,
            [
                "get_diff",
                "list_threads",
                "add_comment",
                "add_general_comment",
                "reply",
                "resolve",
                "dismiss"
            ]
        );
    }
}
