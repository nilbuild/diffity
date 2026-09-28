import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import { emit } from '@tauri-apps/api/event';
import type {
  AgentEvent,
  Branch,
  Comment,
  Commit,
  DiffFileSummary,
  DiffResult,
  NewThread,
  Review,
  ReviewSession,
  ReviewVerdict,
  Thread,
  ThreadStatus,
  TreeEntry,
} from './types';
import { FIXTURE_CONTENTS, FIXTURE_FILES, FIXTURE_PATCH, FIXTURE_VERSIONS } from './mock-fixtures';
import { createAgentMockHandlers } from './mock-api-agents';
import { mentionsAgent } from './mentions';

type Args = Record<string, unknown>;

const REPO_PATH = '/Users/demo/code/tiny-serve';
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFAwD2yAIRwX5/8wAAAABJRU5ErkJggg==';

const now = () => new Date().toISOString();
let idCounter = 1000;
const newId = () => `${(++idCounter).toString(16)}a1b2c3d4e5f6`;

const sessions = new Map<string, ReviewSession>();
const threads = new Map<string, Thread>();
const reviews = new Map<string, Review>();
const viewed = new Map<string, Map<string, string>>();
const settings = new Map<string, string>([['theme', 'system']]);

function sessionFor(repoPath: string, ref: string): ReviewSession {
  const key = `${repoPath}::${ref}`;
  const existing = sessions.get(key);
  if (existing) {
    return existing;
  }
  const session = { id: `sess-${sessions.size + 1}`, repoPath, ref };
  sessions.set(key, session);
  return session;
}

function makeComment(
  threadId: string,
  body: string,
  authorType: Comment['authorType'],
  authorName: string,
  reviewId: string | null = null,
): Comment {
  return {
    id: newId(),
    threadId,
    authorType,
    authorName,
    body,
    createdAt: now(),
    githubCommentId: null,
    pending: reviewId !== null,
    reviewId,
    mentionsAgent: authorType === 'user' && mentionsAgent(body),
  };
}

function pendingReviewFor(sessionId: string): Review | null {
  return [...reviews.values()].find((r) => r.sessionId === sessionId && r.state === 'pending') ?? null;
}

function ensurePendingReview(sessionId: string): Review {
  const existing = pendingReviewFor(sessionId);
  if (existing) {
    return existing;
  }
  const review: Review = {
    id: `rev-${newId()}`,
    sessionId,
    state: 'pending',
    body: '',
    verdict: null,
    pendingCount: 0,
    commentCount: 0,
    threadIds: [],
    mentionedThreadIds: [],
    bodyMentionsAgent: false,
    createdAt: now(),
    submittedAt: null,
  };
  reviews.set(review.id, review);
  return review;
}

function fillReview(review: Review): Review {
  const comments = [...threads.values()].flatMap((t) => t.comments).filter((c) => c.reviewId === review.id);
  const threadIds: string[] = [];
  const mentionedThreadIds: string[] = [];
  for (const c of comments) {
    if (!threadIds.includes(c.threadId)) {
      threadIds.push(c.threadId);
    }
    if (c.mentionsAgent && !mentionedThreadIds.includes(c.threadId)) {
      mentionedThreadIds.push(c.threadId);
    }
  }
  return {
    ...review,
    pendingCount: comments.filter((c) => c.pending).length,
    commentCount: comments.length,
    threadIds,
    mentionedThreadIds,
    bodyMentionsAgent: mentionsAgent(review.body),
  };
}

function insertThread(input: NewThread): Thread {
  const id = newId();
  const reviewId = input.pending ? ensurePendingReview(input.sessionId).id : null;
  const thread: Thread = {
    id,
    sessionId: input.sessionId,
    filePath: input.filePath,
    side: input.side,
    startLine: input.startLine,
    endLine: input.endLine,
    status: 'open',
    severity: input.severity ?? null,
    anchorContent: input.anchorContent ?? null,
    githubThreadId: null,
    comments: [makeComment(id, input.body, input.authorType ?? 'user', input.authorName ?? 'You', reviewId)],
    createdAt: now(),
    updatedAt: now(),
    pending: reviewId !== null,
    reviewId,
  };
  threads.set(id, thread);
  return thread;
}

