export type Side = 'old' | 'new';
export type ThreadStatus = 'open' | 'resolved' | 'dismissed';
export type Severity = 'must-fix' | 'suggestion' | 'nit' | 'question';
export type AuthorType = 'user' | 'agent' | 'github';

export const GENERAL_FILE_PATH = '__general__';
export const TREE_REF = '__tree__';

export interface AppError {
  code: string;
  message: string;
}

export interface RepoInfo {
  path: string;
  name: string;
  isGit: boolean;
  branch: string | null;
  headSha: string | null;
  remoteUrl: string | null;
}

export interface RecentRepo {
  path: string;
  name: string;
  lastOpenedAt: string;
}

export interface ResolvedRef {
  ref: string;
  label: string;
  canRevert: boolean;
  canEdit: boolean;
  baseSha: string | null;
  headSha: string | null;
}

export type FileStatus = 'added' | 'deleted' | 'modified' | 'renamed' | 'copied' | 'untracked';

export interface DiffFileSummary {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  oldLineCount?: number | null;
  /** The patch was too large to send with the diff; fetch it with `get_file_patch`. */
  patchOmitted?: boolean;
}

export interface OverviewFile {
  path: string;
  status: 'staged' | 'modified' | 'added';
}

export interface DiffResult {
  resolved: ResolvedRef;
  files: DiffFileSummary[];
  patch: string;
  fingerprint: string;
  /** Changed files hidden by `.diffityignore` or the repo's local ignore list. */
  hiddenFiles?: string[];
}

export interface FileVersions {
  oldContents: string | null;
  newContents: string | null;
}

export interface Commit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  authorEmail: string;
  date: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

export interface Branch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface Worktree {
  path: string;
  branch: string | null;
  head: string | null;
  isMain: boolean;
  isCurrent: boolean;
}

export type TaskState = 'settingUp' | 'working' | 'ready' | 'idle' | 'failed';

/** An agent working on its own branch in a worktree Diffity created; each run ends in a commit (a round). */
export interface Task {
  id: string;
  /** The repository's main checkout. */
  repoPath: string;
  /** The task's worktree folder. */
  path: string;
  branch: string;
  baseRef: string;
  baseSha: string;
  title: string;
  prompt: string;
  agentId: string;
  state: TaskState;
  owned: boolean;
  prNumber: number | null;
  prUrl: string | null;
  /** Merged locally or its pull request was merged. */
  mergedAt: string | null;
  rounds: number;
  lastRoundSha: string | null;
  /** The newest round reviewed before the agent started again; "since last review" diffs from its commit. */
  reviewedRound: number;
  reviewedSha: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  /** The folder was deleted outside Diffity; restoring recreates it from the branch. */
  missing: boolean;
}

export interface NewTask {
  repoPath: string;
  title: string;
  prompt: string;
  agentId: string;
  baseRef: string;
  branch?: string | null;
}

export interface TaskConfig {
  copy: string[];
  setup: string | null;
  archive: string | null;
  suggestedSetup: string | null;
  fromFile: boolean;
}

export interface TaskBaseStatus {
  ahead: number;
  behind: number;
  dirty: boolean;
  merging: boolean;
}

export interface TaskStorage {
  root: string;
  tasks: { taskId: string; bytes: number }[];
}

export interface TaskRound {
  round: number;
  commitSha: string;
}

export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  dirty: boolean;
}

export interface TreeEntry {
  path: string;
  kind: 'file' | 'dir';
  /** Hidden from diffs by `.diffityignore`. */
  diffIgnored?: boolean;
}

export interface SearchOptions {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Searches only these paths (the files of a diff). */
  paths?: string[] | null;
}

export interface SearchMatch {
  line: number;
  /** The line, or a window of it around the first match when it is long. */
  text: string;
  /** `[start, end)` offsets of each match in `text`. */
  ranges: [number, number][];
}

export interface SearchFile {
  path: string;
  matches: SearchMatch[];
  diffIgnored?: boolean;
}

export interface SearchResult {
  files: SearchFile[];
  total: number;
  truncated: boolean;
  cancelled: boolean;
}

