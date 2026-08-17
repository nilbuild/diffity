---
name: diffity-tour
description: Create a guided code tour that walks through the codebase to answer a question or explain a feature. Opens in the browser with step-by-step navigation and highlighted code.
user-invocable: true
---

# Diffity Tour Skill

You are creating a guided code tour — a narrated, step-by-step walkthrough of the codebase that answers the user's question or explains how a feature works. The tour opens in the browser with a sidebar showing the narrative and highlighted code sections.

## Arguments

- `question` (required): The user's question, topic, concept, or a GitHub PR URL. Examples:
  - `/diffity-tour how does authentication work?`
  - `/diffity-tour explain the request lifecycle`
  - `/diffity-tour how are comments stored and retrieved?`
  - `/diffity-tour closures`
  - `/diffity-tour React hooks`
  - `/diffity-tour walk me through this branch before I merge`
  - `/diffity-tour https://github.com/owner/repo/pull/123`

When the argument is a **GitHub PR URL** (matching `github.com/owner/repo/pull/N`), the tour is automatically locked to **Review mode** — the PR's diff drives the scope, and the conclusion must include a PR-flags list. See the **Review tours** section below.

## CLI Reference

```
{{binary}} agent tour-start --topic "<text>" [--body "<text>"] --json
{{binary}} agent tour-step --tour <id> --file <path> --line <n> [--end-line <n>] [--view code|diff] [--side old|new] --body "<text>" [--annotation "<text>"] --json
{{binary}} agent tour-done --tour <id> --json
{{binary}} list --json
```

## Prerequisites

1. Check that `{{binary}}` is available: run `which {{binary}}`. If not found, {{install_hint}}.
2. **If the argument is a GitHub PR URL**:
   - Check `gh` is installed and authenticated: run `gh auth status`. If not authenticated, stop and ask the user to run `gh auth login`.
   - Verify the current repo matches the PR's repo: run `gh repo view --json nameWithOwner -q .nameWithOwner` and confirm it matches the `owner/repo` in the URL. If it doesn't, stop and tell the user they need to be inside the PR's repository clone — diffity can't tour a PR for a repo you don't have checked out.
   - Start diffity against the PR: run `{{binary}} --no-open <pr-url>` using the Bash tool with `run_in_background: true`. **The `--no-open` flag must come BEFORE the URL** — commander's `passThroughOptions()` will slurp any flag that appears after the positional URL into the refs array, skipping PR handling and producing an "unknown ref" error. This command checks out the PR's branch locally and starts a diff-scoped session. Wait 2 seconds, then run `{{binary}} list --json` to get the port. You do **not** also need a tree instance — the diff session supports `agent tour-*` commands.
3. **Otherwise**, ensure a tree instance is running: run `{{binary}} list --json`.
   - If no instance is running, start one: run `{{binary}} tree --no-open` using the Bash tool with `run_in_background: true`, wait 2 seconds, then run `{{binary}} list --json` to get the port.

## Instructions

### Pick a mode first

Before doing anything else, decide which mode this tour belongs to. The rest of the skill branches on this choice — scope, research method, and output shape all differ by mode. Do this before any tool calls.

**Shortcut:** if the argument is a GitHub PR URL (matches `github.com/owner/repo/pull/N`), skip the decision — it is locked to **Review mode**.

| Mode | Use when the user asks... | Scoped by | Target steps |
|---|---|---|---|
| **Focused** | a narrow "how does X work?" question | one code path | 3-6 |
| **Feature** | "how does this feature work?" | a feature boundary | 6-10 |
| **System** | "how does the whole thing work?" | architecture | 8-15 |
| **Concept** | about a programming concept | examples in the code | 3-8 |
| **Review** | to audit a branch/PR/feature before merge | `git diff <base>..HEAD` | variable — cover every meaningful change |

Trigger words that steer toward each mode:
- **Focused**: "how does X validate", "walk me through the Y endpoint"
- **Feature**: "how does authentication work", "explain the comment system"
- **System**: "how does the app work", "give me the architecture overview"
- **Concept**: concept names on their own (`closures`, `React hooks`, `async/await`, `generics`)
- **Review**: "before I merge", "review this branch", "walk me through the whole feature", "audit this PR", "I'm about to merge"

If multiple modes fit, prefer the more specific one (Review > Concept > Focused > Feature > System). If you genuinely can't tell which the user wants, ask before researching — don't guess and produce the wrong tour shape.