function seedThreads() {
  const sessionId = sessionFor(REPO_PATH, 'work').id;
  insertThread({
    sessionId,
    filePath: 'src/server.ts',
    side: 'new',
    startLine: 44,
    endLine: 48,
    body: 'The cache is keyed by absolute path but never invalidated when the file changes on disk. Consider keying by `mtime` too.',
    severity: 'must-fix',
    authorType: 'agent',
    authorName: 'Claude Code',
  });
  const reply = insertThread({
    sessionId,
    filePath: 'src/utils/format.ts',
    side: 'new',
    startLine: 26,
    endLine: 27,
    body: 'This changes the return shape of `pluralize` — callers that concatenated the count will now print it twice.',
    severity: 'suggestion',
  });
  reply.comments.push(makeComment(reply.id, 'Good catch, I checked and there is only one caller. Updating it.', 'github', 'octocat'));
  insertThread({
    sessionId,
    filePath: 'src/server.ts',
    side: 'old',
    startLine: 48,
    endLine: 48,
    body: 'Why was the 404 log removed?',
    severity: 'question',
  });
  insertThread({
    sessionId,
    filePath: '__general__',
    side: 'new',
    startLine: 0,
    endLine: 0,
    body: 'Overall looks good. Please add a test for the LRU eviction in `cache.ts`.',
    authorType: 'agent',
    authorName: 'Claude Code',
  });
  insertThread({
    sessionId,
    filePath: 'src/server.ts',
    side: 'new',
    startLine: 120,
    endLine: 121,
    body: 'This thread points at lines that no longer exist.',
    anchorContent: '  server.close();\n  process.exit(0);',
  });
  const resolved = insertThread({
    sessionId,
    filePath: 'src/cache.ts',
    side: 'new',
    startLine: 2,
    endLine: 2,
    body: 'Make MAX_ENTRIES configurable?',
    severity: 'nit',
  });
  resolved.status = 'resolved';
}

seedThreads();

