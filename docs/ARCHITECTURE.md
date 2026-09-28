# Diffity App — Architecture & Contracts

Desktop code-review app. Tauri v2 + Rust backend + React (Vite) frontend using `@pierre/diffs`.
Scope v1: diffs, comments, file browsing, agents (ACP), GitHub (git sync + PR review comments). No CLI, no tours, no learn.
Reference implementation of the old product (read for behaviour, do not copy blindly): `~/Vibecode/diffity`
(`packages/git/src/*.ts` for ref resolution, `packages/github/src/*.ts`, `packages/cli/src/{threads,db,server}.ts`, `skills/*/SKILL.md` for review/resolve prompts).

Defaults chosen: data in app data dir; macOS first; agents = Claude Code via ACP (Codex/Gemini code kept but disabled); GitHub auth = import `gh auth token`, paste PAT, or OAuth device flow when `DIFFITY_GITHUB_CLIENT_ID` is set.

## Layout

```
Cargo.toml                    # workspace: crates/*, apps/desktop/src-tauri
pnpm-workspace.yaml           # apps/desktop
crates/core      (diffity-core)     git CLI wrapper, ref resolution, diff, tree, files, watcher, SQLite Store
crates/agents    (diffity-agents)   agent detection, ACP client, sessions, permission broker, MCP tool bridge (socket server)
crates/mcp       (diffity-mcp)      stdio MCP server binary; proxies tool calls to the app over a unix socket
crates/github    (diffity-github)   auth (keychain/gh/PAT/device flow), git fetch/pull/push, PRs, review push/pull via GraphQL
apps/desktop                        Vite + React 19 + TS + Tailwind v4 + TanStack Query + @pierre/diffs
apps/desktop/src-tauri (diffity-desktop)  thin shell: AppState, commands/*.rs, plugins, windows
prompts/                            review.md, resolve.md, ask.md, explain.md, summarize.md (embedded via include_str!)
```

Ownership rule: each workstream edits only its own directories. Shared files (`src-tauri/src/lib.rs`, `state.rs`, `apps/desktop/src/lib/types.ts`, `lib/api.ts`) are created by the scaffold and changed only if strictly needed, with minimal additive edits.

## Conventions

- All Rust structs crossing IPC: `#[derive(Serialize, Deserialize, Clone, Debug)] #[serde(rename_all = "camelCase")]`. Enums: `#[serde(rename_all = "camelCase")]` or `#[serde(tag = "type", rename_all = "camelCase")]` where noted.
- Commands return `Result<T, AppError>`; `AppError` serializes as `{ code: string, message: string }`. Defined in `diffity-core::error`.
- Every command takes `repo_path: String` (absolute repo root) when repo-scoped. Tauri converts JS camelCase args (`repoPath`) to snake_case params automatically.
- Line numbers are 1-based. `side` is `"old" | "new"` (old = deletions/LEFT, new = additions/RIGHT).
- General (diff-level) comments: `filePath = "__general__"`, `startLine = endLine = 0`. File-level comments: `startLine = endLine = 0` with a real path.
- Events emitted by backend (global `app.emit`): `repo-changed { repoPath }`, `threads-changed { sessionId }`.
- Streaming uses `tauri::ipc::Channel<T>`.
- Shell out to `git` via `tokio::process::Command` / `std::process::Command`, never libgit2. Always `-c core.quotepath=off`, run with `current_dir(repo)`.
- On startup (desktop `main`), load the login-shell environment (`$SHELL -ilc 'env -0'` with a 3s timeout) and apply PATH etc. so GUI launches can find git/node/claude/codex/gemini.

## Data model (SQLite at `<app_data_dir>/diffity.db`, WAL, foreign keys on)