Mode changes which sections of this skill apply:
- **Concept mode** → read the **Concept tours** section below; research differs (search for examples, not follow a flow) and so does step progression.
- **Review mode** → read the **Review tours** section below; scoping is diff-driven, threads are walked one at a time, and the conclusion must include a PR-flags list.
- **Focused / Feature / System mode** → the default Phase 1-3 instructions apply directly.

### Phase 1: Scope and research

Before creating any tour steps, you must deeply understand the answer to the user's question.

1. **Confirm the scope.** The mode you picked sets a rough step count (see **Pick a mode** above). If the user's question is too broad to fit at that size (e.g. "explain everything" landing in System mode), mentally narrow to the most important aspect and state in the intro what you're covering and what you're leaving out.

2. **Identify the audience.** Consider how the question was phrased:
   - "How does X work?" → assume someone **new to this codebase** — explain architectural decisions, not just code mechanics
   - "Why does X do Y?" → assume someone **debugging or reviewing** — focus on the reasoning and edge cases
   - "Walk me through X" → assume someone who wants the **full picture** — be thorough, include context

3. **Research the codebase.** Read the relevant source files thoroughly. Follow the code path from entry point to completion.

   For review tours especially, also read `git log --reverse <base>..HEAD` and open any commit whose message describes a non-obvious fix, refactor, or defensive change. The author's own narrative is often the best source of *why* — far better than inferring intent from the code alone. Quote or paraphrase commit reasoning in step bodies where it illuminates a design decision (e.g. "commit `abc1234` introduced this check after a production incident where...").

   **When touring a GitHub PR, use `gh` for metadata and diff:**
   - `gh pr view <url> --json title,body,baseRefName,headRefName,commits,files` — PR title, body, base/head branches, commit list, and changed-file list. The PR **body** often contains the richest "why" (design context, screenshots, trade-offs the author considered) — quote or summarize it in the intro.
   - `gh pr diff <url>` — the unified diff that defines the tour's scope. Use this to confirm the full surface area, not just what you see in `git diff`.
   - Use the PR's `baseRefName` (from the JSON above) as the diff base — not `master`/`main` by default. Commands like `git log --reverse <baseRefName>..<headRefName>` walk the PR's commits in author order.
   - Source files are readable from the working tree because `{{binary}} <pr-url>` has already checked out the PR branch locally.

4. **Identify the key locations** that tell the story — the files and line ranges that someone needs to see to understand the answer.

5. **Note configuration dependencies.** If the behavior changes based on environment variables, feature flags, config files, or runtime conditions, note these. They must be called out in the tour so the reader understands "this is what happens when X is configured, but if Y were set instead, the flow would differ here."

6. **Plan a logical sequence** of steps that builds understanding progressively. Each step should lead naturally to the next.

**Guidelines for choosing steps:**
- Start at the real entry point — where external input arrives (HTTP route, CLI command, scheduled job, webhook). Config, schemas, constants, and helper functions are **not** entry points; they are dependencies of the flow.
- Introduce foundations just-in-time. When the flow first reads a schema, tour the schema. When it first calls a helper, tour the helper. When it first references a config value, tour the config. Do not front-load a prelude of foundation pieces before the flow starts.
- At most one "orientation" step (e.g. a route table showing all endpoints) may precede the entry point. Everything else should be motivated by something the reader has just seen.
- Follow the execution path in the order things actually happen.
- Include only locations that are essential to understanding — skip boilerplate.
- End at the final outcome (response sent, data persisted, UI rendered).
- Each step should cover a single concept or code section.
- Include concrete examples where possible (e.g. "when the user runs `{{binary}} main`, this becomes...").

**Top-down, not bottom-up.** A tour mirrors how the code runs at runtime, not how it was built. Do **not** walk config → schema → helpers → routes → actions. Walk route → action → (schema appears here because a query reads it) → (config appears here because a handler references it) → (helper appears here because something calls it). Readers retain context better when each new piece is introduced at the moment it becomes relevant. The reader should feel they're sitting next to you as you trace a real request, not sitting through a lecture about architecture before the demo starts.

**Handling cross-module flows:** When the code path crosses into a library, utility module, or deeply nested abstraction, decide whether to follow it:
- **Follow it** if the logic there is essential to understanding the answer (e.g. a custom middleware that transforms the request)
- **Summarize it** if the module does something standard or well-known (e.g. "this calls the Express router, which matches the path and invokes our handler") — mention what it does in the step body without creating a separate step for it
- **Skip it** if it's pure boilerplate or plumbing (e.g. re-exports, type-only files)

