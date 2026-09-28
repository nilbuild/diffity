# Diffity App — Architecture & Contracts

Desktop code-review app. Tauri v2 + Rust backend + React (Vite) frontend using `@pierre/diffs`.
Scope v1: diffs, comments, file browsing, agents (ACP), GitHub (git sync + PR review comments). No CLI, no tours, no learn.
Reference implementation of the old product (read for behaviour, do not copy blindly): `~/Vibecode/diffity`
(`packages/git/src/*.ts` for ref resolution, `packages/github/src/*.ts`, `packages/cli/src/{threads,db,server}.ts`, `skills/*/SKILL.md` for review/resolve prompts).

Defaults chosen: data in app data dir; macOS first; agents = Claude Code, Codex, Gemini via ACP; GitHub auth = import `gh auth token`, paste PAT, or OAuth device flow when `DIFFITY_GITHUB_CLIENT_ID` is set.

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
        github_thread_id TEXT NULL, github_comment_id INTEGER NULL, created_at TEXT, updated_at TEXT)
comments(id TEXT PK, thread_id TEXT FK ON DELETE CASCADE, author_type TEXT, author_name TEXT,
         body TEXT, github_comment_id INTEGER NULL, created_at TEXT)
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
interface Comment { id: string; threadId: string; authorType: AuthorType; authorName: string; body: string; createdAt: string; githubCommentId: number | null; }
interface Thread { id: string; sessionId: string; filePath: string; side: Side; startLine: number; endLine: number;
  status: ThreadStatus; severity: Severity | null; anchorContent: string | null; githubThreadId: string | null;
  comments: Comment[]; createdAt: string; updatedAt: string; }
interface NewThread { sessionId: string; filePath: string; side: Side; startLine: number; endLine: number; body: string;
  severity?: Severity | null; anchorContent?: string | null; authorType?: AuthorType; authorName?: string; }

type AgentMode = 'ask' | 'review' | 'resolve' | 'edit';
interface AgentInfo { id: string; name: string; installed: boolean; binaryPath: string | null; authenticated: boolean | null; note: string | null; }
interface ContextChip { filePath: string; side?: Side; startLine?: number; endLine?: number; snippet?: string; }
type AgentAction =
  | { kind: 'chat' }
  | { kind: 'review'; ref: string; focus?: string }
  | { kind: 'resolve'; threadId?: string }
  | { kind: 'explain'; path: string }
  | { kind: 'summarize'; ref: string };
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
add_reply(threadId, body, authorType: Option, authorName: Option) -> Thread   // replying to resolved reopens
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
push_review(repoPath, sessionId, prNumber, event: ReviewEvent, body: Option, threadIds: Option<string[]>) -> PushResult
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

Keyboard: j/k file, n/p hunk, u/s view, x / shift+x collapse, r viewed, / filter, ? help, ⌘L ask, ⌘O open, ⌘Enter submit, Esc cancel.

## Scaffold notes / TODO

- TODO: add `bundle.externalBin: ["binaries/diffity-mcp"]` in `src-tauri/tauri.conf.json` (target-triple suffixed copy of the `diffity-mcp` binary) and resolve it in `lib.rs::mcp_binary_path()`. Dev currently resolves `diffity-mcp` next to the desktop exe (`target/debug/`), so run `cargo build -p diffity-mcp` first.
- Router is `HashRouter`: extra windows (`repo-*` labels) load `index.html#/repo?path=<encoded>`.
- Rust command params named `ref` are written `r#ref` (tauri-macros unraws them, so JS key stays `ref`).
- `Store::conn()` returns a `MutexGuard<Connection>`; never hold it across `.await`.
- `AgentManager::on_threads_changed(hook)` is wired in `lib.rs` to emit `threads-changed`.
