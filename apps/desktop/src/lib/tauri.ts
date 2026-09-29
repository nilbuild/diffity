import { Channel, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  AgentAction,
  AgentEvent,
  AgentInfo,
  AppError,
  AuthorType,
  Branch,
  Chat,
  ChatMessage,
  Commit,
  ContextChip,
  DeviceCode,
  DiffResult,
  FileContent,
  FileVersions,
  GitOpResult,
  GitStatus,
  GithubAuthStatus,
  NewThread,
  OverviewFile,
  PullRequest,
  PullResult,
  PushResult,
  RecentRepo,
  RepoChangedPayload,
  RepoInfo,
  RepoThread,
  ResolvedRef,
  Review,
  ReviewEvent,
  ReviewSession,
  ReviewVerdict,
  StartChat,
  Thread,
  ThreadStatus,
  ThreadsChangedPayload,
  TreeEntry,
  ViewedFile,
} from './types';

export type CommitRecord = Commit;

export function isAppError(value: unknown): value is AppError {
  return typeof value === 'object' && value !== null && 'code' in value && 'message' in value;
}

export function errorMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// repo
export const openRepo = (path: string) => invoke<RepoInfo>('open_repo', { path });
export const recentRepos = () => invoke<RecentRepo[]>('recent_repos');
export const watchRepo = (repoPath: string) => invoke<void>('watch_repo', { repoPath });
export const unwatchRepo = (repoPath: string) => invoke<void>('unwatch_repo', { repoPath });
export const listCommits = (repoPath: string, count: number, skip: number, search?: string | null) =>
  invoke<Commit[]>('list_commits', { repoPath, count, skip, search: search ?? null });
export const listBranches = (repoPath: string) => invoke<Branch[]>('list_branches', { repoPath });
export const gitStatus = (repoPath: string) => invoke<GitStatus>('git_status', { repoPath });
export const repoOverview = (repoPath: string) => invoke<OverviewFile[]>('repo_overview', { repoPath });
export const openInEditor = (repoPath: string, path: string, line?: number | null, editor?: string | null) =>
  invoke<void>('open_in_editor', { repoPath, path, line: line ?? null, editor: editor ?? null });
export const getSetting = (key: string) => invoke<string | null>('get_setting', { key });
export const setSetting = (key: string, value: string) => invoke<void>('set_setting', { key, value });

// diff
export const resolveRef = (repoPath: string, ref: string) => invoke<ResolvedRef>('resolve_ref', { repoPath, ref });
export const getDiff = (repoPath: string, ref: string, ignoreWhitespace: boolean) =>
  invoke<DiffResult>('get_diff', { repoPath, ref, ignoreWhitespace });
export const getFileVersions = (repoPath: string, ref: string, path: string, oldPath?: string | null) =>
  invoke<FileVersions>('get_file_versions', { repoPath, ref, path, oldPath: oldPath ?? null });
export const diffFingerprint = (repoPath: string, ref: string) =>
  invoke<string>('diff_fingerprint', { repoPath, ref });
export const revertFile = (repoPath: string, path: string) => invoke<void>('revert_file', { repoPath, path });
export const revertHunk = (repoPath: string, patch: string) => invoke<void>('revert_hunk', { repoPath, patch });

// files
export const listTree = (repoPath: string) => invoke<TreeEntry[]>('list_tree', { repoPath });
export const readFile = (repoPath: string, path: string) => invoke<FileContent>('read_file', { repoPath, path });
export const readFileBase64 = (repoPath: string, path: string) =>
  invoke<string>('read_file_base64', { repoPath, path });

// comments
export const getSession = (repoPath: string, ref: string) => invoke<ReviewSession>('get_session', { repoPath, ref });
export const listThreads = (sessionId: string) => invoke<Thread[]>('list_threads', { sessionId });
export const listRepoThreads = (repoPath: string) => invoke<RepoThread[]>('list_repo_threads', { repoPath });
export const createThread = (input: NewThread) => invoke<Thread>('create_thread', { input });
export const addReply = (
  threadId: string,
  body: string,
  authorType?: AuthorType | null,
  authorName?: string | null,
  pending?: boolean,
) =>
  invoke<Thread>('add_reply', {
    threadId,
    body,
    authorType: authorType ?? null,
    authorName: authorName ?? null,
    pending: pending ?? null,
  });
export const editComment = (commentId: string, body: string) => invoke<void>('edit_comment', { commentId, body });
export const deleteComment = (commentId: string) => invoke<void>('delete_comment', { commentId });
export const deleteThread = (threadId: string) => invoke<void>('delete_thread', { threadId });
export const deleteAllThreads = (sessionId: string) => invoke<void>('delete_all_threads', { sessionId });
export const setThreadStatus = (threadId: string, status: ThreadStatus, summary?: string | null) =>
  invoke<Thread>('set_thread_status', { threadId, status, summary: summary ?? null });