**Patterns applied across many files.** When a single change is replicated across N similar call sites (e.g. the same guard added to 8 handlers, the same middleware registered on every route), do **not** make N steps. Make one step on the most representative file with full context, then list the other call sites as goto links in the body ("the same guard is also added to X, Y, Z"). One concept, one step — the tour should teach the reader the pattern once, not N times. The exception: if one of the applications is subtly different from the others (e.g. called twice in a transfer flow, or with different args), spend a separate step on that one.

### Phase 2: Create the tour

The tour UI has a dedicated explanation panel. The intro (from `tour-start --body`) is displayed as **step 0** — the first thing the reader sees, filling the full panel. Each subsequent step shows its narrative in the same panel alongside the highlighted code. Since the panel has generous space, write rich, detailed explanations.

1. **Start the tour** with a short topic title and introductory body:
   ```
   {{binary}} agent tour-start --topic "<short title>" --body "<intro>" --json
   ```

   The `--topic` is displayed in the tour panel header — keep it to **3–6 words** (e.g. "Authentication Flow", "How Routing Works", "Comment System Architecture"). Do NOT use the user's full question as the topic.

   **Writing the intro body (step 0):**
   This is the first thing the reader sees and it fills the entire explanation panel. Use this space for a thorough architectural overview that sets up everything the reader needs before diving into code. Include:
   - The key components/packages/modules involved and their responsibilities
   - How they connect — data flow, call chains, or dependency relationships
   - Key abstractions or patterns the reader should know about
   - A summary flow diagram using bold text (e.g. **CLI args → git diff → parser → JSON API → React render**)
   - **Configuration context** — if the feature's behavior depends on config, environment variables, or feature flags, mention them here so the reader knows what mode/state the tour assumes

   If you scoped down a broad question, state what you're covering: "This tour focuses on the OAuth login flow. Token refresh and session management are related but covered separately."

   Use rich markdown formatting — paragraphs, bold, `code`, tables, code blocks. This is not a table of contents of what the tour will cover; it's a standalone overview that orients the reader.

   Extract the tour ID from the JSON output.

