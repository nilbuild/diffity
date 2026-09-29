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

export interface ViewedFile {
  filePath: string;
  contentHash: string;
}

export type AgentMode = 'ask' | 'review' | 'resolve' | 'edit';

export interface AgentInfo {
  id: string;
  name: string;
  installed: boolean;
  binaryPath: string | null;
  authenticated: boolean | null;
  note: string | null;
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
  | { type: 'error'; message: string };

export interface UserMessageContent {
  text: string;
  context: ContextChip[];
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
}

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
}

export interface ThreadsChangedPayload {
  sessionId: string;
}