```
repos(id TEXT PK, path TEXT UNIQUE, name TEXT, last_opened_at TEXT)
review_sessions(id TEXT PK, repo_path TEXT, ref TEXT, created_at TEXT, UNIQUE(repo_path, ref))
threads(id TEXT PK, session_id TEXT FK, file_path TEXT, side TEXT, start_line INT, end_line INT,
        status TEXT DEFAULT 'open', severity TEXT NULL, anchor_content TEXT NULL,
        github_thread_id TEXT NULL, github_comment_id INTEGER NULL, created_at TEXT, updated_at TEXT,
        review_id TEXT NULL FK reviews ON DELETE SET NULL)                                   -- v2
comments(id TEXT PK, thread_id TEXT FK ON DELETE CASCADE, author_type TEXT, author_name TEXT,
         body TEXT, github_comment_id INTEGER NULL, created_at TEXT,
         pending INTEGER DEFAULT 0, review_id TEXT NULL FK reviews ON DELETE SET NULL)       -- v2
reviews(id TEXT PK, session_id TEXT FK ON DELETE CASCADE, state 'pending'|'submitted', body TEXT,
        verdict TEXT NULL, created_at TEXT, submitted_at TEXT NULL)                          -- v2; unique partial index: one pending per session
viewed_files(session_id TEXT, file_path TEXT, content_hash TEXT, PRIMARY KEY(session_id, file_path))
chats(id TEXT PK, repo_path TEXT, agent_id TEXT, acp_session_id TEXT NULL, mode TEXT, title TEXT, created_at TEXT, updated_at TEXT)
chat_messages(id TEXT PK, chat_id TEXT FK ON DELETE CASCADE, role TEXT, content_json TEXT, created_at TEXT)
settings(key TEXT PK, value TEXT)
```
A review session is keyed by (repo_path, ref) — NOT head sha — so comments survive commits. `ref` for the file browser is `"__tree__"`.

## Shared types (TS mirror lives in `apps/desktop/src/lib/types.ts`)

