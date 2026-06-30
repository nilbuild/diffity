<img src="./packages/ui/public/brand.svg" width="80" />

# diffity

[![npm version](https://img.shields.io/npm/v/diffity)](https://www.npmjs.com/package/diffity)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Diffity is an agent-agnostic, GitHub-style diff viewer and code review tool.

```bash
npm install -g diffity
```

It works with Claude Code, Cursor, Codex, and any AI coding agent.

| What can you do? | Description |
|---|---|
| [See your diffs](#see-your-diffs) | View changes in working area, across commits, branches, tags, etc  |
| [AI code review](#ai-code-review) | Let your agent review code and leave comments on the diff |
| [Browse project files](#browse-project-files) | Explore your repo and comment on any file for AI to resolve |
| [Guided code tours](#guided-code-tours) | Walk through your codebase step by step with highlighted code |
| [Learn any topic](#learn-any-topic) | Project-driven learning for programming languages, tools, and frameworks |
| [GitHub PRs](#github-prs) | Pull down a PR, review it locally, push comments back to GitHub |
| [Multiple projects](#multiple-projects) | Run it in multiple repos at once, each gets its own port |

## See your diffs

Run `diffity` inside any git repo — your browser opens with a GitHub-style, syntax-highlighted diff.

```bash
# everyday use
diffity                                    # review all uncommitted changes
diffity HEAD~1                             # review your last commit
diffity HEAD~3                             # review your last 3 commits

# branch workflows
diffity main                               # compare current branch against main
diffity main..feature                      # compare feature branch against main
diffity main feature                       # same as above, shorthand syntax
diffity --base main --compare feature      # same as above, explicit flags

# releases and tags
diffity v1.0.0 v2.0.0                     # compare two releases
diffity v1.0.0                             # what changed since v1.0.0

# specific commits
diffity abc1234                            # changes since a specific commit
diffity abc1234..def5678                   # changes between two commits

# filter by change type
diffity work                               # all changes (staged + unstaged + untracked)
diffity staged                             # only staged changes (git add'd)
diffity unstaged                           # only unstaged modifications
```

The `--base`/`--compare` flags use the same terminology as GitHub PRs — base is what you're comparing against, compare is the branch with changes. You can also use range syntax (`main..feature`) or just pass two positional args (`diffity main feature`).

You can leave comments on any diff — working tree changes, branch comparisons, commit ranges. Your agent can also review and leave its own comments. Either way, run `/diffity-resolve` and your agent reads all open comments (yours or its own) and makes the code changes for you.

## AI code review

Install the skills for your coding agent (Claude Code, Cursor, Codex, etc.):

```bash
npx skills add nilbuild/diffity
```

Then use the slash commands:

### `/diffity-diff`

Opens the diff viewer in your browser. Accepts the same refs as the CLI, plus natural language:

```
/diffity-diff                          # working tree changes
/diffity-diff main                     # current branch against main
/diffity-diff main..feature            # branch diff
/diffity-diff HEAD~1                   # last commit
/diffity-diff last 3 commits           # natural language works too
```

Leave comments on any line — when you're done, run `/diffity-resolve` to have your agent fix them.

### `/diffity-review`

Your agent reviews the diff and leaves inline comments in the viewer. Uses severity tags (`[must-fix]`, `[suggestion]`, `[nit]`, `[question]`) so you can triage by importance. Supports refs, focus areas, and natural language:

```
/diffity-review                             # review working tree changes
/diffity-review main                        # review what you're merging into main
/diffity-review main..feature               # review what you're merging into main
/diffity-review identify security issues    # focus on security issues
/diffity-review performance in src/lib      # focus on performance in specific dir
/diffity-review last 3 commits              # natural language works too
```

### `/diffity-resolve`

Reads all open comments and makes the requested code changes. Works with both your comments and AI review comments:

```
/diffity-resolve                       # resolve all open comments
/diffity-resolve abc123                # resolve a specific thread by ID
```

A typical workflow: run `/diffity-review` to get AI feedback, check the comments in the browser, then run `/diffity-resolve` to apply the fixes.

## Browse project files

Run `diffity tree` to open a full file tree browser — no diff required. Browse your repo, read files with syntax highlighting, and leave comments on any file or folder.

```bash
diffity tree
```

The tree view supports the same commenting and resolve workflow as the diff viewer. Leave comments on specific lines, files, or folders, then have your agent resolve them.

### `/diffity-tree`

Opens the file tree browser:

```
/diffity-tree
```

### `/diffity-resolve-tree`

Reads open comments from the tree browser and makes the requested code changes:

```
/diffity-resolve-tree                  # resolve all open comments
/diffity-resolve-tree abc123           # resolve a specific thread by ID
```

## Guided code tours

Create narrated, step-by-step walkthroughs of your codebase. Tours open in the browser with a sidebar showing the narrative and highlighted code sections.

### `/diffity-tour`

Your agent researches the codebase, then builds a tour with highlighted code regions and rich markdown explanations:

```
/diffity-tour how does authentication work?
/diffity-tour explain the request lifecycle
/diffity-tour how are comments stored and retrieved?
/diffity-tour closures
/diffity-tour async/await patterns
/diffity-tour walk me through this branch before I merge
/diffity-tour https://github.com/owner/repo/pull/123
```

Works for features ("how does auth work?"), concepts ("closures", "generics"), and pre-merge reviews. For concepts, the agent finds real examples in your codebase and teaches the concept progressively from simple to complex. For reviews, it walks the user-facing flows end-to-end and ends with a "things to flag in the PR conversation" list — you can pass a branch, a ref range, or a GitHub PR URL.

Each tour has an intro (step 0) with an architectural overview, followed by numbered steps that highlight specific code regions and explain them in detail. The agent follows the actual execution path, not file order — foundations (schemas, config, helpers) are introduced just-in-time when the flow first touches them.

Tour steps can include **sub-highlights** — clickable focus links in the narrative that narrow the highlight to a specific sub-range within the step. Useful for walking through large functions section by section.

## Learn any topic

Start a project-driven learning journey for any programming language, tool, or framework. Your agent becomes a tutor — it builds teaching projects that open as guided tours in the browser, gives you challenges to complete, reviews your code with inline feedback, and adapts to your pace.

### `/diffity-learn`

Kick off a learning journey. Run it in an empty directory where you want to keep your learning files — the agent creates a `learn-<topic>/` folder with lessons, projects, and progress tracking.

```bash
mkdir ~/learning && cd ~/learning
```

Then start learning:

```
/diffity-learn Rust
/diffity-learn Go
/diffity-learn Docker
/diffity-learn SQL
/diffity-learn TypeScript
/diffity-learn Kubernetes
```

Each lesson follows a loop: your agent builds a small project and opens it as a Diffity tour explaining the concepts, then gives you a challenge to build yourself. When you're done, it reviews your code with inline Diffity comments and decides what to teach next.

Progress is saved to `learn.json` — come back anytime and pick up where you left off. The agent tracks what you've mastered, what you're struggling with, and adjusts the curriculum accordingly.

## GitHub PRs

Pass a GitHub PR URL to view and review pull requests locally:

```bash
diffity https://github.com/owner/repo/pull/123
```

This checks out the PR, opens the diff against its base branch, and lets you leave comments in the viewer. Requires the [`gh` CLI](https://cli.github.com/) installed and authenticated (`gh auth login`), and the current repo must match the PR's repository.

You can push your comments (including AI review comments) back to GitHub as PR review comments, and pull existing GitHub comments into the viewer. Both are available from the viewer UI.

The skills work with PR URLs too:

```
/diffity-diff https://github.com/owner/repo/pull/123
/diffity-review https://github.com/owner/repo/pull/123
/diffity-tour https://github.com/owner/repo/pull/123
```

Passing a PR URL to `/diffity-tour` locks it to review mode — the agent reads the PR's description, commits, and diff to build a guided walkthrough that you can use before approving or merging.

## Multiple projects

Diffity supports running multiple projects simultaneously. Each gets its own port automatically:

```bash
# Terminal 1 — starts on :5391
cd ~/projects/app && diffity

# Terminal 2 — starts on :5392
cd ~/projects/api && diffity
```

If you run `diffity` in a repo that already has a running instance, it opens the existing one instead of starting a new server. Use `--new` to kill the existing instance and start fresh.

```bash
diffity list               # show all running instances
diffity list --json        # machine-readable output
```

## Options

```
--base <ref>       Base ref to compare from (e.g. main, HEAD~3, v1.0.0)
--compare <ref>    Ref to compare against base (default: working tree)
--port <port>      Custom port (default: auto-assigned from 5391)
--no-open          Don't open browser
--dark             Dark mode
--unified          Unified view (default: split)
--quiet            Minimal terminal output
--new              Stop existing instance and start fresh
```

## Environment variables

| Variable       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `DIFFITY_HOST` | Hostname used in the printed URL (default: `localhost`).                  |

Useful when running diffity inside a VM or container and opening it from another machine:

```bash
DIFFITY_HOST=diffity.local diffity
```

## License

[PolyForm Shield 1.0.0](./LICENSE) © [Kamran Ahmed](https://x.com/kamrify)