export interface FileContent {
  path: string;
  contents: string | null;
  binary: boolean;
  size: number;
}

export interface ReviewSession {
  id: string;
  repoPath: string;
  ref: string;
}

export interface Comment {
  id: string;
  threadId: string;
  authorType: AuthorType;
  authorName: string;
  body: string;
  createdAt: string;
  githubCommentId: number | null;
  /** Draft in a pending review; hidden from agents and GitHub until the review is submitted. */
  pending: boolean;
  reviewId: string | null;
  /** User-authored comment that mentions `@claude` outside code. */
  mentionsAgent: boolean;
}

export interface Thread {
  id: string;
  sessionId: string;
  filePath: string;
  side: Side;
  startLine: number;
  endLine: number;
  status: ThreadStatus;
  severity: Severity | null;
  anchorContent: string | null;
  githubThreadId: string | null;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
  /** True while the first comment is a draft in the session's pending review. */
  pending: boolean;
  /** Review the thread was started in, if any. */
  reviewId: string | null;
  /** The view the thread was left in (`main`, `main...HEAD`, …); its line numbers belong to that view's diff. */
  viewRef: string | null;
  promotedFrom?: string | null;
  /** The agent that addressed this reviewer's thread; it stays open until the reviewer resolves it. */
  addressedBy?: string | null;
}

/** A deleted thread as it was, for Undo. */
export interface ThreadSnapshot {
  thread: Thread;
  githubCommentId: number | null;
}

export interface NewThread {
  sessionId: string;
  filePath: string;
  side: Side;
  startLine: number;
  endLine: number;
  body: string;
  severity?: Severity | null;
  anchorContent?: string | null;
  authorType?: AuthorType;
  authorName?: string;
  /** Add to the session's pending review (created on demand) instead of publishing. */
  pending?: boolean;
  /** The view the thread is left in; defaults to the session's ref. */
  viewRef?: string | null;
  /** The agent's comment this draft is made from; one draft per comment. */
  promotedFrom?: string | null;
}

export type ReviewState = 'pending' | 'submitted';
export type ReviewVerdict = 'comment' | 'approve' | 'requestChanges';

export interface Review {
  id: string;
  sessionId: string;
  state: ReviewState;
  body: string;
  verdict: ReviewVerdict | null;
  /** Draft comments waiting for submit (0 once submitted). */
  pendingCount: number;
  /** All comments (new threads + replies) in the review. */
  commentCount: number;
  /** Threads the review started or replied to, in order. */
  threadIds: string[];
  /** Threads with a user review comment mentioning `@claude`. */
  mentionedThreadIds: string[];
  bodyMentionsAgent: boolean;
  createdAt: string;
  submittedAt: string | null;
}

/** How much of the reviewer's attention a guide chapter needs: high is the core logic, low is what to skim. */
export type GuideAttention = 'high' | 'normal' | 'low';

/** An explanation pinned to a file, or to one line of it (`line` set), shown in the diff where the code is. */
export interface GuideNote {
  path: string;
  line?: number;
  side: Side;
  /** Markdown. */
  text: string;
  /** Take extra care here: security, data loss, hard to revert. */
  critical: boolean;
}

/** Code outside the diff that depends on what a chapter changes and may behave differently now. */
export interface GuideImpact {
  /** e.g. `loadSettings()` or `GET /api/session`. */
  site: string;
  /** Outside the diff. */
  path: string;
  line?: number;
  /** Markdown. */
  text: string;
}

export interface GuideChapter {
  title: string;
  /** Markdown. */
  summary: string;
  /** Short facts that make the files easier to read; missing in guides written before it existed. */
  points?: string[];
  /** What to check while reading. */
  focus: string[];
  attention: GuideAttention;
  /** The stage of the change the chapter belongs to; neighbouring chapters share it. */
  phase?: string;
  /** Most important first. */
  files: string[];
  notes: GuideNote[];
  /** Missing in older guides. */
  impact?: GuideImpact[];
}

/** One step of the diagram's walkthrough. */
export interface GuideFlowStep {
  /** A node id of the diagram. */
  node: string;
  /** Markdown. */
  text: string;
}

