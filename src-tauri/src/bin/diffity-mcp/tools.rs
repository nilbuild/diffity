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
             Line numbers for comments come from the @@ hunk headers: new-side lines for added/context code, old-side lines for removed code. \
             With `summary` it returns only the file list, with the code each file's hunks are in; with `files` only those patches.",
            json!({
                "type": "object",
                "properties": {
                    "summary": { "type": "boolean", "description": "Return only the changed files: status, +added/-removed and the functions their hunks are in. Generated and binary files are marked." },
                    "files": { "type": "array", "items": { "type": "string" }, "description": "Return the patch of these files only, paths as the file list gives them." }
                }
            }),
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
                    "body": { "type": "string", "description": "Markdown comment in simple English: the problem and the fix in 1-3 short sentences. For a small fix on the new side, add a ```suggestion block holding the full replacement for startLine..endLine (exact indentation); the user can apply it in one click." },
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
                    "body": { "type": "string", "description": "Markdown reply in simple English, 1-3 short sentences." }
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
                    "summary": { "type": "string", "description": "One short sentence on what changed, e.g. \"Fixed: added a null check.\"" }
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
        tool(
            "set_guide",
            "Save a reading guide for the diff: an overview and chapters, each one idea with the files that carry it, in the \
             order a reviewer should read them. Replaces any earlier guide. Every file must be in the diff; files you leave \
             out are put in a last \"Everything else\" chapter. Throughout, explain why over what: the reviewer reads what \
             the code does in the diff.",
            json!({
                "type": "object",
                "properties": {
                    "summary": { "type": "string", "description": "Markdown, at most 50 words: the problem this change solves and how it goes about it, said plainly. Why over what. Anywhere in the guide's Markdown, `[[path]]` or `[[path#L12]]` renders as a link that jumps to that file or line in the diff." },
                    "before": { "type": "string", "description": "How things behaved before, at most 30 words a user or caller would recognise. Omit for something brand new." },
                    "after": { "type": "string", "description": "How they behave now, at most 30 words a user or caller would recognise." },
                    "diagram": { "type": "string", "description": "Only when the change adds or reshapes a flow: a Mermaid flowchart of 4-10 nodes with real names, shown about 700px wide, so `flowchart LR` for up to 5 steps in a row and `flowchart TD` for longer chains. Mark new nodes with :::added, changed ones with :::changed and removed ones with :::removed (draw edges to removed nodes with -.->); no classDef, style or init lines. Link a node to its code with a line `%% ref node:<id> [[path#L12]]` so clicking it opens that spot in the diff, and an arrow with `%% ref edge:<from>-><to> [[path#L12]]`. Quote labels with brackets, parentheses or punctuation, e.g. A[\"takeShare()\"]. No markdown fences." },
                    "flow": {
                        "type": "array",
                        "description": "Only with a diagram: its nodes in the order a request or event goes through them, 3-10 steps, so the reviewer can play through it. A node may appear more than once (e.g. a return).",
                        "items": {
                            "type": "object",
                            "properties": {
                                "node": { "type": "string", "description": "A node id as written in the diagram, e.g. `A` for `A[Load]`." },
                                "text": { "type": "string", "description": "Markdown, one sentence, at most 25 words: what happens at this step and why." }
                            },
                            "required": ["node", "text"]
                        }
                    },
                    "chapters": {
                        "type": "array",
                        "minItems": 1,
                        "description": "The fewest chapters that keep independent ideas apart (usually 2-6), in reading order: the core change first, then what supports it, then tests, config, migrations and generated files.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": { "type": "string", "description": "2-6 words naming the idea, e.g. \"Cache file reads\"; never a file name." },
                                "summary": { "type": "string", "description": "Markdown, 1-2 sentences, at most 40 words: why these files change and what they achieve together. Why over what; do not walk through the code." },
                                "points": { "type": "array", "items": { "type": "string" }, "description": "0-3 short facts, at most 20 words each, that make the files easier to read: how it builds on an earlier chapter, a non-obvious thing the code relies on, an odd choice and its reason. Empty when the summary is enough." },
                                "focus": { "type": "array", "items": { "type": "string" }, "description": "0-3 short things worth checking across the chapter, at most 20 words each, e.g. \"An empty list returns early\". Pointers for attention, not review findings. Empty when nothing stands out." },
                                "attention": { "type": "string", "enum": ["high", "normal", "low"], "description": "high: the core logic, read every line. normal: supporting code. low: tests, generated files, lockfiles, renames, config to skim." },
                                "phase": { "type": "string", "description": "Only for guides of 5+ chapters: the stage this chapter belongs to, 1-4 words, e.g. \"Data layer\" or \"UI\". Chapters of one phase must be next to each other; use 2-4 phases." },
                                "files": { "type": "array", "items": { "type": "string" }, "minItems": 1, "description": "Paths exactly as get_diff lists them, most important first; with a callstack, in the order the stack first reaches them." },
                                "notes": {
                                    "type": "array",
                                    "description": "Optional and sparing (a whole guide usually has 0-8): explanations shown in the diff right where the code is. Only where they save the reviewer time: why something non-obvious is done, a subtle behaviour change, a risk. Never what the code plainly says, and never what focus already says.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "path": { "type": "string", "description": "One of this chapter's files." },
                                            "line": { "type": "integer", "minimum": 1, "description": "The line the note is about, numbered as in the hunk headers; the note shows right below it. Give it whenever the point is about one spot. Omit only for a note about the whole file." },
                                            "side": { "type": "string", "enum": ["new", "old"], "description": "\"old\" for a removed line; \"new\" (default) otherwise." },
                                            "text": { "type": "string", "description": "1-2 sentences of Markdown, at most 40 words." },
                                            "critical": { "type": "boolean", "description": "Only when the reviewer should take extra care: security, data loss, hard to revert, easy to get wrong." }
                                        },
                                        "required": ["path", "text"]
                                    }
                                },
                                "callstack": {
                                    "type": "array",
                                    "maxItems": 14,
                                    "description": "Optional: the order this chapter's code runs in, from its entry point (a route, command, UI event, job) down through the calls that matter, so the reviewer can step through it and jump to each call in the diff. Each entry point is a depth-0 row; a chapter with several (e.g. two endpoints) lists each with its calls under it. Add one when the chapter's logic is a chain of calls that return, branch or return early; skip it for config, tests, renames or a single function. Keep to about 4-12 rows on the main path; leave out trivial helpers. List rows in the order they run, a callee right after its caller.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "depth": { "type": "integer", "minimum": 0, "description": "0 for the entry point; a callee is one deeper than its caller. Each row is at most one deeper than the row above." },
                                            "call": { "type": "string", "description": "For a call: just the name the code uses, at most 60 characters, so the reviewer can find it in the diff, e.g. `requirePublicationMember`, `memberModel.findOne` or `POST /invites/:id/respond`. No arguments, assignments or pseudo-code: the code is next to the guide. For an exit: plain words, e.g. `403 if the user isn't a joined member`." },
                                            "what": { "type": "string", "description": "Calls only: what this step does, in plain words, at most 10, e.g. \"loads the member row\" or \"saves the invite and emails it\"." },
                                            "kind": { "type": "string", "enum": ["call", "exit"], "description": "call (default): a function, method or request the code makes. exit: an early return or throw out of the row above, in plain words." },
                                            "change": { "type": "string", "enum": ["added", "removed", "same"], "description": "added: new in this diff. removed: a call the diff takes out. same (default): unchanged code the flow passes through." },
                                            "path": { "type": "string", "description": "The file of the diff the call is in. Omit for code outside the diff." },
                                            "line": { "type": "integer", "minimum": 1, "description": "The first line of the code this step is about, numbered as in the hunk headers, so clicking the row jumps there." },
                                            "endLine": { "type": "integer", "minimum": 1, "description": "The last line of that code when it is a block, e.g. the closing brace of an if or the end of a short function, so the whole block is highlighted (at most 40 lines, inside one hunk). Omit for a single line." },
                                            "side": { "type": "string", "enum": ["new", "old"], "description": "\"old\" for a removed line; \"new\" (default) otherwise." },
                                            "why": { "type": "string", "description": "Optional, at most 25 words of Markdown: why this call happens here, shown while stepping. Skip when the call says it." }
                                        },
                                        "required": ["depth", "call"]
                                    }
                                },
                                "impact": {
                                    "type": "array",
                                    "maxItems": 8,
                                    "description": "Optional: code the diff does NOT touch that depends on what this chapter changes and may now behave differently or break: callers of a changed function, readers of a changed type, consumers of a changed endpoint or event. Find them by searching the repository. Leave out anything in the diff (the reviewer reads it anyway) and anything that keeps working as before; skip the field when nothing qualifies.",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "site": { "type": "string", "description": "The dependent code, e.g. `loadSettings()` or `GET /api/session`." },
                                            "path": { "type": "string", "description": "Repository-relative path of the dependent code, outside the diff." },
                                            "line": { "type": "integer", "minimum": 1, "description": "The line of the call or use in that file." },
                                            "text": { "type": "string", "description": "Markdown, one sentence, at most 25 words: what changes for it, e.g. \"Now gets `null` for a missing user instead of throwing.\"" }
                                        },
                                        "required": ["site", "path", "text"]
                                    }
                                }
                            },
                            "required": ["title", "summary", "files"]
                        }
                    }
                },
                "required": ["summary", "chapters"]
            }),
            false,
        ),
    ]
}

