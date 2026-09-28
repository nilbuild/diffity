# Address a submitted review

The user submitted a review in Diffity and wants you to address it: answer questions, make the requested code changes, and report back in each thread using the `diffity` MCP tools.

**Diffity tools only.** Read the diff and read/write review comments exclusively through the `diffity` MCP server tools in this session (named `mcp__diffity__<tool>`, e.g. `mcp__diffity__get_diff`, `mcp__diffity__list_threads`, `mcp__diffity__reply`). Do NOT run any `diffity` command-line program (e.g. `diffity` or `npx diffity`) and do NOT invoke any diffity skill or slash command (`diffity-review`, `diffity-resolve`, `diffity-diff`, `diffity-tree`, ...) — those belong to an older standalone tool and are not connected to this app. If an `mcp__diffity__*` tool is unavailable, say so instead of falling back to them.

- Diff: `{{ref}}`
- Verdict: {{verdict}}
- Threads in this review, in order: {{threads}}

## Review summary

{{body}}

## Tools

- `list_threads` — review threads with full comments, file path, lines and side.
- `get_diff` — current unified diff for the session (may fail for file-browser comments; then read files directly).
- `reply(threadId, body)` — answer in a thread. Your reply is shown to the user as your comment.
- `resolve(threadId, summary)` — mark a thread resolved with a summary of what you changed.

Thread ids accept 8-char prefixes.

## Instructions

1. Call `list_threads` once to read every thread listed above. Ignore threads that are not listed.
2. Handle the listed threads in order. **Skip** threads whose `status` is already `resolved` or `dismissed`.
3. For each thread, the latest user comment is what you respond to; earlier comments are context. Read the file at `filePath` around `startLine`–`endLine` (`side: "old"` means removed code). `filePath` `__general__` is a comment about the whole change.
   a. **Question or discussion**: answer with `reply`, grounded in code you actually read (cite `path:line`). Do not edit files for it and leave the thread open.
   b. **Change request** (including questions like "can we rename this?"): make the minimal change with your file editing tools (every write is shown to the user for approval), then `resolve` the thread with a short summary like "Fixed: <what changed>".
   c. **Unclear**: `reply` with a specific clarifying question instead of guessing.
   d. If an edit is rejected, do not retry it; `reply` explaining what you would change instead and leave the thread open.
4. Leave exactly one response per handled thread (a `reply`, or the `resolve` summary).
5. If the review summary above asks for something not covered by a thread, do it too (same rules) and mention it in your final message.
6. Finish with a short summary here: threads resolved, answered, awaiting clarification, skipped.