function buildTree(): TreeEntry[] {
  const files = new Set(Object.keys(FIXTURE_CONTENTS));
  files.add('docs/screenshot.png');
  for (let pkg = 1; pkg <= 30; pkg++) {
    for (let file = 1; file <= 8; file++) {
      files.add(`packages/pkg-${pkg}/src/module-${file}.ts`);
    }
  }
  const dirs = new Set<string>();
  for (const path of files) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }
  return [
    ...[...dirs].map((path) => ({ path, kind: 'dir' as const })),
    ...[...files].map((path) => ({ path, kind: 'file' as const })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}

function fileContents(path: string): string {
  if (FIXTURE_CONTENTS[path] !== undefined) {
    return FIXTURE_CONTENTS[path];
  }
  return `export function ${path.split('/').pop()?.replace(/[^a-z0-9]/gi, '_')}() {\n  return '${path}';\n}\n`;
}

function diffFor(ref: string): DiffResult {
  const staged = ref === 'staged';
  const files: DiffFileSummary[] = FIXTURE_FILES.map((file) => ({ ...file }));
  return {
    resolved: {
      ref,
      label: ref === 'work' ? 'Uncommitted changes' : ref === 'staged' ? 'Staged changes' : ref === 'unstaged' ? 'Unstaged changes' : ref,
      canRevert: ref === 'work' || ref === 'unstaged' || ref === 'staged',
      baseSha: 'a1b2c3d',
      headSha: null,
    },
    files: staged ? files.slice(0, 2) : files,
    patch: staged ? FIXTURE_PATCH.split('diff --git a/docs')[0] : FIXTURE_PATCH,
    fingerprint: `fp-${ref}-${fingerprintBump}`,
  };
}

let fingerprintBump = 0;

const commits: Commit[] = Array.from({ length: 40 }, (_, i) => ({
  sha: `${(0xabcdef0 + i * 7919).toString(16)}${'0'.repeat(33)}`,
  shortSha: (0xabcdef0 + i * 7919).toString(16).slice(0, 7),
  subject: [
    'Add in-memory cache to static server',
    'Fix byte formatting for exact 1024 boundaries',
    'Refactor logger to share write()',
    'Bump dependencies',
    'Document CLI flags in README',
  ][i % 5],
  author: i % 3 === 0 ? 'Kamran Ahmed' : 'Jane Doe',
  date: new Date(Date.now() - i * 3600_000 * 7).toISOString(),
}));

const branches: Branch[] = [
  { name: 'feat/cache', isRemote: false, isCurrent: true, upstream: 'origin/feat/cache', ahead: 2, behind: 0 },
  { name: 'main', isRemote: false, isCurrent: false, upstream: 'origin/main', ahead: 0, behind: 0 },
  { name: 'origin/main', isRemote: true, isCurrent: false, upstream: null, ahead: 0, behind: 0 },
];

function touch(thread: Thread) {
  thread.updatedAt = now();
  void emit('threads-changed', { sessionId: thread.sessionId });
  return thread;
}

function simulateAgent(args: Args) {
  const channel = args.onEvent as { onmessage?: (event: AgentEvent) => void } | undefined;
  const send = (event: AgentEvent) => channel?.onmessage?.(event);
  const text = 'This is a mocked agent response. In the desktop app, the selected agent streams here.';
  return new Promise<void>((resolve) => {
    let i = 0;
    const timer = setInterval(() => {
      if (i >= text.length) {
        clearInterval(timer);
        send({ type: 'done', stopReason: 'end_turn' });
        resolve();
        return;
      }
      send({ type: 'text', messageId: 'm1', delta: text.slice(i, i + 6) });
      i += 6;
    }, 30);
  });
}

const handlers: Record<string, (args: Args) => unknown> = {
  open_repo: (args) => ({
    path: args.path,
    name: String(args.path).split('/').filter(Boolean).pop() ?? 'repo',
    isGit: true,
    branch: 'feat/cache',
    headSha: 'a1b2c3d4',
    remoteUrl: 'https://github.com/demo/tiny-serve.git',
  }),
  recent_repos: () => [
    { path: REPO_PATH, name: 'tiny-serve', lastOpenedAt: now() },
    { path: '/Users/demo/code/diffity', name: 'diffity', lastOpenedAt: new Date(Date.now() - 86400_000).toISOString() },
    { path: '/Users/demo/work/api-gateway', name: 'api-gateway', lastOpenedAt: new Date(Date.now() - 5 * 86400_000).toISOString() },
  ],
  watch_repo: () => null,
  unwatch_repo: () => null,
  resolve_ref: (args) => diffFor(String(args.ref)).resolved,
  get_diff: (args) => diffFor(String(args.ref)),
  diff_fingerprint: (args) => diffFor(String(args.ref)).fingerprint,
  get_file_versions: (args) => FIXTURE_VERSIONS[String(args.path)] ?? { oldContents: null, newContents: null },
  list_commits: (args) => {
    const search = typeof args.search === 'string' ? args.search.toLowerCase() : '';
    const skip = Number(args.skip ?? 0);
    const count = Number(args.count ?? 20);
    return commits.filter((c) => !search || c.subject.toLowerCase().includes(search)).slice(skip, skip + count);
  },
  list_branches: () => branches,
  git_status: () => ({ branch: 'feat/cache', upstream: 'origin/feat/cache', ahead: 2, behind: 0, staged: 1, unstaged: 4, untracked: 2, dirty: true }),
  revert_file: () => null,
  revert_hunk: () => null,
  open_in_editor: () => null,
  list_tree: () => buildTree(),
  read_file: (args) => {
    const path = String(args.path);
    if (path.endsWith('.png')) {
      return { path, contents: null, binary: true, size: 2048 };
    }
    const contents = fileContents(path);
    return { path, contents, binary: false, size: contents.length };
  },
  read_file_base64: () => PNG_1PX,
  get_session: (args) => sessionFor(String(args.repoPath), String(args.ref)),
  list_threads: (args) =>
    [...threads.values()]
      .filter((t) => t.sessionId === args.sessionId)
      .map((t) => ({ ...t, comments: [...t.comments] })),
  create_thread: (args) => touch(insertThread(args.input as NewThread)),
  add_reply: (args) => {
    const thread = threads.get(String(args.threadId));
    if (!thread) {
      throw { code: 'not_found', message: 'thread not found' };
    }
    const authorType = (args.authorType as Comment['authorType']) ?? 'user';
    const pending = authorType === 'user' && (args.pending === true || thread.pending);
    const reviewId = pending ? ensurePendingReview(thread.sessionId).id : null;
    thread.comments.push(makeComment(thread.id, String(args.body), authorType, (args.authorName as string) ?? 'You', reviewId));
    if (!pending && authorType === 'user' && thread.status !== 'open') {
      thread.status = 'open';
    }
    return touch(thread);
  },
  edit_comment: (args) => {
    for (const thread of threads.values()) {
      const comment = thread.comments.find((c) => c.id === args.commentId);
      if (comment) {
        comment.body = String(args.body);
        touch(thread);
      }
    }
    return null;
  },
  delete_comment: (args) => {
    for (const thread of threads.values()) {
      const index = thread.comments.findIndex((c) => c.id === args.commentId);
      if (index === -1) {
        continue;
      }
      thread.comments.splice(index, 1);
      if (thread.comments.length === 0) {
        threads.delete(thread.id);
      }
      touch(thread);
    }
    return null;
  },
  delete_thread: (args) => {
    const thread = threads.get(String(args.threadId));
    if (thread) {
      threads.delete(thread.id);
      touch(thread);
    }
    return null;
  },
  delete_all_threads: (args) => {
    for (const thread of [...threads.values()]) {
      if (thread.sessionId === args.sessionId) {
        threads.delete(thread.id);
      }
    }
    void emit('threads-changed', { sessionId: args.sessionId });
    return null;
  },
  set_thread_status: (args) => {
    const thread = threads.get(String(args.threadId));
    if (!thread) {
      throw { code: 'not_found', message: 'thread not found' };
    }
    thread.status = args.status as ThreadStatus;
    if (typeof args.summary === 'string' && args.summary) {
      thread.comments.push(makeComment(thread.id, args.summary, 'agent', 'Claude Code'));
    }
    return touch(thread);
  },
  get_pending_review: (args) => {
    const review = pendingReviewFor(String(args.sessionId));
    return review ? fillReview(review) : null;
  },
  start_review: (args) => fillReview(ensurePendingReview(String(args.sessionId))),
  get_review: (args) => {
    const review = reviews.get(String(args.reviewId));
    if (!review) {
      throw { code: 'not_found', message: 'review not found' };
    }
    return fillReview(review);
  },
  list_reviews: (args) =>
    [...reviews.values()].filter((r) => r.sessionId === args.sessionId).map((r) => fillReview(r)),
  submit_review: (args) => {
    const sessionId = String(args.sessionId);
    const body = typeof args.body === 'string' ? args.body.trim() : '';
    const verdict = (args.verdict as ReviewVerdict | null) ?? 'comment';
    const pending = pendingReviewFor(sessionId);
    const pendingCount = pending ? fillReview(pending).pendingCount : 0;
    if (pendingCount === 0 && !body && verdict === 'comment') {
      throw { code: 'invalid', message: 'the review has no comments and no summary' };
    }
    const review = ensurePendingReview(sessionId);
    const ts = now();
    for (const thread of threads.values()) {
      const drafts = thread.comments.filter((c) => c.reviewId === review.id && c.pending);
      if (drafts.length === 0) {
        continue;
      }
      for (const c of drafts) {
        c.pending = false;
        c.createdAt = ts;
      }
      thread.pending = false;
      thread.status = 'open';
      thread.updatedAt = ts;
    }
    Object.assign(review, { state: 'submitted', body, verdict, submittedAt: ts });
    void emit('threads-changed', { sessionId });
    return fillReview(review);
  },
  discard_review: (args) => {
    const sessionId = String(args.sessionId);
    const review = pendingReviewFor(sessionId);
    if (!review) {
      return null;
    }
    for (const thread of [...threads.values()]) {
      if (thread.reviewId === review.id) {
        threads.delete(thread.id);
        continue;
      }
      thread.comments = thread.comments.filter((c) => !(c.reviewId === review.id && c.pending));
    }
    reviews.delete(review.id);
    void emit('threads-changed', { sessionId });
    return null;
  },
  list_viewed: (args) =>
    [...(viewed.get(String(args.sessionId)) ?? new Map()).entries()].map(([filePath, contentHash]) => ({ filePath, contentHash })),
  set_viewed: (args) => {
    const sessionId = String(args.sessionId);
    const map = viewed.get(sessionId) ?? new Map<string, string>();
    if (args.viewed) {
      map.set(String(args.filePath), String(args.contentHash));
    } else {
      map.delete(String(args.filePath));
    }
    viewed.set(sessionId, map);
    return null;
  },
  get_setting: (args) => settings.get(String(args.key)) ?? null,
  set_setting: (args) => {
    settings.set(String(args.key), String(args.value));
    return null;
  },
  list_agents: () => [
    { id: 'claude', name: 'Claude Code', installed: true, binaryPath: '/usr/local/bin/claude', authenticated: true, note: null },
  ],
  list_chats: () => [],
  start_chat: (args) => {
    const input = args.input as { repoPath: string; agentId: string; mode: string; title?: string };
    return { id: newId(), repoPath: input.repoPath, agentId: input.agentId, mode: input.mode, title: input.title ?? 'New chat', createdAt: now(), updatedAt: now() };
  },
  get_chat_messages: () => [],
  send_prompt: (args) => simulateAgent(args),
  cancel_prompt: () => null,
  respond_permission: () => null,
  delete_chat: () => null,
  github_auth_status: () => ({ authenticated: false, login: null, source: null, deviceFlowAvailable: false }),
  git_fetch: () => ({ ok: true, output: 'Fetched' }),
  git_pull: () => ({ ok: true, output: 'Already up to date.' }),
  git_push: () => ({ ok: true, output: 'Pushed' }),
  find_pr: () => null,
  list_prs: () => [],
  'plugin:dialog|open': () => REPO_PATH,
  'plugin:webview|create_webview_window': (args) => {
    const options = args.options as { url?: string } | undefined;
    window.open(`${location.origin}${location.pathname}${options?.url?.replace(/^index\.html/, '') ?? ''}`, '_blank');
    return null;
  },
};

export function installMockApi() {
  Object.assign(handlers, createAgentMockHandlers({ repoPath: REPO_PATH, now, newId, sessionFor, insertThread, touch, threads }));
  mockWindows('main');
  mockIPC(
    (cmd, payload) => {
      const handler = handlers[cmd];
      if (!handler) {
        console.warn('[mock-api] unhandled command', cmd, payload);
        throw { code: 'not_implemented', message: `mock: ${cmd}` };
      }
      return handler((payload ?? {}) as Args);
    },
    { shouldMockEvents: true },
  );
  (window as unknown as { __diffityMock: unknown }).__diffityMock = {
    bumpFingerprint: () => {
      fingerprintBump++;
      void emit('repo-changed', { repoPath: REPO_PATH });
    },
    addAgentComment: () => {
      const sessionId = sessionFor(REPO_PATH, 'work').id;
      touch(
        insertThread({
          sessionId,
          filePath: 'src/utils/format.ts',
          side: 'new',
          startLine: 10,
          endLine: 11,
          body: 'Live agent comment: `digits` could be a const lookup.',
          authorType: 'agent',
          authorName: 'Claude Code',
          severity: 'nit',
        }),
      );
    },
  };
}

export const MOCK_REPO_PATH = REPO_PATH;
