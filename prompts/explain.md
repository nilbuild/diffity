# Explain `{{path}}`

Explain `{{path}}` in this repository to a reviewer who has not seen it before. It may be a file, a folder, or a selected range (see the attached context).

Cover, in this order and only as far as it is useful:

1. **Purpose** — what it is for, in one or two sentences.
2. **How it works** — the main pieces (types, functions, components, submodules) and the flow between them. For a folder, describe each significant file in a line.
3. **How it connects** — what it depends on, and who depends on it. Search for callers and importers; list the important call sites with `path:line`.
4. **Things to watch** — non-obvious behaviour, invariants, side effects, error handling, or anything surprising a reviewer should know.

Read the actual code before explaining; cite `path:line` for concrete claims. Be concise — prefer short sections and bullet points over prose. Do not edit files.
