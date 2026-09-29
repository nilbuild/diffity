use crate::types::{AgentAction, AgentMode, ContextChip};
use diffity_core::types::{ReviewVerdict, Side};

const REVIEW: &str = include_str!("../../../prompts/review.md");
const RESOLVE: &str = include_str!("../../../prompts/resolve.md");
const ASK: &str = include_str!("../../../prompts/ask.md");
const EXPLAIN: &str = include_str!("../../../prompts/explain.md");
const SUMMARIZE: &str = include_str!("../../../prompts/summarize.md");
const THREAD: &str = include_str!("../../../prompts/thread.md");
const REVIEW_FEEDBACK: &str = include_str!("../../../prompts/review-feedback.md");

/// Submitted review details for `AgentAction::ReviewFeedback`.
#[derive(Clone, Debug, Default)]
pub struct ReviewBrief {
    pub body: String,
    pub verdict: Option<ReviewVerdict>,
    pub thread_ids: Vec<String>,
}

fn verdict_label(v: Option<ReviewVerdict>) -> &'static str {
    match v {
        Some(ReviewVerdict::Approve) => "approved",
        Some(ReviewVerdict::RequestChanges) => "changes requested",
        Some(ReviewVerdict::Comment) => "comment",
        None => "none (local review, not a pull request)",
    }
}