/** A reading guide an agent wrote for a review session's diff. */
export interface Guide {
  sessionId: string;
  ref: string;
  /** Fingerprint of the diff the guide was written for. */
  fingerprint: string;
  agentName: string;
  createdAt: string;
  /** Markdown. */
  summary: string;
  before?: string;
  after?: string;
  /** Mermaid flowchart; nodes are marked `:::added`, `:::changed` or `:::removed`, and may carry `%% ref node:<id> [[path#L12]]` / `%% ref edge:<a>-><b> [[…]]` links. */
  diagram?: string;
  /** The diagram's nodes in the order they run, for stepping through it. */
  flow?: GuideFlowStep[];
  chapters: GuideChapter[];
}

export interface ViewedFile {
  filePath: string;
  contentHash: string;
  /** Git blob of the file as viewed; null when no snapshot was kept (binary, huge or marked before snapshots). */
  blobId?: string | null;
}

export type AgentMode = 'ask' | 'review' | 'resolve' | 'edit' | 'task';

export interface AgentInfo {
  id: string;
  name: string;
  installed: boolean;
  binaryPath: string | null;
  authenticated: boolean | null;
  note: string | null;
}

/** Model and thinking effort for one Claude run; unset keeps Claude Code's own setting. */
export interface RunModel {
  model?: string;
  effort?: string;
}

export interface ConfigChoice {
  value: string;
  name: string;
  description?: string;
}

export interface ModelChoice extends ConfigChoice {
  efforts: ConfigChoice[];
}

/** The models Claude Code offers, as it reported them. */
export interface ModelCatalog {
  models: ModelChoice[];
  currentModel?: string;
  fetchedAt: string;
}

export interface ContextChip {
  filePath: string;
  side?: Side;
  startLine?: number;
  endLine?: number;
  snippet?: string;
}

export type AgentAction =
  | { kind: 'chat' }
  | { kind: 'review'; ref: string; focus?: string; instructions?: string; paths?: string[] }
  | { kind: 'resolve'; threadId?: string; threadIds?: string[]; note?: string }
  | { kind: 'explain'; path: string }
  | { kind: 'summarize'; ref: string }
  /** Write a reading guide for a diff. */
  | { kind: 'guide'; ref: string; title?: string; description?: string }
  /** Address one thread (e.g. after an `@claude` mention). Requires a chat in `resolve` mode. */
  | { kind: 'thread'; threadId: string }
  /** Address every thread of a submitted review + its summary. Requires a chat in `resolve` mode. */
  | { kind: 'reviewFeedback'; reviewId: string };

export interface StartChat {
  repoPath: string;
  agentId: string;
  mode: AgentMode;
  sessionId: string;
  title?: string;
}

export interface Chat {
  id: string;
  repoPath: string;
  agentId: string;
  mode: AgentMode;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEntry {
  content: string;
  status: string;
}

export interface PermissionOption {
  id: string;
  name: string;
  kind: string;
}

export interface PermissionDiff {
  path: string;
  oldText: string | null;
  newText: string;
}

export type AgentEvent =
  | { type: 'text'; messageId: string; delta: string }
  | { type: 'thought'; delta: string }
  | { type: 'toolCall'; id: string; title: string; kind: string; status: string; locations: string[] }
  | { type: 'toolCallUpdate'; id: string; status: string; title?: string }
  | { type: 'plan'; entries: PlanEntry[] }
  | { type: 'permissionRequest'; requestId: string; title: string; options: PermissionOption[]; diff?: PermissionDiff }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; code?: string; message: string };

export interface UserMessageContent {
  text: string;
  context: ContextChip[];
  /** Model and effort the turn ran with; absent on chats saved before it was recorded. */
  model?: RunModel;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'agent';
  content: AgentEvent[] | UserMessageContent;
  createdAt: string;
}

export interface GithubAuthStatus {
  authenticated: boolean;
  login: string | null;
  source: 'keychain' | 'gh' | null;
  deviceFlowAvailable: boolean;
}

export interface DeviceCode {
  userCode: string;
  verificationUri: string;
  deviceCode: string;
  interval: number;
  expiresIn: number;
}