```ts
type Side = 'old' | 'new';
type ThreadStatus = 'open' | 'resolved' | 'dismissed';
type Severity = 'must-fix' | 'suggestion' | 'nit' | 'question';
type AuthorType = 'user' | 'agent' | 'github';

interface RepoInfo { path: string; name: string; isGit: boolean; branch: string | null; headSha: string | null; remoteUrl: string | null; }
interface RecentRepo { path: string; name: string; lastOpenedAt: string; }

// ref strings: 'work' | 'staged' | 'unstaged' | '<ref>' | '<a>..<b>' | '<a>...<b>'
interface ResolvedRef { ref: string; label: string; canRevert: boolean; baseSha: string | null; headSha: string | null; }
type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'untracked';
interface DiffFileSummary { path: string; oldPath: string | null; status: FileStatus; additions: number; deletions: number; binary: boolean; }
interface DiffResult { resolved: ResolvedRef; files: DiffFileSummary[]; patch: string; fingerprint: string; }
interface FileVersions { oldContents: string | null; newContents: string | null; }
interface Commit { sha: string; shortSha: string; subject: string; author: string; date: string; }
interface Branch { name: string; isRemote: boolean; isCurrent: boolean; upstream: string | null; ahead: number; behind: number; }
interface GitStatus { branch: string | null; upstream: string | null; ahead: number; behind: number; staged: number; unstaged: number; untracked: number; dirty: boolean; }

interface TreeEntry { path: string; kind: 'file' | 'dir'; }
interface FileContent { path: string; contents: string | null; binary: boolean; size: number; }

interface ReviewSession { id: string; repoPath: string; ref: string; }
interface Comment { id: string; threadId: string; authorType: AuthorType; authorName: string; body: string; createdAt: string; githubCommentId: number | null;
  pending: boolean; reviewId: string | null; mentionsAgent: boolean; }
interface Thread { id: string; sessionId: string; filePath: string; side: Side; startLine: number; endLine: number;
  status: ThreadStatus; severity: Severity | null; anchorContent: string | null; githubThreadId: string | null;
  comments: Comment[]; createdAt: string; updatedAt: string; pending: boolean; reviewId: string | null; }
interface NewThread { sessionId: string; filePath: string; side: Side; startLine: number; endLine: number; body: string;
  severity?: Severity | null; anchorContent?: string | null; authorType?: AuthorType; authorName?: string; pending?: boolean; }
type ReviewVerdict = 'comment' | 'approve' | 'requestChanges';
interface Review { id: string; sessionId: string; state: 'pending' | 'submitted'; body: string; verdict: ReviewVerdict | null;
  pendingCount: number; commentCount: number; threadIds: string[]; mentionedThreadIds: string[]; bodyMentionsAgent: boolean;
  createdAt: string; submittedAt: string | null; }

type AgentMode = 'ask' | 'review' | 'resolve' | 'edit';
interface AgentInfo { id: string; name: string; installed: boolean; binaryPath: string | null; authenticated: boolean | null; note: string | null; }
interface ContextChip { filePath: string; side?: Side; startLine?: number; endLine?: number; snippet?: string; }
type AgentAction =
  | { kind: 'chat' }
  | { kind: 'review'; ref: string; focus?: string }
  | { kind: 'resolve'; threadId?: string }
  | { kind: 'explain'; path: string }
  | { kind: 'summarize'; ref: string }
  | { kind: 'thread'; threadId: string }            // needs a `resolve`-mode chat
  | { kind: 'reviewFeedback'; reviewId: string };   // needs a `resolve`-mode chat
interface StartChat { repoPath: string; agentId: string; mode: AgentMode; sessionId: string; title?: string; }
interface Chat { id: string; repoPath: string; agentId: string; mode: AgentMode; title: string; createdAt: string; updatedAt: string; }
type AgentEvent =                                   // serde tag = "type"
  | { type: 'text'; messageId: string; delta: string }
  | { type: 'thought'; delta: string }
  | { type: 'toolCall'; id: string; title: string; kind: string; status: string; locations: string[] }
  | { type: 'toolCallUpdate'; id: string; status: string; title?: string }
  | { type: 'plan'; entries: { content: string; status: string }[] }
  | { type: 'permissionRequest'; requestId: string; title: string; options: { id: string; name: string; kind: string }[];
      diff?: { path: string; oldText: string | null; newText: string } }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string };
interface ChatMessage { id: string; chatId: string; role: 'user' | 'agent'; content: AgentEvent[] | { text: string; context: ContextChip[] }; createdAt: string; }

interface GithubAuthStatus { authenticated: boolean; login: string | null; source: 'keychain' | 'gh' | null; deviceFlowAvailable: boolean; }
interface DeviceCode { userCode: string; verificationUri: string; deviceCode: string; interval: number; expiresIn: number; }
interface GitOpResult { ok: boolean; output: string; }
interface PullRequest { number: number; title: string; url: string; state: string; isDraft: boolean; author: string;
  baseRef: string; headRef: string; headSha: string; reviewDecision: string | null; checks: string | null; body: string; }
type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';
interface PushResult { pushed: number; skipped: number; failed: number; errors: string[]; }
interface PullResult { pulled: number; updated: number; skipped: number; }
```

## Tauri commands (name → signature). Stubs created by scaffold in `src-tauri/src/commands/*.rs`.