/// The tools for an agent the user runs in a terminal: every tool, each taking the repository and view it
/// works on, plus `open_in_diffity`.
pub fn terminal() -> Vec<Tool> {
    let mut tools: Vec<Tool> = all()
        .into_iter()
        .map(|mut tool| {
            let mut input = (*tool.input_schema).clone();
            let properties = input.entry("properties").or_insert_with(|| json!({}));
            if let Value::Object(props) = properties {
                props.insert("path".into(), json!({ "type": "string", "description": PATH_ARG }));
                props.insert("ref".into(), json!({ "type": "string", "description": REF_ARG }));
            }
            tool.input_schema = Arc::new(input);
            tool
        })
        .collect();
    tools.push(tool(
        OPEN_TOOL,
        "Open the repository's changes in the Diffity app so the user can review them, e.g. when you have finished a \
         change. Brings Diffity to the front.",
        json!({
            "type": "object",
            "properties": {
                "path": { "type": "string", "description": PATH_ARG },
                "ref": { "type": "string", "description": "The view to open, e.g. \"main...HEAD\" for the branch. Omit to let Diffity pick." }
            }
        }),
        true,
    ));
    tools
}

pub const OPEN_TOOL: &str = "open_in_diffity";

const PATH_ARG: &str = "The repository or worktree to use, when it is not your working directory.";
const REF_ARG: &str = "The Diffity view: \"work\" for uncommitted changes, \"main...HEAD\" for the branch, and so on. \
                       Omit it to use the view the user last commented in; every answer names the view it used.";

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
                "dismiss",
                "set_guide"
            ]
        );
    }
}