2. **Add steps** in order. For each step:
   ```
   {{binary}} agent tour-step --tour <id> --file <path> --line <start> --end-line <end> [--view code|diff] [--side old|new] --body "<narrative>" --annotation "<short label>" --json
   ```

   **Writing step content:**

   - `--file`: Path relative to repo root (e.g. `src/server.ts`)
   - `--line` / `--end-line`: The exact line range to highlight. Keep it focused on the relevant section.
   - `--view`: Use `diff` to show this step in the active comparison, or `code` (the default) to show the complete file. A diff step automatically falls back to code view if its starting line is not present in the diff.
   - `--side`: For diff steps, use `new` (the default) for added, modified, and context lines. Use `old` for deleted lines.
   - `--annotation`: A short label (3-6 words) shown as the step title. Think of it as a chapter heading.
   - `--body`: The narrative shown in the explanation panel. This has generous space — use it to write thorough explanations using markdown:

   **Verify targets before committing to a step.** Before calling `tour-step`, verify that the `--file` path is readable from the repo root and that the function or block you're describing actually lives at the advertised `--line`/`--end-line` range — read the range, don't trust memory from earlier in the session. The same applies to every `goto:` link in the body: a broken goto link is worse than no link because the reader trusts it and gets dropped in the wrong place without any signal that the link is wrong. If you're not sure of the exact line, use plain backtick code instead of a goto link.

   **Step body structure.** Every step body should follow this arc, in order:

   1. **Transition** (1 sentence): connect to the previous step — see the examples below.
   2. **Explanation** (the bulk): what this code does and *why* it's structured this way — design decisions, trade-offs, concrete examples. Use sub-highlights (`focus:X-Y`) if the range breaks into distinct sections.
   3. **Takeaway** (1-2 sentences): a gotcha, edge case, or "this is what you'd touch if..." pointer.

   A step body without a transition feels dropped-in; one without a takeaway feels unfinished. Aim for roughly **150-300 words** per step body — longer only if the logic genuinely demands it. If your draft is over 400 words, the step is probably trying to cover two things; consider splitting it.

   **Step transitions — connecting the narrative:**
   Each step should feel like a natural continuation of the previous one. Start each step body with a **transition sentence** that connects it to what came before:
   - "Now that we've seen how the request is parsed, let's look at where it gets validated..."
   - "The handler we just saw delegates to this service, which is where the actual business logic lives..."
   - "At this point the data has been transformed and is ready to be persisted — here's how that happens..."

   Never start a step as if the reader arrived out of context. The tour is a story — each step is a chapter, not an isolated paragraph.

   **Do:**
   - Write in prose paragraphs, supplemented by structured content where it helps
   - Use `code` for function names, variables, refs, commands. When referencing a function, class, or code symbol that lives in a **known file and line**, make it a **goto link** so the reader can click to jump there. Syntax: `` [`symbolName`](goto:path/to/file.ts:startLine-endLine) `` or `` [`symbolName`](goto:path/to/file.ts:line) `` for a single line. These render as clickable inline code that navigates to the file and highlights the target lines. Example: `` [`handleDragEnd`](goto:src/KanbanContent.jsx:42-58) ``. Use plain backtick code for generic terms, CLI commands, or symbols you haven't located in the codebase.
   - Use **bold** for key concepts being introduced
   - Explain *why* the code exists and the design decisions behind it, not just what it does
   - Use concrete examples: "When you run `diffity main`, this line calls `normalizeRef('main')` which computes `git merge-base main HEAD`"
   - Use tables for mappings (input → output, ref → git command)
   - Use code blocks for data structures or command outputs
   - Connect each step to the bigger picture from the intro
   - **Call out edge cases and gotchas** — if there's a non-obvious behavior, a known limitation, or a "this looks wrong but it's intentional" moment, flag it. These are the things that trip people up when they work on this code later.
   - For large highlighted ranges, use **sub-highlight links** to focus on specific sub-sections within the step. Syntax: `[label](focus:startLine-endLine)`. These render as clickable chips that shift the highlight to the specified lines. Example:

     ```markdown
     First, the function validates its parameters:
     [Parameter validation](focus:15-22)

     Then the core transform processes each entry:
     [Core transform](focus:25-40)

     Finally, results are cached before returning:
     [Result caching](focus:42-48)
     ```

     Use sub-highlights when a step covers 30+ lines and the narrative naturally breaks into distinct sections. The line ranges must be within the step's `--line` / `--end-line` range.

   **Mermaid diagrams:**
   When a concept is easier to understand visually — architecture relationships, data flows, state machines, sequence diagrams — include a mermaid code block. Don't force diagrams into every step; use them where they genuinely clarify the explanation. Good candidates:
   - The intro (step 0) overview: a flow showing how components connect
   - Steps involving multi-component interactions or request flows
   - State machines or lifecycle transitions

   Choose the most appropriate diagram type:
   - `graph TD/LR` for architecture, module dependencies, data flow
   - `sequenceDiagram` for call chains, request/response flows
   - `stateDiagram-v2` for state machines, lifecycle transitions
   - `classDiagram` for type hierarchies, struct relationships
   - `flowchart` for algorithms, decision trees, control flow

   Keep diagrams concise (under ~12 nodes). They render inline in the tour panel.

   **Don't:**
   - Write a wall of bullet points — use prose paragraphs with formatting
   - Just describe the syntax — explain the design decisions
   - Repeat information visible in the highlighted code
   - Use headers in step bodies (the annotation serves as the title)
   - Force a diagram into every step — only add one when it genuinely helps
   - Start a step without connecting it to the previous one

3. **Add a conclusion step.** The final step of the tour should wrap things up. Reuse the file/line range from the last meaningful step and write a body that:

   - **Summarizes the full flow** in 2-3 sentences — now that the reader has seen every piece, give them the zoomed-out mental model they can carry forward
   - **Highlights the key design decisions** — what are the 2-3 most important architectural choices in this code, and why were they made?
   - **Points out extension points** — if someone wanted to modify or extend this feature, where would they start? What files would they touch?
   - **Notes related areas** — mention 1-2 related features or flows that connect to this one, so the reader knows where to explore next

   Use the annotation `"Putting It Together"` for this step.

4. **Finish the tour:**
   ```
   {{binary}} agent tour-done --tour <id> --json
   ```

### Phase 3: Open in browser