commands/repo.rs + diff.rs + files.rs + comments.rs — **core workstream**
```
open_repo(path) -> RepoInfo                     // also records in repos table
recent_repos() -> RecentRepo[]
watch_repo(repoPath) -> ()                      // emits repo-changed (debounced 250ms, ignores .git except HEAD/index/refs)
unwatch_repo(repoPath) -> ()
resolve_ref(repoPath, ref) -> ResolvedRef
get_diff(repoPath, ref, ignoreWhitespace: bool) -> DiffResult   // includes untracked for work/unstaged
get_file_versions(repoPath, ref, path, oldPath: Option) -> FileVersions
diff_fingerprint(repoPath, ref) -> string
list_commits(repoPath, count, skip, search: Option) -> Commit[]
list_branches(repoPath) -> Branch[]
git_status(repoPath) -> GitStatus
revert_file(repoPath, path) -> ()
revert_hunk(repoPath, patch) -> ()              // git apply --reverse --unidiff-zero, patch via stdin
open_in_editor(repoPath, path, line: Option, editor: Option) -> ()   // code/cursor/zed, fallback `open`
list_tree(repoPath) -> TreeEntry[]              // tracked + untracked-not-ignored; dirs derived
read_file(repoPath, path) -> FileContent        // text up to 2MB, binary flag otherwise
read_file_base64(repoPath, path) -> string      // for images
get_session(repoPath, ref) -> ReviewSession     // get-or-create
list_threads(sessionId) -> Thread[]
create_thread(input: NewThread) -> Thread
add_reply(threadId, body, authorType: Option, authorName: Option, pending: Option<bool>) -> Thread   // published user reply reopens
get_pending_review(sessionId) -> Option<Review>; start_review(sessionId) -> Review; get_review(reviewId) -> Review
list_reviews(sessionId) -> Review[]; submit_review(sessionId, body: Option, verdict: Option) -> Review; discard_review(sessionId) -> ()
edit_comment(commentId, body) -> ()
delete_comment(commentId) -> ()                 // deleting last comment deletes thread
delete_thread(threadId) -> ()
delete_all_threads(sessionId) -> ()
set_thread_status(threadId, status, summary: Option) -> Thread   // summary appended as agent comment
list_viewed(sessionId) -> {filePath, contentHash}[]
set_viewed(sessionId, filePath, contentHash, viewed: bool) -> ()
get_setting(key) -> Option<string>; set_setting(key, value) -> ()
```
All mutating comment commands emit `threads-changed`.

commands/agents.rs — **agents workstream**
```
list_agents() -> AgentInfo[]
start_chat(input: StartChat) -> Chat
list_chats(repoPath) -> Chat[]
get_chat_messages(chatId) -> ChatMessage[]
send_prompt(chatId, text, context: ContextChip[], action: AgentAction, onEvent: Channel<AgentEvent>) -> ()   // returns when turn ends
cancel_prompt(chatId) -> ()
respond_permission(requestId, optionId: Option<string>) -> ()    // None = cancelled/denied
delete_chat(chatId) -> ()
```

commands/github.rs — **github workstream**
```
github_auth_status() -> GithubAuthStatus
github_import_gh_token() -> GithubAuthStatus
github_set_token(token) -> GithubAuthStatus
github_device_start() -> DeviceCode
github_device_poll(deviceCode) -> GithubAuthStatus       // call repeatedly; error code "pending" while waiting
github_logout() -> ()
git_fetch(repoPath) -> GitOpResult
git_pull(repoPath) -> GitOpResult                         // --ff-only; refuse when dirty
git_push(repoPath) -> GitOpResult                         // sets upstream if missing
find_pr(repoPath) -> Option<PullRequest>                  // PR for current branch
list_prs(repoPath) -> PullRequest[]
checkout_pr(repoPath, urlOrNumber) -> PullRequest
push_review(repoPath, sessionId, prNumber, event: Option<ReviewEvent>, body: Option, threadIds: Option<string[]>, reviewId: Option) -> PushResult
pull_review(repoPath, sessionId, prNumber) -> PullResult
github_reply(threadId, body) -> Thread                    // local + GitHub for synced threads
github_set_resolved(threadId, resolved: bool) -> Thread
```

## MCP tool bridge

- `diffity-agents` runs a unix socket server at `<app_data_dir>/mcp.sock`. Each agent chat gets a random token bound to `{repoPath, sessionId, ref, mode}`.
- `session/new` passes `mcpServers: [{ name: "diffity", command: <path to diffity-mcp>, args: ["--socket", sock, "--token", token], env: [] }]`.
- `diffity-mcp` (rmcp, stdio) exposes tools and forwards each call as one NDJSON line `{"token","tool","args"}` → response `{"ok":true,"result":...}` or `{"ok":false,"error":"..."}`.
- Tools: `get_diff()`, `list_threads(status?)`, `add_comment(file, startLine, endLine?, side?, body, severity?)`, `add_general_comment(body)`, `reply(threadId, body)`, `resolve(threadId, summary?)`, `dismiss(threadId, reason?)`. Thread ids accept 8-char prefixes. `add_comment` validates the file is in the session diff and the line range exists on that side.
- Tool calls write via `diffity_core::Store` and the desktop emits `threads-changed` (agents crate exposes a callback hook `on_threads_changed(session_id)`).
- In `ask` / `review` modes the ACP client refuses `fs/write_text_file` and denies write/execute permission requests automatically. In `resolve` / `edit` modes, writes surface as `permissionRequest` with a diff.

