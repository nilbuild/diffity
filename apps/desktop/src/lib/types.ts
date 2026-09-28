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
  | { kind: 'review'; ref: string; focus?: string }
  | { kind: 'resolve'; threadId?: string }
  | { kind: 'explain'; path: string }
  | { kind: 'summarize'; ref: string };

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

export interface ThreadsChangedPayload {
  sessionId: string;
}
