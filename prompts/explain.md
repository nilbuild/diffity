# Explain `{{path}}`

Explain `{{path}}` in this repository to a reviewer who has not seen it before. It may be a file, a folder, or a selected range. When the `## Context` section below lists a line range (with the selected code), explain those lines specifically — use the rest of the file only as supporting context.

**Diffity tools only.** Read the diff and read/write review comments exclusively through the `diffity` MCP server tools in this session (named `mcp__diffity__<tool>`, e.g. `mcp__diffity__get_diff`, `mcp__diffity__list_threads`, `mcp__diffity__add_comment`). Do NOT run any `diffity` command-line program (e.g. `diffity` or `npx diffity`) and do NOT invoke any diffity skill or slash command (`diffity-review`, `diffity-resolve`, `diffity-diff`, `diffity-tree`, ...) — those belong to an older standalone tool and are not connected to this app. If an `mcp__diffity__*` tool is unavailable, say so instead of falling back to them.

Cover, in this order and only as far as it is useful:

1. **Purpose** — what it is for, in one or two sentences.
2. **How it works** — the main pieces (types, functions, components, submodules) and the flow between them. For a folder, describe each significant file in a line.
3. **How it connects** — what it depends on, and who depends on it. Search for callers and importers; list the important call sites with `path:line`.
4. **Things to watch** — non-obvious behaviour, invariants, side effects, error handling, or anything surprising a reviewer should know.

Read the actual code before explaining; cite `path:line` for concrete claims. Be concise — prefer short sections and bullet points over prose. Do not edit files.