## Frontend structure (`apps/desktop/src`)

```
main.tsx, App.tsx               router: "/" welcome, "/repo?path=..." workspace
lib/types.ts, lib/api.ts        typed invoke wrappers for every command above (scaffold)
lib/query.ts                    QueryClient, query keys
features/welcome/               recent repos, Open Folder, open PR URL
features/workspace/             WorkspaceLayout: toolbar (ref picker, view toggles, git sync slot), tabs Changes|Files|PR, right AgentPanel slot
features/changes/               diff page on @pierre/diffs CodeView, sidebar file list, threads in annotations, staleness
features/files/                 file tree + File viewer + comments, markdown/svg/mermaid/image preview
features/comments/              thread card, comment form, general comments, orphaned threads, navigation
features/agent/                 AgentPanel (chat, streaming, tool rows, permission cards, action buttons)  — agents-ui workstream
features/pr/                    PrTab, GitSyncButtons, GithubAuthDialog, PushReviewDialog               — agents-ui workstream
features/settings/              SettingsDialog (agents, github, editor, theme)                          — agents-ui workstream
components/ui/                  shared primitives (Button, IconButton, Dialog, Menu, Badge, Kbd)
```
Cross-feature hooks the core UI exposes for the agent UI:
- `useSelection()` store (zustand or React context in `features/workspace/selection.ts`): current `ContextChip | null`; ⌘L sends it to the AgentPanel.
- `useWorkspace()` → `{ repoPath, repo, ref, setRef, sessionId }`.
- `agentBus` (in `features/workspace/agent-bus.ts`): `askAboutSelection(chip)`, `runAction(action)`, used by diff/file UI buttons ("Ask AI", "Explain", "Resolve with AI").
  `thread` / `reviewFeedback` actions are queued (`features/agent/run-queue.ts`) and run one at a time in a `resolve` chat, never alongside another run. `useAgentThreadActivity(threadId)` → `'idle' | 'queued' | 'working'` and `useAgentBus(s => s.activeThreadIds)` expose progress to thread UI (review runs mark every `review.threadIds`).

Keyboard: j/k file, n/p hunk, u/s view, x / shift+x collapse, r viewed, / filter, ? help, ⌘L ask, ⌘O open, ⌘Enter submit, Esc cancel.

## Scaffold notes / TODO

- `diffity-mcp` is bundled as `bundle.externalBin: ["binaries/diffity-mcp"]` (see Integration notes).
- Router is `HashRouter`: extra windows (`repo-*` labels) load `index.html#/repo?path=<encoded>`.
- Rust command params named `ref` are written `r#ref` (tauri-macros unraws them, so JS key stays `ref`).
- `Store::conn()` returns a `MutexGuard<Connection>`; never hold it across `.await`.
- `AgentManager::on_threads_changed(hook)` is wired in `lib.rs` to emit `threads-changed`.

## Core API (for agents / github crates)

All functions are synchronous (wrap in `spawn_blocking` from async code) and return `diffity_core::Result<T>`.
Error codes: `not_a_repo`, `invalid_ref`, `not_found`, `git_failed`, `io`, `invalid`, `db`.

Diff / git (`diffity_core::{diff, git, tree}`):
- `diffity_core::diff_for_session(repo_path, ref, ignore_ws) -> DiffResult` (patch + files + fingerprint); `diff_for_session_id(&store, session_id)`; `diff_files(repo_path, ref)`.
- `diff::plan(repo, ref) -> DiffPlan { resolved, args, include_untracked, old: Source, new: Source }` — `Source::{Commit(sha), EmptyTree, Index, WorkTree}`.
- `diff::get_file_versions(repo, ref, path, old_path)`, `diff::side_line_count(repo, ref, path, old_path, Side) -> Option<u32>` (use to validate MCP `add_comment` line ranges).
- `git::run / run_bytes / run_opt / run_with_codes / run_with_stdin(repo, args)` (always `-c core.quotepath=off`), `git::find_repo_root`, `git::head_sha`, `git::current_branch`, `git::remote_url`, `git::status`.
- `ResolvedRef.baseSha` = old-side commit (null for empty tree); `headSha` = new-side commit, or current HEAD for working-tree refs. `a..b` and `a...b` both diff merge-base(a,b)..b and never include untracked files.

