# Summarize changes

Summarize the changes in `{{ref}}` for a reviewer.

1. Call the `get_diff` tool from the `diffity` MCP server to get the unified diff (use `git log` for the range when commit messages add context).
2. Read enough of the surrounding code to understand intent, not just the text of the hunks.
3. Write the summary:
   - **Overview** — one or two sentences: what this change does and why.
   - **Changes by area** — group files by area (e.g. backend, frontend, tests, config, docs). For each area, bullet the meaningful changes with file paths. Collapse mechanical changes (renames, formatting) into a single line.
   - **Behaviour changes** — anything user-visible, API/contract changes, migrations, new config or dependencies.
   - **Worth a closer look** — risky or subtle spots a reviewer should focus on, with `path:line`.

Be concise and factual; no filler, no praise. Do not leave review comments and do not edit files.
