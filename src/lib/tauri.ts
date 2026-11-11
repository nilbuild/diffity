import { Channel, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  TerminalAgent,
  TerminalStatus,
  AgentAction,
  AgentEvent,
  AgentInfo,
  AppError,
  AuthorType,
  Branch,
  Worktree,
  Task,
  TaskState,
  TaskConfig,
  TaskBaseStatus,
  TaskStorage,
  TaskRound,
  NewTask,
  Chat,
  ChatMessage,
  Commit,
  ContextChip,
  ModelCatalog,
  ProjectData,
  RunModel,
  DeviceCode,
  DiffResult,
  FileContent,
  SearchOptions,
  SearchResult,
  FileVersions,
  Guide,
  GitOpResult,
  GitStatus,
  GithubAuthStatus,
  NewThread,
  OpenRequest,
  OverviewFile,
  PrInbox,
  PullRequest,
  PullResult,
  PushResult,
  ReviewCandidates,
  GithubPendingAction,
  RecentRepo,
  RepoChangedPayload,
  RepoInfo,
  RepoThread,
  ResolvedRef,
  Review,
  ReviewEvent,
  ReviewSession,
  StashResult,
  ReviewVerdict,
  StartChat,
  Thread,
  ThreadSnapshot,
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
export const repoRemoteUrls = (path: string) => invoke<string[]>('repo_remote_urls', { path });
export const recentRepos = () => invoke<RecentRepo[]>('recent_repos');
export const watchRepo = (repoPath: string) => invoke<void>('watch_repo', { repoPath });
export const unwatchRepo = (repoPath: string) => invoke<void>('unwatch_repo', { repoPath });
export const listCommits = (repoPath: string, count: number, skip: number, search?: string | null) =>
  invoke<Commit[]>('list_commits', { repoPath, count, skip, search: search ?? null });
export const listBranchCommits = (repoPath: string, base: string, count: number, skip: number) =>
  invoke<Commit[]>('list_branch_commits', { repoPath, base, count, skip });
export const listBranches = (repoPath: string) => invoke<Branch[]>('list_branches', { repoPath });
export const listWorktrees = (repoPath: string) => invoke<Worktree[]>('list_worktrees', { repoPath });
export const listTasks = (repoPath?: string | null) => invoke<Task[]>('list_tasks', { repoPath: repoPath ?? null });
export const mainCheckout = (path: string) => invoke<string>('main_checkout', { path });
export const createTask = (input: NewTask) => invoke<Task>('create_task', { input });
export const setTaskState = (taskId: string, taskState: TaskState) => invoke<Task>('set_task_state', { taskId, taskState });
export const renameTask = (taskId: string, title: string) => invoke<Task>('rename_task', { taskId, title });
export const finishTaskRun = (taskId: string, failed: boolean) => invoke<TaskRound | null>('finish_task_run', { taskId, failed });
export const archiveTask = (taskId: string) => invoke<Task>('archive_task', { taskId });
export const notifyTask = (title: string, body: string) => invoke<void>('notify_task', { title, body });
export const setTaskBadge = (count: number) => invoke<void>('set_task_badge', { count });
export const markTaskReviewed = (taskId: string) => invoke<void>('mark_task_reviewed', { taskId });
export const taskConfig = (repoPath: string) => invoke<TaskConfig>('task_config', { repoPath });
export const runTaskSetup = (taskId: string, command: string, onLine: (line: string) => void) => {
  const channel = new Channel<string>();
  channel.onmessage = onLine;
  return invoke<void>('run_task_setup', { taskId, command, onOutput: channel });
};
export const taskBaseStatus = (taskId: string) => invoke<TaskBaseStatus>('task_base_status', { taskId });
export const updateTaskFromBase = (taskId: string) => invoke<{ conflicts: string[] }>('update_task_from_base', { taskId });
export const shipTaskPr = (taskId: string, title: string, body: string, draft: boolean) =>
  invoke<{ number: number; url: string }>('ship_task_pr', { taskId, title, body, draft });
export const mergeTaskLocally = (taskId: string, message: string) => invoke<Task>('merge_task_locally', { taskId, message });
export const restoreTask = (taskId: string) => invoke<Task>('restore_task', { taskId });
export const listArchivedTasks = (repoPath: string) => invoke<Task[]>('list_archived_tasks', { repoPath });
export const taskStorage = (repoPath?: string | null) => invoke<TaskStorage>('task_storage', { repoPath: repoPath ?? null });
export const adoptWorktree = (path: string, baseRef: string) => invoke<Task>('adopt_worktree', { path, baseRef });
export const refreshTaskPrs = (repoPath: string) => invoke<Task[]>('refresh_task_prs', { repoPath });
export const gitStatus = (repoPath: string) => invoke<GitStatus>('git_status', { repoPath });
export const repoOverview = (repoPath: string) => invoke<OverviewFile[]>('repo_overview', { repoPath });
export const openInEditor = (repoPath: string, path: string, line?: number | null, editor?: string | null) =>
  invoke<void>('open_in_editor', { repoPath, path, line: line ?? null, editor: editor ?? null });
export const reportIssue = () => invoke<void>('report_issue');
export const takeOpenRequests = () => invoke<OpenRequest[]>('take_open_requests');
export const projectData = () => invoke<ProjectData[]>('project_data');
export const clearProjectData = (repoPath: string) => invoke<void>('clear_project_data', { repoPath });
export const resetAllData = () => invoke<void>('reset_all_data');
export const getSetting = (key: string) => invoke<string | null>('get_setting', { key });
export const setSetting = (key: string, value: string) => invoke<void>('set_setting', { key, value });

// diff
export const resolveRef = (repoPath: string, ref: string) => invoke<ResolvedRef>('resolve_ref', { repoPath, ref });
export const getDiff = (repoPath: string, ref: string, ignoreWhitespace: boolean, showIgnored = false) =>
  invoke<DiffResult>('get_diff', { repoPath, ref, ignoreWhitespace, showIgnored });
export const getDiffIgnoreRules = (repoPath: string) => invoke<string>('get_diff_ignore_rules', { repoPath });
export const setDiffIgnoreRules = (repoPath: string, rules: string) => invoke<void>('set_diff_ignore_rules', { repoPath, rules });
export const getFilePatch = (repoPath: string, ref: string, path: string, oldPath: string | null, ignoreWhitespace: boolean) =>
  invoke<string>('get_file_patch', { repoPath, ref, path, oldPath, ignoreWhitespace });
export const getFileVersions = (repoPath: string, ref: string, path: string, oldPath?: string | null) =>
  invoke<FileVersions>('get_file_versions', { repoPath, ref, path, oldPath: oldPath ?? null });
export const diffFingerprint = (repoPath: string, ref: string, showIgnored = false) =>
  invoke<string>('diff_fingerprint', { repoPath, ref, showIgnored });
export const revertFile = (repoPath: string, path: string) => invoke<void>('revert_file', { repoPath, path });
export const revertHunk = (repoPath: string, patch: string) => invoke<void>('revert_hunk', { repoPath, patch });
export const applySuggestion = (repoPath: string, path: string, startLine: number, endLine: number, expected: string, replacement: string) =>
  invoke<{ startLine: number; endLine: number }>('apply_suggestion', { repoPath, path, startLine, endLine, expected, replacement });

// files
export const listTree = (repoPath: string) => invoke<TreeEntry[]>('list_tree', { repoPath });
export const readFile = (repoPath: string, path: string) => invoke<FileContent>('read_file', { repoPath, path });
export const searchCode = (repoPath: string, options: SearchOptions) => invoke<SearchResult>('search_code', { repoPath, options });
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
export const deleteThread = (threadId: string) => invoke<ThreadSnapshot>('delete_thread', { threadId });
export const restoreThread = (snapshot: ThreadSnapshot) => invoke<Thread>('restore_thread', { snapshot });
export const keepThreadOnBranch = (threadId: string) => invoke<void>('keep_thread_on_branch', { threadId });
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
export const getGuide = (sessionId: string) => invoke<Guide | null>('get_guide', { sessionId });
export const deleteGuide = (sessionId: string) => invoke<void>('delete_guide', { sessionId });
export const setViewed = (sessionId: string, filePath: string, contentHash: string, viewed: boolean, ref: string | null) =>
  invoke<void>('set_viewed', { sessionId, filePath, contentHash, viewed, ref });
export const viewedChanges = (sessionId: string, filePath: string, ref: string | null) => invoke<string>('viewed_changes', { sessionId, filePath, ref });

// agents
export const listAgents = (refresh?: boolean) => invoke<AgentInfo[]>('list_agents', { refresh: refresh ?? null });
export const agentModels = (agentId: string, refresh = false) => invoke<ModelCatalog | null>('agent_models', { agentId, refresh });
export const startChat = (input: StartChat) => invoke<Chat>('start_chat', { input });
export const listChats = (repoPath: string, ref?: string) => invoke<Chat[]>('list_chats', { repoPath, ref: ref ?? null });
export const getChatMessages = (chatId: string) => invoke<ChatMessage[]>('get_chat_messages', { chatId });
export function sendPrompt(
  chatId: string,
  text: string,
  context: ContextChip[],
  action: AgentAction,
  model: RunModel,
  onEvent: (event: AgentEvent) => void,
) {
  const channel = new Channel<AgentEvent>();
  channel.onmessage = onEvent;
  return invoke<void>('send_prompt', { chatId, text, context, action, model, onEvent: channel });
}
export const cancelPrompt = (chatId: string) => invoke<void>('cancel_prompt', { chatId });
export const respondPermission = (requestId: string, optionId: string | null, forRun = false, skipPrompts = false) =>
  invoke<void>('respond_permission', { requestId, optionId, forRun, skipPrompts });
export const deleteChat = (chatId: string) => invoke<void>('delete_chat', { chatId });

// github
export const githubAuthStatus = () => invoke<GithubAuthStatus>('github_auth_status');
export const githubImportGhToken = () => invoke<GithubAuthStatus>('github_import_gh_token');
export const githubSetToken = (token: string) => invoke<GithubAuthStatus>('github_set_token', { token });
export const githubDeviceStart = () => invoke<DeviceCode>('github_device_start');
export const githubDevicePoll = (deviceCode: string) =>
  invoke<GithubAuthStatus>('github_device_poll', { deviceCode });
export const githubLogout = () => invoke<void>('github_logout');
export const terminalStatus = () => invoke<TerminalStatus>('terminal_status');
export const terminalSetAllowed = (allowed: boolean) => invoke<void>('terminal_set_allowed', { allowed });
export const terminalConnect = (agent: TerminalAgent) => invoke<void>('terminal_connect', { agent });
export const terminalDisconnect = (agent: TerminalAgent) => invoke<void>('terminal_disconnect', { agent });
export const terminalInstallCli = () => invoke<string>('terminal_install_cli');
export const terminalUninstallCli = () => invoke<void>('terminal_uninstall_cli');
export const gitFetch = (repoPath: string) => invoke<GitOpResult>('git_fetch', { repoPath });
export const gitPull = (repoPath: string) => invoke<GitOpResult>('git_pull', { repoPath });
export const gitPush = (repoPath: string) => invoke<GitOpResult>('git_push', { repoPath });
export const gitCommitAll = (repoPath: string, message: string) => invoke<GitOpResult>('git_commit_all', { repoPath, message });
export const githubPostComment = (commentId: string) => invoke<Thread>('github_post_comment', { commentId });
export const findPr = (repoPath: string) => invoke<PullRequest | null>('find_pr', { repoPath });
export const listPrs = (repoPath: string) => invoke<PullRequest[]>('list_prs', { repoPath });
export const prInbox = () => invoke<PrInbox>('github_pr_inbox');
export const checkoutPr = (repoPath: string, urlOrNumber: string) =>
  invoke<PullRequest>('checkout_pr', { repoPath, urlOrNumber });
export const updatePrBranch = (repoPath: string, prNumber: number, reset: boolean) =>
  invoke<void>('update_pr_branch', { repoPath, prNumber, reset });
export const gitStashPush = (repoPath: string, message: string) =>
  invoke<StashResult>('git_stash_push', { repoPath, message });
export const gitStashRestore = (repoPath: string, sha: string) => invoke<void>('git_stash_restore', { repoPath, sha });
export const gitCheckout = (repoPath: string, target: string) => invoke<void>('git_checkout', { repoPath, target });
export const pushReview = (
  repoPath: string,
  sessionId: string,
  prNumber: number,
  event: ReviewEvent | null,
  body?: string | null,
  threadIds?: string[] | null,
  reviewId?: string | null,
  pendingAction?: GithubPendingAction | null,
) =>
  invoke<PushResult>('push_review', {
    repoPath,
    sessionId,
    prNumber,
    event,
    body: body ?? null,
    threadIds: threadIds ?? null,
    reviewId: reviewId ?? null,
    pendingAction: pendingAction ?? null,
  });
/** Pushes a submitted local review: its new threads, its replies on GitHub-linked threads, body and verdict. */
export const pushSubmittedReview = (repoPath: string, sessionId: string, prNumber: number, reviewId: string) =>
  pushReview(repoPath, sessionId, prNumber, null, null, null, reviewId);
export const pullReview = (repoPath: string, sessionId: string, prNumber: number) =>
  invoke<PullResult>('pull_review', { repoPath, sessionId, prNumber });
/** Open unsynced threads from all of the repo's sessions that line up with the PR diff. */
export const githubPushableThreads = (repoPath: string, prNumber: number) =>
  invoke<Thread[]>('github_pushable_threads', { repoPath, prNumber });
/** Your comments not yet on GitHub (drafts + local threads from every view), each postable or with a reason. */
export const githubReviewCandidates = (repoPath: string, prNumber: number) =>
  invoke<ReviewCandidates>('github_review_candidates', { repoPath, prNumber });
export const githubReply = (threadId: string, body: string) => invoke<Thread>('github_reply', { threadId, body });
export const githubSetResolved = (threadId: string, resolved: boolean) =>
  invoke<Thread>('github_set_resolved', { threadId, resolved });

// events
export const onRepoChanged = (handler: (payload: RepoChangedPayload) => void): Promise<UnlistenFn> =>
  listen<RepoChangedPayload>('repo-changed', (event) => handler(event.payload));
export const onThreadsChanged = (handler: (payload: ThreadsChangedPayload) => void): Promise<UnlistenFn> =>
  listen<ThreadsChangedPayload>('threads-changed', (event) => handler(event.payload));
export const onTasksChanged = (handler: (payload: { repoPath: string }) => void): Promise<UnlistenFn> =>
  listen<{ repoPath: string }>('tasks-changed', (event) => handler(event.payload));
export const gitClone = (parent: string, url: string) => invoke<string>('git_clone', { parent, url });

export interface DirSuggestion {
  path: string;
  name: string;
  isGit: boolean;
  branch: string | null;
}

export interface DirSuggestions {
  dir: string;
  segment: string;
  entries: DirSuggestion[];
}

export const quickOpenRoots = () => invoke<{ home: string; roots: string[] }>('quick_open_roots');
export const listDirSuggestions = (pathPrefix: string) => invoke<DirSuggestions>('list_dir_suggestions', { pathPrefix });
export const resolveRepoRoot = (path: string) => invoke<{ path: string; exists: boolean; repoRoot: string | null }>('resolve_repo_root', { path });
export const cloneRepo = (url: string, parent: string) => invoke<string>('clone_repo', { url, parent });