Store (`diffity_core::Store`, all `pub`, `&self`):
- Sessions: `get_or_create_session(repo_path, ref)`, `get_session_by_id(id)`.
- Threads: `list_threads(session_id, Option<ThreadStatus>)`, `get_thread(id)`, `find_thread_by_prefix(prefix, Option<session_id>)` (exact id or unique ≥8-char prefix; ambiguous → `invalid`),
  `create_thread(&NewThread)` (defaults author to user/"You"; swaps start/end if reversed),
  `add_reply(thread_id, body, AuthorType, Option<author_name>) -> Thread` (a **user** reply reopens resolved/dismissed threads),
  `set_thread_status(thread_id, status, Option<summary>)` (summary by Agent/"Agent") and `set_thread_status_as(thread_id, status, summary, AuthorType, Option<author_name>)`,
  `edit_comment(comment_id, body) -> session_id`, `delete_comment(comment_id) -> session_id` (last comment deletes thread), `delete_thread(id) -> session_id`, `delete_all_threads(session_id)`, `get_comment(id)`.
- GitHub: `update_thread_github_ids(thread_id, Option<github_thread_id>, Option<github_comment_id>)` (None keeps existing), `thread_github_comment_id(thread_id)`,
  `set_comment_github_id(comment_id, id)`, `find_thread_by_github_id(session_id, github_thread_id) -> Option<Thread>`, `find_comment_by_github_id(id) -> Option<Comment>`,
  `add_github_comment(thread_id, github_comment_id, author_name, body, Option<created_at>) -> UpsertOutcome::{Inserted, Updated, Unchanged}` (idempotent import).
- Misc: `touch_repo`, `recent_repos(limit)`, `list_viewed`, `set_viewed`, `get_setting`, `set_setting`, `delete_setting`. Helpers `store::{now, new_id, side_str, status_str, severity_str, author_str}`.
- Store methods do not emit events — callers emitting `threads-changed` is their job (desktop commands do; agents use `on_threads_changed`).

Watcher: `watch::WatcherRegistry` (held in a static in `commands/repo.rs`); `watch(path, Arc<dyn Fn(&str)>)` is idempotent, `unwatch(path)`.

## Agents implementation notes (agents workstream)

- **Only Claude Code is enabled** (`AgentKind::ENABLED`); Codex/Gemini launch code below is kept but unregistered — add them to `ENABLED` (and back to the UI) to re-enable.
- Launch (resolved in `diffity_agents::detect`, cached 30s): Claude → `claude-agent-acp` on PATH, else `npx -y @agentclientprotocol/claude-agent-acp@0.84.0`; Codex → `codex-acp` on PATH, else `npx -y @agentclientprotocol/codex-acp@2.0.0` with `CODEX_PATH=<installed codex>` (unless already set); Gemini → `gemini --acp` (`--experimental-acp` for old CLIs). Auth: `claude auth status --json` (`loggedIn`), `codex login status` (exit code), Gemini `null`.
- ACP client: `agent-client-protocol` 2.2.0 (protocol v1). One agent process per chat, started lazily on first `send_prompt`, reused for follow-ups, `session/load` on restart when the agent supports it. Killed on `delete_chat` and on app exit (`AgentManager::shutdown`, wired to `RunEvent::Exit`).
- Permission policy: `ask`/`review` auto-reject `edit|delete|move|execute` permission requests and refuse `fs/write_text_file`; `resolve`/`edit` forward everything, and `fs/write_text_file` asks with a diff unless the same path was just approved via `session/request_permission`. Diffity's own MCP tools are auto-approved (the bridge enforces mode).
- Extra table owned by agents: `agent_chat_sessions(chat_id PK → chats.id, session_id)` binds a chat to its review session (created by `AgentManager::new`).
- Bridge extras: pseudo-tool `__list_tools` returns the tool names allowed for the token's mode (the stdio server filters `tools/list` with it). `add_comment` accepts any line that exists on the chosen side (anchor filled when inside a hunk); `startLine: 0` = file-level comment.
- `diffity-mcp` uses `rmcp` 3.5 and must set `ttlMs`/`cacheScope` on `tools/list` (Claude Code negotiates MCP `2026-07-28`).