fn render_review_feedback(session_ref: &str, review: &ReviewBrief) -> String {
    let threads = if review.thread_ids.is_empty() {
        "none (act on the summary only)".to_string()
    } else {
        review
            .thread_ids
            .iter()
            .map(|id| format!("`{id}`"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let body = review.body.trim();
    let body = if body.is_empty() { "(no summary)" } else { body };
    render(
        REVIEW_FEEDBACK,
        &[
            ("ref", session_ref),
            ("verdict", verdict_label(review.verdict)),
            ("threads", &threads),
            ("body", body),
        ],
    )
}

const EDIT_PREAMBLE: &str = "You are a coding assistant embedded in Diffity, a desktop code-review app, working in the repository at the current working directory. Make the changes the user asks for with your file editing tools; every write is shown to the user for approval. Keep changes minimal and focused. For review comments use only the `diffity` MCP tools (`mcp__diffity__*`); never run a `diffity` CLI or invoke a diffity skill/slash command — those belong to an older tool and are not connected to this app.";

fn review_instructions(instructions: Option<&str>) -> String {
    let Some(text) = instructions.map(str::trim).filter(|t| !t.is_empty()) else {
        return String::new();
    };
    let quoted = text.lines().map(|line| format!("> {line}")).collect::<Vec<_>>().join("\n");
    format!(
        "\n## The user's instructions\n\nThe user asked for this review with the guidance below. It takes priority over the generic \
passes in Step 2: spend most of the review on it, and say in your final summary how you addressed it.\n\n{quoted}\n"
    )
}

fn review_scope(paths: &[String]) -> String {
    let paths: Vec<&str> = paths.iter().map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    if paths.is_empty() {
        return String::new();
    }
    let list = paths.iter().map(|p| format!("- `{p}`")).collect::<Vec<_>>().join("\n");
    format!(
        "\n## Scope\n\nReview only these files. `get_diff` already returns just them, and comments on any other file are \
rejected. You may read other files for context, but do not comment on them.\n\n{list}\n"
    )
}

pub fn render(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (key, value) in vars {
        out = out.replace(&format!("{{{{{key}}}}}"), value);
    }
    out
}

/// Template that frames the turn. `None` means the user text is sent as-is.
fn action_template(
    mode: AgentMode,
    action: &AgentAction,
    session_ref: &str,
    first_turn: bool,
    review: Option<&ReviewBrief>,
) -> Option<String> {
    match action {
        AgentAction::Thread { thread_id } => Some(render(
            THREAD,
            &[("ref", session_ref), ("threadId", thread_id)],
        )),
        AgentAction::ReviewFeedback { .. } => {
            let fallback = ReviewBrief::default();
            Some(render_review_feedback(session_ref, review.unwrap_or(&fallback)))
        }
        AgentAction::Review { r#ref, focus, instructions, paths } => {
            let focus = focus
                .as_deref()
                .filter(|f| !f.trim().is_empty())
                .unwrap_or("everything");
            let instructions = review_instructions(instructions.as_deref());
            let scope = review_scope(paths);
            Some(render(
                REVIEW,
                &[("ref", r#ref), ("focus", focus), ("instructions", &instructions), ("scope", &scope)],
            ))
        }
        AgentAction::Resolve { thread_id } => {
            let target = match thread_id {
                Some(id) => format!("thread `{id}` only"),
                None => "all open threads".to_string(),
            };
            Some(render(
                RESOLVE,
                &[
                    ("ref", session_ref),
                    ("target", &target),
                    ("threadId", thread_id.as_deref().unwrap_or("")),
                ],
            ))
        }
        AgentAction::Explain { path } => Some(render(EXPLAIN, &[("path", path)])),
        AgentAction::Summarize { r#ref } => Some(render(SUMMARIZE, &[("ref", r#ref)])),
        AgentAction::Chat => {
            if !first_turn {
                return None;
            }
            match mode {
                AgentMode::Ask | AgentMode::Review => Some(render(ASK, &[("ref", session_ref)])),
                AgentMode::Edit | AgentMode::Resolve => Some(EDIT_PREAMBLE.to_string()),
            }
        }
    }
}

fn render_chip(chip: &ContextChip) -> String {
    let mut header = format!("`{}`", chip.file_path);
    if let Some(start) = chip.start_line {
        let end = chip.end_line.unwrap_or(start);
        if end != start {
            header.push_str(&format!(" lines {start}-{end}"));
        } else {
            header.push_str(&format!(" line {start}"));
        }
        if let Some(side) = chip.side {
            let label = match side {
                Side::Old => " (old side — removed code)",
                Side::New => " (new side)",
            };
            header.push_str(label);
        }
    }
    let Some(snippet) = chip.snippet.as_deref().filter(|s| !s.is_empty()) else {
        return format!("- {header}");
    };
    let fence = if snippet.contains("```") {
        "````"
    } else {
        "```"
    };
    format!(
        "- {header}\n{fence}\n{}\n{fence}",
        snippet.trim_end_matches('\n')
    )
}

/// `review` is only used by `AgentAction::ReviewFeedback`.
pub fn build_prompt(
    mode: AgentMode,
    action: &AgentAction,
    session_ref: &str,
    first_turn: bool,
    text: &str,
    context: &[ContextChip],
    review: Option<&ReviewBrief>,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(template) = action_template(mode, action, session_ref, first_turn, review) {
        parts.push(template.trim_end().to_string());
    }
    if !context.is_empty() {
        let chips: Vec<String> = context.iter().map(render_chip).collect();
        parts.push(format!("## Context\n\n{}", chips.join("\n")));
    }
    let text = text.trim();
    if !text.is_empty() {
        if parts.is_empty() {
            parts.push(text.to_string());
        } else {
            parts.push(format!("## Request\n\n{text}"));
        }
    }
    parts.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn templates_have_no_unrendered_placeholders() {
        let actions = [
            AgentAction::Review {
                r#ref: "main..feat".into(),
                focus: Some("security".into()),
                instructions: Some("Check error handling".into()),
                paths: vec!["src/app.ts".into()],
            },
            AgentAction::Review {
                r#ref: "work".into(),
                focus: None,
                instructions: None,
                paths: Vec::new(),
            },
            AgentAction::Resolve {
                thread_id: Some("abcd1234".into()),
            },
            AgentAction::Resolve { thread_id: None },
            AgentAction::Explain {
                path: "src/lib.rs".into(),
            },
            AgentAction::Summarize {
                r#ref: "HEAD~1".into(),
            },
            AgentAction::Chat,
            AgentAction::Thread {
                thread_id: "abcd1234-full".into(),
            },
            AgentAction::ReviewFeedback {
                review_id: "r1".into(),
            },
        ];
        for action in &actions {
            let p = build_prompt(AgentMode::Review, action, "work", true, "", &[], None);
            assert!(
                !p.contains("{{"),
                "unrendered placeholder in {action:?}: {p}"
            );
        }
    }

    #[test]
    fn every_template_restricts_agents_to_diffity_mcp_tools() {
        for template in [REVIEW, RESOLVE, ASK, EXPLAIN, SUMMARIZE, THREAD, REVIEW_FEEDBACK, EDIT_PREAMBLE] {
            assert!(template.contains("mcp__diffity__"), "{template}");
            assert!(template.contains("CLI") || template.contains("command-line"), "{template}");
        }
    }

    #[test]
    fn review_prompt_includes_ref_and_focus() {
        let action = AgentAction::Review {
            r#ref: "main..feat".into(),
            focus: Some("security".into()),
            instructions: None,
            paths: Vec::new(),
        };
        let p = build_prompt(AgentMode::Review, &action, "work", true, "", &[], None);
        assert!(p.contains("`main..feat`"));
        assert!(p.contains("Focus: security"));
        assert!(p.contains("add_comment"));
        assert!(!p.contains("diffity agent"));
        assert!(!p.contains("The user's instructions"));
        assert!(!p.contains("## Scope"));
    }

    #[test]
    fn review_prompt_includes_instructions_and_paths() {
        let action = AgentAction::Review {
            r#ref: "work".into(),
            focus: None,
            instructions: Some("  This is a perf refactor.\nLook for regressions.  ".into()),
            paths: vec!["src/app.ts".into(), " ".into(), "src/lib/math.ts".into()],
        };
        let p = build_prompt(AgentMode::Review, &action, "work", true, "", &[], None);
        assert!(p.contains("## The user's instructions"));
        assert!(p.contains("takes priority"));
        assert!(p.contains("> This is a perf refactor.\n> Look for regressions."));
        assert!(p.contains("## Scope"));
        assert!(p.contains("- `src/app.ts`\n- `src/lib/math.ts`"));
        assert!(!p.contains("- ` `"));
        assert!(!p.contains("{{"));
    }

    #[test]
    fn review_action_deserializes_without_new_fields() {
        let action: AgentAction = serde_json::from_str(r#"{"kind":"review","ref":"work"}"#).unwrap();
        assert!(matches!(action, AgentAction::Review { ref paths, ref instructions, .. } if paths.is_empty() && instructions.is_none()));
    }

    #[test]
    fn resolve_targets_thread() {
        let action = AgentAction::Resolve {
            thread_id: Some("abcd1234".into()),
        };
        let p = build_prompt(AgentMode::Resolve, &action, "work", false, "", &[], None);
        assert!(p.contains("thread `abcd1234` only"));
    }

    #[test]
    fn chat_follow_up_is_plain_text() {
        let p = build_prompt(
            AgentMode::Ask,
            &AgentAction::Chat,
            "work",
            false,
            "  why?  ",
            &[],
            None,
        );
        assert_eq!(p, "why?");
    }

    #[test]
    fn chat_first_turn_uses_mode_preamble() {
        let ask = build_prompt(AgentMode::Ask, &AgentAction::Chat, "work", true, "hi", &[], None);
        assert!(ask.contains("read-only mode"));
        assert!(ask.ends_with("## Request\n\nhi"));
        let edit = build_prompt(AgentMode::Edit, &AgentAction::Chat, "work", true, "hi", &[], None);
        assert!(edit.contains("approval"));
    }

    #[test]
    fn context_chips_render_range_side_and_snippet() {
        let chips = vec![
            ContextChip {
                file_path: "src/a.rs".into(),
                side: Some(Side::Old),
                start_line: Some(3),
                end_line: Some(5),
                snippet: Some("let x = 1;\n".into()),
            },
            ContextChip {
                file_path: "src/b.rs".into(),
                side: None,
                start_line: None,
                end_line: None,
                snippet: None,
            },
        ];
        let p = build_prompt(
            AgentMode::Ask,
            &AgentAction::Chat,
            "work",
            false,
            "what is this",
            &chips,
            None,
        );
        assert!(
            p.contains("- `src/a.rs` lines 3-5 (old side — removed code)\n```\nlet x = 1;\n```")
        );
        assert!(p.contains("- `src/b.rs`"));
        assert!(p.ends_with("## Request\n\nwhat is this"));
    }

    #[test]
    fn snippet_with_backticks_uses_longer_fence() {
        let chip = ContextChip {
            file_path: "README.md".into(),
            side: None,
            start_line: Some(1),
            end_line: None,
            snippet: Some("```js\nx\n```".into()),
        };
        let p = build_prompt(
            AgentMode::Ask,
            &AgentAction::Chat,
            "work",
            false,
            "",
            &[chip],
            None,
        );
        assert!(p.contains("line 1\n````\n```js"));
    }

    #[test]
    fn thread_prompt_targets_one_thread() {
        let action = AgentAction::Thread {
            thread_id: "abcd1234-5678".into(),
        };
        let p = build_prompt(AgentMode::Resolve, &action, "work", true, "", &[], None);
        assert!(p.contains("- Thread: `abcd1234-5678`"));
        assert!(p.contains("- Diff: `work`"));
        assert!(p.contains("reply"));
        assert!(p.contains("resolve"));
        assert!(!p.contains("{{"));
    }

    #[test]
    fn review_feedback_prompt_lists_threads_and_summary() {
        let action = AgentAction::ReviewFeedback {
            review_id: "r1".into(),
        };
        let brief = ReviewBrief {
            body: "Please tidy the error handling.".into(),
            verdict: Some(ReviewVerdict::RequestChanges),
            thread_ids: vec!["t1".into(), "t2".into()],
        };
        let p = build_prompt(AgentMode::Resolve, &action, "main..feat", true, "", &[], Some(&brief));
        assert!(p.contains("- Threads in this review, in order: `t1`, `t2`"));
        assert!(p.contains("- Verdict: changes requested"));
        assert!(p.contains("## Review summary\n\nPlease tidy the error handling."));
        assert!(p.contains("`main..feat`"));
        assert!(p.contains("Skip** threads whose `status` is already `resolved`"));

        let empty = build_prompt(AgentMode::Resolve, &action, "work", true, "", &[], None);
        assert!(empty.contains("none (act on the summary only)"));
        assert!(empty.contains("(no summary)"));
    }
}