export interface GitOpResult {
  ok: boolean;
  output: string;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  author: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  reviewDecision: string | null;
  checks: string | null;
  body: string;
  createdAt: string;
  reviewThreadCount: number;
  updatedAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  headRepo: string | null;
  isCrossRepository: boolean;
  /** The local remote for the PR's base repository (`upstream` in a fork setup); missing outside a clone. */
  baseRemote?: string | null;
}

export interface InboxPullRequest extends PullRequest {
  /** `owner/name` of the base repository. */
  repo: string;
  commentCount: number;
  checkCount: number;
}

/** Open PRs that involve you; a PR can appear in more than one list. */
export interface PrInbox {
  reviewDirect: InboxPullRequest[];
  reviewRequested: InboxPullRequest[];
  assigned: InboxPullRequest[];
  authored: InboxPullRequest[];
}

export interface StashResult {
  sha: string | null;
  message: string;
}

export type ReviewEvent = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES';

export interface PushResult {
  pushed: number;
  skipped: number;
  failed: number;
  errors: string[];
  postedThreadIds?: string[];
  reviewUrl?: string | null;
  /** Debug builds with DIFFITY_GITHUB_DRY_RUN=1: nothing was sent. */
  dryRun?: boolean;
  dryRunMutations?: unknown[];
}

/** One of your comments that could go into a GitHub review of the checked-out PR. */
export interface ReviewCandidate {
  thread: Thread;
  sessionRef: string;
  /** Still a draft in a pending review. */
  draft: boolean;
  /** Why it can't be posted, or null when it can. */
  blockedReason: string | null;
}

export interface GithubPendingReview {
  id: string;
  commentCount: number;
  url: string | null;
}

export interface ReviewCandidates {
  candidates: ReviewCandidate[];
  blocker: string | null;
  githubPending: GithubPendingReview | null;
  prUrl: string;
}

/** What to do with a review you already have pending on GitHub. */
export type GithubPendingAction = 'addToExisting' | 'discard';

export interface PullResult {
  pulled: number;
  updated: number;
  skipped: number;
}

export interface RepoChangedPayload {
  repoPath: string;
}

export type ThreadAnchor = 'current' | 'outdated' | 'fileGone' | 'viewEmpty' | 'unknown';

export interface CommitPointer {
  ref: string;
  sha: string;
  shortSha: string;
  subject: string;
}

/** A thread of any view of the repo (`list_repo_threads`), with where it lives and whether it is still anchored. */
/** What Diffity keeps locally for one project (Settings → Data). */
export interface ProjectData {
  repoPath: string;
  name: string;
  comments: number;
  chats: number;
  reviews: number;
}

export interface RepoThread {
  id: string;
  sessionId: string;
  ref: string;
  refLabel: string;
  filePath: string;
  side: Side;
  startLine: number;
  endLine: number;
  status: ThreadStatus;
  severity: Severity | null;
  anchorContent: string | null;
  authorType: AuthorType;
  authorName: string;
  excerpt: string;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  pending: boolean;
  anchor: ThreadAnchor;
  movedTo: CommitPointer | null;
  addressedBy?: string | null;
  /** Branch a PR or branch view's thread was left on, when another branch is checked out now. */
  otherBranch?: string;
  /** Left on uncommitted changes before those were kept per branch, so which branch it belongs to is unknown. */
  unassigned?: boolean;
}

export interface ThreadsChangedPayload {
  sessionId: string;
}

/** A `diffity://open` link from the `diffity` command or an agent. */
export interface OpenRequest {
  path: string | null;
  view: 'diff' | 'files' | null;
  ref: string | null;
  file: string | null;
  pr: string | null;
  newWindow: boolean;
}

export type TerminalAgent = 'claude' | 'codex';

export interface TerminalStatus {
  allowed: boolean;
  /** `diffity`, or `diffity-dev` for the dev build. */
  serverName: string;
  /** The command a terminal agent runs, then its arguments. */
  command: string[];
  agents: { agent: TerminalAgent; found: boolean; connected: boolean }[];
  cli: { name: string; path: string; installed: boolean; broken: boolean };
}