## Reviews & mentions

GitHub-style pending reviews plus `@claude` mentions.

- **Pending review.** `create_thread({ ..., pending: true })` / `add_reply(..., pending: true)` put a user comment in the session's pending review (get-or-created; at most one per session, enforced by a unique partial index). A thread is pending iff its first comment is pending (`Thread.pending`); replies to a pending thread are always pending; only user comments can be pending. Pending comments can be edited/deleted with the normal commands. `start_review` creates the empty pending review explicitly (optional).
- **Submit.** `submit_review(sessionId, body, verdict)` publishes every pending comment (re-stamped `createdAt` = submit time so ordering reflects publication), reopens resolved/dismissed threads that received a review reply, and stamps the review `submitted`. Without a pending review it still submits a body-only review when the body is non-empty or the verdict is not `comment` (else `invalid`). `discard_review` deletes the pending review, its draft threads and draft replies.
- **Review fields.** `pendingCount`, `commentCount`, `threadIds` (threads the review started or replied to, in order), `mentionedThreadIds` (threads with a user review comment mentioning `@claude`), `bodyMentionsAgent`.
- **Visibility.** The MCP bridge hides pending threads and strips pending comments (`tools::visible`); `find`/`reply`/`resolve` on a pending thread → `not_found`. GitHub push never selects pending threads/comments.
- **Mentions.** `diffity_core::mentions::mentions_agent` (re-exported as `diffity_agents::mentions`, TS mirror `lib/mentions.ts`): case-insensitive `@claude`, whole word (not `bob@claude.ai`, `@claude_bot`, `@claude-code`, `@claude/sdk`), ignored inside inline code and fenced blocks. `Comment.mentionsAgent` is computed on load for user-authored comments only.
- **Frontend triggers.** Single comment / published reply: if the returned thread's newest comment has `mentionsAgent`, run `{ kind: 'thread', threadId }`. Submit: if the user picked "Send to Claude", run `{ kind: 'reviewFeedback', reviewId }`; otherwise run `{ kind: 'thread' }` for each of `review.mentionedThreadIds` (and consider `reviewFeedback` when `bodyMentionsAgent`). Post to GitHub with `pushReview(..., event: null, body: null, threadIds: null, reviewId)` (`api.pushSubmittedReview`).
- **Agent actions.** `thread` (`prompts/thread.md`): read that thread + code; questions → `reply` (no edits, thread stays open); change requests → edit (per-write approval) then `resolve` with a summary; unclear → clarifying `reply`. `reviewFeedback` (`prompts/review-feedback.md`): the prompt lists the review's thread ids, verdict and summary body; the agent handles them in order, skips resolved/dismissed, same rules per thread, and acts on the summary. Both require a chat started with `mode: 'resolve'` (`send_prompt` returns `invalid` otherwise) so the bridge token allows `reply`/`resolve` and writes go through the permission broker. The chat is bound to the thread's / review's session (rejecting pending threads and unsubmitted reviews). Agent replies are `agent`-authored ("Claude Code") and never reopen or alter pending state; a published **user** reply (e.g. a follow-up `@claude`) reopens a resolved thread.
- **GitHub push of a review.** `push_review(..., reviewId)` requires a submitted review; it sends the threads the review started (any status, unsynced, `review::select_review`), posts review replies on already-linked threads via `addPullRequestReviewThreadReply`, and defaults `body`/`event` to the review's body/verdict (`comment→COMMENT`, `approve→APPROVE`, `requestChanges→REQUEST_CHANGES`). The `threadIds` / session paths are unchanged apart from skipping pending threads/comments.
- **Migration.** `user_version` 1 → 2 in one transaction: create `reviews` (+ indexes), `ALTER TABLE` add `threads.review_id`, `comments.pending`, `comments.review_id`. Fresh DBs run v1 schema then v2.
- **Smoke.** `cargo run -p diffity-agents --example smoke -- claude - thread` leaves a `@claude` question on the scratch repo and runs the `thread` action.