export const getPendingReview = (sessionId: string) => invoke<Review | null>('get_pending_review', { sessionId });
export const startReview = (sessionId: string) => invoke<Review>('start_review', { sessionId });
export const getReview = (reviewId: string) => invoke<Review>('get_review', { reviewId });
export const listReviews = (sessionId: string) => invoke<Review[]>('list_reviews', { sessionId });
/** Publishes all pending comments. Use the returned `mentionedThreadIds` / `threadIds` to trigger the agent. */
export const submitReview = (sessionId: string, body?: string | null, verdict?: ReviewVerdict | null) =>
  invoke<Review>('submit_review', { sessionId, body: body ?? null, verdict: verdict ?? null });
export const discardReview = (sessionId: string) => invoke<void>('discard_review', { sessionId });
export const listViewed = (sessionId: string) => invoke<ViewedFile[]>('list_viewed', { sessionId });
export const setViewed = (sessionId: string, filePath: string, contentHash: string, viewed: boolean) =>
  invoke<void>('set_viewed', { sessionId, filePath, contentHash, viewed });

// agents
export const listAgents = (refresh?: boolean) => invoke<AgentInfo[]>('list_agents', { refresh: refresh ?? null });
export const startChat = (input: StartChat) => invoke<Chat>('start_chat', { input });
export const listChats = (repoPath: string) => invoke<Chat[]>('list_chats', { repoPath });
export const getChatMessages = (chatId: string) => invoke<ChatMessage[]>('get_chat_messages', { chatId });
export function sendPrompt(
  chatId: string,
  text: string,
  context: ContextChip[],
  action: AgentAction,
  onEvent: (event: AgentEvent) => void,
) {
  const channel = new Channel<AgentEvent>();
  channel.onmessage = onEvent;
  return invoke<void>('send_prompt', { chatId, text, context, action, onEvent: channel });
}
export const cancelPrompt = (chatId: string) => invoke<void>('cancel_prompt', { chatId });
export const respondPermission = (requestId: string, optionId: string | null) =>
  invoke<void>('respond_permission', { requestId, optionId });
export const deleteChat = (chatId: string) => invoke<void>('delete_chat', { chatId });

// github
export const githubAuthStatus = () => invoke<GithubAuthStatus>('github_auth_status');
export const githubImportGhToken = () => invoke<GithubAuthStatus>('github_import_gh_token');
export const githubSetToken = (token: string) => invoke<GithubAuthStatus>('github_set_token', { token });
export const githubDeviceStart = () => invoke<DeviceCode>('github_device_start');
export const githubDevicePoll = (deviceCode: string) =>
  invoke<GithubAuthStatus>('github_device_poll', { deviceCode });
export const githubLogout = () => invoke<void>('github_logout');
export const gitFetch = (repoPath: string) => invoke<GitOpResult>('git_fetch', { repoPath });
export const gitPull = (repoPath: string) => invoke<GitOpResult>('git_pull', { repoPath });
export const gitPush = (repoPath: string) => invoke<GitOpResult>('git_push', { repoPath });
export const findPr = (repoPath: string) => invoke<PullRequest | null>('find_pr', { repoPath });
export const listPrs = (repoPath: string) => invoke<PullRequest[]>('list_prs', { repoPath });
export const checkoutPr = (repoPath: string, urlOrNumber: string) =>
  invoke<PullRequest>('checkout_pr', { repoPath, urlOrNumber });
export const pushReview = (
  repoPath: string,
  sessionId: string,
  prNumber: number,
  event: ReviewEvent | null,
  body?: string | null,
  threadIds?: string[] | null,
  reviewId?: string | null,
) =>
  invoke<PushResult>('push_review', {
    repoPath,
    sessionId,
    prNumber,
    event,
    body: body ?? null,
    threadIds: threadIds ?? null,
    reviewId: reviewId ?? null,
  });
/** Pushes a submitted local review: its new threads, its replies on GitHub-linked threads, body and verdict. */
export const pushSubmittedReview = (repoPath: string, sessionId: string, prNumber: number, reviewId: string) =>
  pushReview(repoPath, sessionId, prNumber, null, null, null, reviewId);
export const pullReview = (repoPath: string, sessionId: string, prNumber: number) =>
  invoke<PullResult>('pull_review', { repoPath, sessionId, prNumber });
/** Open unsynced threads from all of the repo's sessions that line up with the PR diff. */
export const githubPushableThreads = (repoPath: string, prNumber: number) =>
  invoke<Thread[]>('github_pushable_threads', { repoPath, prNumber });
export const githubReply = (threadId: string, body: string) => invoke<Thread>('github_reply', { threadId, body });
export const githubSetResolved = (threadId: string, resolved: boolean) =>
  invoke<Thread>('github_set_resolved', { threadId, resolved });

// events
export const onRepoChanged = (handler: (payload: RepoChangedPayload) => void): Promise<UnlistenFn> =>
  listen<RepoChangedPayload>('repo-changed', (event) => handler(event.payload));
export const onThreadsChanged = (handler: (payload: ThreadsChangedPayload) => void): Promise<UnlistenFn> =>
  listen<ThreadsChangedPayload>('threads-changed', (event) => handler(event.payload));
