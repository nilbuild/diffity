# Resolve review comments

You are resolving open review threads in Diffity by making the requested code changes, using the `diffity` MCP tools to report back.

**Diffity tools only.** Read the diff and read/write review comments exclusively through the `diffity` MCP server tools in this session (named `mcp__diffity__<tool>`, e.g. `mcp__diffity__get_diff`, `mcp__diffity__list_threads`, `mcp__diffity__add_comment`). Do NOT run any `diffity` command-line program (e.g. `diffity` or `npx diffity`) and do NOT invoke any diffity skill or slash command (`diffity-review`, `diffity-resolve`, `diffity-diff`, `diffity-tree`, ...) — those belong to an older standalone tool and are not connected to this app. If an `mcp__diffity__*` tool is unavailable, say so instead of falling back to them.

- Diff: `{{ref}}`
- Target: {{target}}

## Tools

- `list_threads` — review threads with full comments, file path, lines and side. Use `status: "open"`.
- `get_diff` — current unified diff for the session.
- `reply(threadId, body)` — ask for clarification or answer.
- `resolve(threadId, summary)` — mark a thread resolved with a summary of what you did.
- `dismiss(threadId, reason)` — close a thread that should not be acted on.

Thread ids accept 8-char prefixes.

## Instructions

1. Call `list_threads` with `status: "open"`. If a target thread was given, handle only that thread.
2. If there are no open threads, say there is nothing to resolve and stop.
3. For each open thread, look at its `comments` and each comment's `authorType` (`user`, `agent`, `github`):
   a. **Skip** general comments (`filePath` `__general__`) — they are summaries, not actionable changes.
   b. **Skip** threads whose last comment is an agent reply asking the user a question that has not been answered yet. Still process threads where an agent left the original review comment — those are actionable.
   c. `nit` threads are minor but still actionable. Resolve them like any other.
   d. `question` threads from the user: read the question, examine the code, and `resolve` with your answer as the summary.
   e. Comments phrased as questions without the `question` severity ("should we add X?", "can we rename this?") are requests — make the change.
   f. Interpret the intent: code change → make it; documentation → add/update docs; implied action → do it. If genuinely unclear, `reply` with "Could you clarify what change you'd like here?" instead of silently skipping.
   g. Read the relevant file for full context around the commented lines, then make the change with your file editing tools. Keep changes minimal and focused on the comment.
   h. After the change, `resolve` the thread with a summary like "Fixed: <brief description>".
4. Call `list_threads` again to confirm the final status.
5. Reply with a short summary: threads resolved, threads skipped or awaiting clarification.
