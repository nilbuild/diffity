//! Agent mention detection (`@claude`, `@codex`) for review comments.

/// Mention handles, one per agent id. The first mentioned handle decides which agent answers.
pub const AGENT_HANDLES: [&str; 3] = ["claude", "codex", "opencode"];

/// True when `body` mentions an agent (case-insensitive, whole word) outside fenced code blocks and inline code spans.
pub fn mentions_agent(body: &str) -> bool {
    mentioned_agent(body).is_some()
}

/// The agent id of the earliest agent mention in `body`, ignoring code.
pub fn mentioned_agent(body: &str) -> Option<&'static str> {
    let prose = strip_code(body);
    AGENT_HANDLES
        .iter()
        .filter_map(|handle| mention_at(&prose, handle).map(|at| (at, *handle)))
        .min_by_key(|(at, _)| *at)
        .map(|(_, handle)| handle)
}

fn fence_marker(line: &str) -> Option<(char, usize)> {
    let trimmed = line.trim_start();
    if line.len() - trimmed.len() > 3 {
        return None;
    }
    let ch = trimmed.chars().next()?;
    if ch != '`' && ch != '~' {
        return None;
    }
    let len = trimmed.chars().take_while(|c| *c == ch).count();
    if len < 3 {
        return None;
    }
    Some((ch, len))
}

/// Replaces fenced blocks and inline code spans with spaces so mentions inside code are ignored.
fn strip_code(body: &str) -> String {
    let mut out = String::with_capacity(body.len());
    let mut fence: Option<(char, usize)> = None;
    for line in body.split_inclusive('\n') {
        if let Some((ch, len)) = fence {
            let closes = fence_marker(line).is_some_and(|(c, l)| {
                c == ch && l >= len && line.trim().chars().all(|x| x == ch)
            });
            if closes {
                fence = None;
            }
            out.push('\n');
            continue;
        }
        if let Some(marker) = fence_marker(line) {
            fence = Some(marker);
            out.push('\n');
            continue;
        }
        out.push_str(&strip_inline_code(line));
    }
    out
}

fn strip_inline_code(line: &str) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '`' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let run = chars[i..].iter().take_while(|c| **c == '`').count();
        let close = find_backtick_run(&chars, i + run, run);
        let Some(close) = close else {
            for _ in 0..run {
                out.push('`');
            }
            i += run;
            continue;
        };
        out.push(' ');
        i = close + run;
    }
    out
}

fn find_backtick_run(chars: &[char], from: usize, run: usize) -> Option<usize> {
    let mut j = from;
    while j < chars.len() {
        if chars[j] != '`' {
            j += 1;
            continue;
        }
        let len = chars[j..].iter().take_while(|c| **c == '`').count();
        if len == run {
            return Some(j);
        }
        j += len;
    }
    None
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric() || c == '_' || c == '-'
}

fn mention_at(text: &str, handle: &str) -> Option<usize> {
    let lower = text.to_lowercase();
    let needle = format!("@{handle}");
    let mut start = 0;
    while let Some(pos) = lower[start..].find(&needle) {
        let at = start + pos;
        let end = at + needle.len();
        let before_ok = lower[..at]
            .chars()
            .next_back()
            .is_none_or(|c| !is_word_char(c) && c != '@' && c != '.' && c != '/');
        let mut rest = lower[end..].chars();
        let after_ok = match rest.next() {
            None => true,
            Some('.') => rest.next().is_none_or(|c| !is_word_char(c)),
            Some(c) => !is_word_char(c) && c != '@' && c != '/',
        };
        if before_ok && after_ok {
            return Some(at);
        }
        start = end;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::{mentioned_agent, mentions_agent};

    #[test]
    fn detects_plain_mentions() {
        assert!(mentions_agent("@claude can you fix this?"));
        assert!(mentions_agent("hey @Claude, why?"));
        assert!(mentions_agent("ping @CLAUDE"));
        assert!(mentions_agent("thoughts @claude."));
        assert!(mentions_agent("(@claude) please"));
        assert!(mentions_agent("line one\n@claude: rename it"));
    }

    #[test]
    fn requires_word_boundaries() {
        assert!(!mentions_agent("mail me at bob@claude.ai"));
        assert!(!mentions_agent("@claudette said so"));
        assert!(!mentions_agent("@claude_bot"));
        assert!(!mentions_agent("@claude-code"));
        assert!(!mentions_agent("see @@claude"));
        assert!(!mentions_agent("claude should fix it"));
        assert!(!mentions_agent("npm i @claude/sdk"));
    }

    #[test]
    fn ignores_code() {
        assert!(!mentions_agent("use `@claude` in comments"));
        assert!(!mentions_agent("``a `@claude` b``"));
        assert!(!mentions_agent("```\n@claude\n```"));
        assert!(!mentions_agent("~~~md\nhello @claude\n~~~\n"));
        assert!(mentions_agent("```\ncode\n```\n@claude after the fence"));
        assert!(mentions_agent("unclosed ` tick @claude"));
    }

    #[test]
    fn picks_the_first_mentioned_agent() {
        assert!(mentions_agent("@codex please look"));
        assert_eq!(mentioned_agent("@codex please look"), Some("codex"));
        assert_eq!(mentioned_agent("@claude or @codex"), Some("claude"));
        assert_eq!(mentioned_agent("@codex then @claude"), Some("codex"));
        assert_eq!(mentioned_agent("`@claude` but @codex"), Some("codex"));
        assert_eq!(mentioned_agent("@codexx"), None);
    }
}