1. Get the running instance port from `{{binary}} list --json`.
2. Open the tour: `open "http://localhost:<port>/tour/<tour-id>"` (or the appropriate command for the user's OS).
3. Tell the user the tour is ready:

   > Your tour is ready — check your browser.

## Concept tours

When the user asks about a **programming concept** rather than a feature or flow (e.g. "closures", "generics", "error handling patterns"), the tour becomes a teaching tool.

**How concept tours differ from feature tours:**
- **Research phase**: Instead of following an execution path, search the codebase for real instances of the concept. Use grep, glob, and file reads to find patterns. Look broadly — closures might appear as callbacks, factory functions, or event handlers.
- **Example selection**: Pick 3-8 examples that cover different facets, progressing from simple to complex. Don't show 5 examples of the same usage.
- **Intro body**: Write it for someone who may have never encountered this concept. Include: a jargon-free definition, why it exists (what problem it solves), a mental model or analogy, and what syntactic clues to look for.
- **Step bodies**: Each step teaches one facet through a real example. Structure as: orient the reader in the code → point out the concept in action → explain why it's used here → key takeaway. Define jargon inline the first time it appears.
- **Progression**: First example should make the reader think "oh, that's all it is?" Last example should be the most sophisticated usage.
- **Summary step**: Recap 3-5 key rules, list 2-3 common mistakes, suggest related concepts to learn next.
- **Sparse codebases**: If fewer than 3 real examples exist, create temporary teaching snippet files, use them as tour steps (clearly labeled as standalone examples), and delete them after the tour is created.

All other tour guidelines (transitions, goto links, sub-highlights, mermaid diagrams, conclusion) still apply.

## Review tours

When the user asks for a tour to **review a branch, PR, or feature before merge**, organize the tour as a request trace through the user-facing flows, not as an architecture walkthrough. This is the mode most likely to produce an audit the reader can act on.

**How review tours differ from feature tours:**
- **Scope from the diff**: The reader wants to audit what's changing. Start by reading `git diff <base>...HEAD` (and relevant commits) to know the full surface area. Every meaningful change should be visited; skip only pure boilerplate.
- **Show changed lines in context**: Add `--view diff --side new` to steps that explain added or modified lines, and `--view diff --side old` for deletions. Use code view for unchanged supporting code; Diffity also falls back to code view when a requested line is outside the active diff.
- **Intro structure**: State the feature in a paragraph, then include a moving-parts table (area → where → purpose), a high-level flow diagram, and a short configuration-context block (env vars, new constants, behavioral defaults). The intro is where the reader builds the map they'll navigate with.
- **One orientation step allowed**: if there's a route table, webhook switch, or other directory-of-endpoints, it can be step 1 as a menu of threads the tour will follow. Everything after that must be flow-driven.
- **One thread at a time**: pick the most common user journey first (usually "create → activate → ongoing management"), walk it end-to-end touching foundations just-in-time, then repeat for each remaining thread. Do not interleave threads.
- **Cross-cutting gating at the end**: access checks, rate limits, feature flags, or shared guards applied across many actions should come *after* the main flows so the reader sees *what's being gated* before they see *how it's gated*.
- **Conclusion for reviewers**: in addition to the usual mental model + extension points, include a **"Things to flag in the PR conversation"** list — non-obvious trade-offs, defensive code, race windows, stale defaults, non-transactional writes. This is often the most valuable part of a review tour.

All other tour guidelines (transitions, goto links, sub-highlights, mermaid diagrams, conclusion) still apply.

## Quality Checklist

Before finishing, verify:

- [ ] Intro (step 0) gives a thorough architectural overview, not a table of contents
- [ ] If the question was scoped down, the intro states what is and isn't covered
- [ ] Configuration dependencies (env vars, feature flags, config) are called out where relevant
- [ ] The first code step is a real entry point (route, CLI handler, event handler) — not a config file, schema, or helper
- [ ] Foundation pieces (schema, config, constants, helpers) appear at the step where they're first referenced by the flow, not in a prelude
- [ ] No more than one orientation step precedes the entry point
- [ ] Steps follow the actual execution/data flow, not alphabetical file order
- [ ] Each step starts with a transition that connects it to the previous step
- [ ] Design decisions and "why" are explained, not just "what the code does"
- [ ] Edge cases and gotchas are flagged where they exist
- [ ] No two consecutive steps highlight the same lines in the same file
- [ ] Cross-module jumps are either followed, summarized, or skipped — not left unexplained
- [ ] A conclusion step ties everything together with a mental model, design decisions, and extension points
- [ ] Every function, class, or symbol reference with a known file location uses a goto link
- [ ] Every `goto:` link and every `--file` / `--line` value has been verified against the actual file — no guessed line numbers
- [ ] Repeated patterns (same guard/middleware across N files) are covered in one step, not N steps
- [ ] Step bodies follow transition → explanation → takeaway and sit in the 150-300 word range
- [ ] For review tours: a "Things to flag in the PR conversation" list appears in the conclusion
- [ ] For review tours: changed-line steps use diff view with the correct old/new side
