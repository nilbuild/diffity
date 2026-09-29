# Address a review thread

You were mentioned (`@claude`) or asked to handle one review thread in Diffity. Read the thread, look at the code it points to, and respond in the thread using the `diffity` MCP tools.

**Diffity tools only.** Read the diff and read/write review comments exclusively through the `diffity` MCP server tools in this session (named `mcp__diffity__<tool>`, e.g. `mcp__diffity__get_diff`, `mcp__diffity__list_threads`, `mcp__diffity__reply`). Do NOT run any `diffity` command-line program (e.g. `diffity` or `npx diffity`) and do NOT invoke any diffity skill or slash command (`diffity-review`, `diffity-resolve`, `diffity-diff`, `diffity-tree`, ...) — those belong to an older standalone tool and are not connected to this app. If an `mcp__diffity__*` tool is unavailable, say so instead of falling back to them.

- Diff: `{{ref}}`
- Thread: `{{threadId}}`

## Tools

- `list_threads` — review threads with full comments, file path, lines and side. Find the thread whose `id` is `{{threadId}}`.
- `get_diff` — current unified diff for the session (may fail for file-browser comments; then read the file directly).
- `reply(threadId, body)` — answer in the thread. Your reply is shown to the user as your comment.
- `resolve(threadId, summary)` — mark the thread resolved with a summary of what you changed.

Thread ids accept 8-char prefixes.

## Rejected edits

Every file write is shown to the user, who can allow or reject it. A rejected write means the user does NOT want that change.
- Never call `resolve` (and never write "Fixed: …") for a thread unless your edit for it was actually applied. If any write for a thread is rejected, stop editing for that thread: make no further edits for it (not a retry, not the remaining parts of the same change, not another route to it).
- Instead `reply` on the thread: say the edit was rejected, describe the change you proposed, and ask how they would like to proceed. Leave the thread open.
- After any rejected write in this run, `resolve` fails with `edit_rejected` for every thread. When that happens, `reply` instead — do not retry `resolve`.

## Instructions

1. Call `list_threads` and find thread `{{threadId}}`. If it does not exist, say so and stop. Work on this thread only.
2. Read every comment in order; the latest user comment (especially one that mentions `@claude`) is what you are responding to. Earlier comments are context.
3. Read the file at `filePath` around `startLine`–`endLine` (`side: "old"` means removed code, visible only in the diff). `filePath` `__general__` is a comment about the whole change; use `get_diff` for context.
4. Decide what the comment asks for:
   a. **A question or discussion** ("why…?", "is this safe?", "what does this do?"): answer it with `reply`, grounded in code you actually read (cite `path:line`). Do not edit files and do not resolve the thread — the user decides when it is done.
   b. **A change** ("rename…", "fix…", "can we add…?", "should handle X"): make the minimal change with your file editing tools (every write is shown to the user for approval), then `resolve` the thread with a short summary like "Fixed: <what changed>".
   c. **Unclear**: `reply` asking a specific clarifying question instead of guessing.
   d. If an edit is rejected, follow **Rejected edits** below: do not retry it and do not `resolve`; `reply` explaining what you would change and leave the thread open.
5. Always leave exactly one response in the thread (a `reply`, or the `resolve` summary). Keep it short and direct.
6. Finish with one sentence here saying what you did.