## Integration notes

- **MCP sidecar.** `apps/desktop/scripts/prepare-mcp.mjs` runs from `beforeDevCommand`/`beforeBuildCommand`: it builds `diffity-mcp` (release when `TAURI_ENV_DEBUG=false`) and copies it to `src-tauri/binaries/diffity-mcp-<target-triple>` (gitignored). Tauri copies the sidecar next to the main executable (`target/<profile>/diffity-mcp` in dev, `Diffity.app/Contents/MacOS/diffity-mcp` bundled); `lib.rs::mcp_binary_path()` resolves it there, falling back to `PATH`. `src-tauri/build.rs` keeps plain `cargo build`/`cargo test` working: it copies an already-built `target/<profile>/diffity-mcp` into `binaries/` or writes a placeholder script that exits with an error.
- **Custom agent path.** `agent.<id>.path` (Settings → Claude Code → custom binary path) is read by `AgentManager` on every detection (cache is keyed by the configured paths; `list_agents(refresh: true)` bypasses the 30s cache). A path whose file name starts with `claude-agent-acp` is launched directly as the ACP adapter; any other path is treated as the `claude` CLI: used for the auth probe and passed to the adapter as `CLAUDE_CODE_EXECUTABLE`.
- **Prompts** tell agents to use only `mcp__diffity__*` tools and never a `diffity` CLI or the old diffity skills (users may have them installed globally). A unit test enforces this for every template.
- **PR comments across sessions.** Users usually comment in `work` (or a branch/commit ref) while the PR tab uses the PR session `origin/<base>...HEAD`.
  - *Push:* `github_pushable_threads(repoPath, prNumber)` returns open, unsynced threads from **all** of the repo's sessions whose file is in the PR (general comments included) and whose commented side is anchored like GitHub's PR diff: new side ⇒ the session's new side is local `HEAD` (`work`, `staged`, `HEAD`, the PR ref, the file browser), old side ⇒ the session's base is the PR merge-base (in practice only the PR session). PR-session threads are listed first; others get an "other view" badge. `push_review(..., threadIds)` accepts ids from any session of the repo (with `threadIds: null` it pushes the given session only, as before). Threads stay in their original session and gain GitHub ids there.
  - *Pull:* `pull_review` matches remote threads against GitHub-linked threads in **any** session of the repo (so threads pushed from `work` update in place); new remote threads are created in the PR session, and the PR tab switches the ref picker to the PR ref so the Changes view shows them. Both commands emit `threads-changed` for every session of the repo.
- **Dev helpers** (debug builds only): `DIFFITY_OPEN=<repo path>` (+ optional `DIFFITY_TAB=changes|files|pr`) opens that repo in the main window on launch (`dev_launch_target` command, `lib/dev.ts`). Webview `console.error`/`console.warn`, uncaught errors and unhandled rejections are forwarded to the terminal through `log_frontend` (tracing target `webview`). Default log level is `info` in dev; override with `RUST_LOG`.
- `?pr=<url|number>` on `/repo` (from the welcome page) opens the PR tab, which checks the PR out once GitHub auth is available. The initial tab is latched on mount so stripping `?pr=` doesn't bounce back to Changes.
- "Explain" from a line selection sends the selection (path, side, range, snippet) as a context chip; `prompts/explain.md` focuses the explanation on that range.

Launch the app: `pnpm install && pnpm -C apps/desktop tauri dev` (optionally `DIFFITY_OPEN=/path/to/repo`). Bundle: `pnpm -C apps/desktop tauri build --debug --bundles app`.
