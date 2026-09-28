# Summarize changes

Summarize the changes in `{{ref}}` for a reviewer.

**Diffity tools only.** Read the diff and read/write review comments exclusively through the `diffity` MCP server tools in this session (named `mcp__diffity__<tool>`, e.g. `mcp__diffity__get_diff`, `mcp__diffity__list_threads`, `mcp__diffity__add_comment`). Do NOT run any `diffity` command-line program (e.g. `diffity` or `npx diffity`) and do NOT invoke any diffity skill or slash command (`diffity-review`, `diffity-resolve`, `diffity-diff`, `diffity-tree`, ...) — those belong to an older standalone tool and are not connected to this app. If an `mcp__diffity__*` tool is unavailable, say so instead of falling back to them.

1. Call the `get_diff` tool from the `diffity` MCP server to get the unified diff (use `git log` for the range when commit messages add context).
2. Read enough of the surrounding code to understand intent, not just the text of the hunks.
3. Write the summary:
   - **Overview** — one or two sentences: what this change does and why.
   - **Changes by area** — group files by area (e.g. backend, frontend, tests, config, docs). For each area, bullet the meaningful changes with file paths. Collapse mechanical changes (renames, formatting) into a single line.
   - **Behaviour changes** — anything user-visible, API/contract changes, migrations, new config or dependencies.
   - **Worth a closer look** — risky or subtle spots a reviewer should focus on, with `path:line`.

Be concise and factual; no filler, no praise. Do not leave review comments and do not edit files.
