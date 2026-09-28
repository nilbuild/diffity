use crate::types::{AgentAction, AgentMode, ContextChip};
use diffity_core::types::Side;

const REVIEW: &str = include_str!("../../../prompts/review.md");
const RESOLVE: &str = include_str!("../../../prompts/resolve.md");
const ASK: &str = include_str!("../../../prompts/ask.md");
const EXPLAIN: &str = include_str!("../../../prompts/explain.md");
const SUMMARIZE: &str = include_str!("../../../prompts/summarize.md");

const EDIT_PREAMBLE: &str = "You are a coding assistant embedded in Diffity, a desktop code-review app, working in the repository at the current working directory. Make the changes the user asks for with your file editing tools; every write is shown to the user for approval. Keep changes minimal and focused. For review comments use only the `diffity` MCP tools (`mcp__diffity__*`); never run a `diffity` CLI or invoke a diffity skill/slash command — those belong to an older tool and are not connected to this app.";

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
) -> Option<String> {
    match action {
        AgentAction::Review { r#ref, focus } => {
            let focus = focus
                .as_deref()
                .filter(|f| !f.trim().is_empty())
                .unwrap_or("everything");
            Some(render(REVIEW, &[("ref", r#ref), ("focus", focus)]))
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

pub fn build_prompt(
    mode: AgentMode,
    action: &AgentAction,
    session_ref: &str,
    first_turn: bool,
    text: &str,
    context: &[ContextChip],
) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(template) = action_template(mode, action, session_ref, first_turn) {
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
            },
            AgentAction::Review {
                r#ref: "work".into(),
                focus: None,
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
        ];
        for action in &actions {
            let p = build_prompt(AgentMode::Review, action, "work", true, "", &[]);
            assert!(
                !p.contains("{{"),
                "unrendered placeholder in {action:?}: {p}"
            );
        }
    }

    #[test]
    fn every_template_restricts_agents_to_diffity_mcp_tools() {
        for template in [REVIEW, RESOLVE, ASK, EXPLAIN, SUMMARIZE, EDIT_PREAMBLE] {
            assert!(template.contains("mcp__diffity__"), "{template}");
            assert!(template.contains("CLI") || template.contains("command-line"), "{template}");
        }
    }

    #[test]
    fn review_prompt_includes_ref_and_focus() {
        let action = AgentAction::Review {
            r#ref: "main..feat".into(),
            focus: Some("security".into()),
        };
        let p = build_prompt(AgentMode::Review, &action, "work", true, "", &[]);
        assert!(p.contains("`main..feat`"));
        assert!(p.contains("Focus: security"));
        assert!(p.contains("add_comment"));
        assert!(!p.contains("diffity agent"));
    }

    #[test]
    fn resolve_targets_thread() {
        let action = AgentAction::Resolve {
            thread_id: Some("abcd1234".into()),
        };
        let p = build_prompt(AgentMode::Resolve, &action, "work", false, "", &[]);
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
        );
        assert_eq!(p, "why?");
    }

    #[test]
    fn chat_first_turn_uses_mode_preamble() {
        let ask = build_prompt(AgentMode::Ask, &AgentAction::Chat, "work", true, "hi", &[]);
        assert!(ask.contains("read-only mode"));
        assert!(ask.ends_with("## Request\n\nhi"));
        let edit = build_prompt(AgentMode::Edit, &AgentAction::Chat, "work", true, "hi", &[]);
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
        );
        assert!(p.contains("line 1\n````\n```js"));
    }
}
