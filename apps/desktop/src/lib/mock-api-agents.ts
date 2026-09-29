// Browser-dev mocks for the agents-ui workstream (agent chat, GitHub, PRs). Registered by lib/mock-api.ts.
import type {
  AgentAction,
  AgentEvent,
  Chat,
  ChatMessage,
  ContextChip,
  GithubAuthStatus,
  NewThread,
  PullRequest,
  ReviewSession,
  Thread,
} from './types';

type Args = Record<string, unknown>;

export interface AgentMockDeps {
  repoPath: string;
  now: () => string;
  newId: () => string;
  sessionFor: (repoPath: string, ref: string) => ReviewSession;
  insertThread: (input: NewThread) => Thread;
  touch: (thread: Thread) => Thread;
  threads: Map<string, Thread>;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PRS: PullRequest[] = [
  {
    number: 42,
    title: 'Add in-memory cache to the static file server',
    url: 'https://github.com/demo/tiny-serve/pull/42',
    state: 'OPEN',
    isDraft: false,
    author: 'octocat',
    baseRef: 'main',
    headRef: 'feat/cache',
    headSha: 'a1b2c3d4',
    reviewDecision: 'REVIEW_REQUIRED',
    checks: 'SUCCESS',
    body: '## Summary\n\nAdds an LRU-ish in-memory cache for served files plus a `/health` endpoint.\n\n- [x] cache with `MAX_ENTRIES`\n- [x] `--no-cache` flag\n- [ ] invalidate on file change\n\n```ts\nconst cached = options.cache ? getCached(filePath) : undefined;\n```',
    createdAt: '2026-09-20T10:00:00Z',
    reviewThreadCount: 2,
    updatedAt: '2026-09-21T12:00:00Z',
    additions: 12,
    deletions: 3,
    changedFiles: 2,
    headRepo: 'demo/tiny-serve',
    isCrossRepository: false,
  },
  {
    number: 41,
    title: 'Fix formatBytes rounding for values under 1 KB',
    url: 'https://github.com/demo/tiny-serve/pull/41',
    state: 'OPEN',
    isDraft: true,
    author: 'hubot',
    baseRef: 'main',
    headRef: 'fix/format-bytes',
    headSha: 'ffee0011',
    reviewDecision: null,
    checks: 'PENDING',
    body: '',
    createdAt: '2026-09-20T10:00:00Z',
    reviewThreadCount: 2,
    updatedAt: '2026-09-22T12:00:00Z',
    additions: 24,
    deletions: 6,
    changedFiles: 3,
    headRepo: 'hubot/tiny-serve',
    isCrossRepository: true,
  },
  {
    number: 38,
    title: 'Support custom MIME types via config',
    url: 'https://github.com/demo/tiny-serve/pull/38',
    state: 'OPEN',
    isDraft: false,
    author: 'monalisa',
    baseRef: 'main',
    headRef: 'feat/mime',
    headSha: '99887766',
    reviewDecision: 'CHANGES_REQUESTED',
    checks: 'FAILURE',
    body: 'Lets users map extensions to MIME types.',
    createdAt: '2026-09-20T10:00:00Z',
    reviewThreadCount: 2,
    updatedAt: '2026-09-23T12:00:00Z',
    additions: 36,
    deletions: 9,
    changedFiles: 4,
    headRepo: 'demo/tiny-serve',
    isCrossRepository: false,
  },
];

const OLD_FORMAT = `export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value = value / 1024;
    unit++;
  }
  const digits = unit === 0 ? 0 : 1;
  return \`\${value.toFixed(digits)} \${UNITS[unit]}\`;
}
`;

const NEW_FORMAT = `const DIGITS_BY_UNIT = [0, 1, 1, 2, 2] as const;

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value = value / 1024;
    unit++;
  }
  return \`\${value.toFixed(DIGITS_BY_UNIT[unit])} \${UNITS[unit]}\`;
}
`;

export function createAgentMockHandlers(deps: AgentMockDeps): Record<string, (args: Args) => unknown> {
  const chats = new Map<string, Chat & { sessionId: string }>();
  const messages = new Map<string, ChatMessage[]>();
  const cancelled = new Set<string>();
  const permissionWaiters = new Map<string, (optionId: string | null) => void>();
  const withPr = typeof localStorage !== 'undefined' && localStorage.getItem('mock.pr') === '1';
  let auth: GithubAuthStatus = withPr
    ? { authenticated: true, login: 'demo-user', source: 'gh', deviceFlowAvailable: true }
    : { authenticated: false, login: null, source: null, deviceFlowAvailable: true };
  let currentPr: PullRequest | null = withPr ? PRS[0] : null;
  let devicePolls = 0;

  const record = (chatId: string, message: ChatMessage) => {
    messages.set(chatId, [...(messages.get(chatId) ?? []), message]);
  };

  async function script(chatId: string, text: string, action: AgentAction, emit: (event: AgentEvent) => void) {
    const chat = chats.get(chatId);
    const mode = chat?.mode ?? 'ask';
    const abs = (path: string) => `${deps.repoPath}/${path}`;
    const stop = () => cancelled.has(chatId);
    const streamText = async (messageId: string, body: string) => {
      for (let i = 0; i < body.length; i += 40) {
        if (stop()) {
          return;
        }
        emit({ type: 'text', messageId, delta: body.slice(i, i + 40) });
        await wait(18);
      }
    };

    for (const chunk of ['Let me look at the diff first, ', 'then check the cache logic ', 'and how errors are handled.']) {
      emit({ type: 'thought', delta: chunk });
      await wait(150);
    }
    emit({
      type: 'plan',
      entries: [
        { content: 'Read the changed files', status: 'in_progress' },
        { content: 'Check cache invalidation and error paths', status: 'pending' },
        { content: action.kind === 'review' ? 'Leave review comments' : 'Answer the question', status: 'pending' },
      ],
    });
    emit({ type: 'toolCall', id: 't1', title: 'get_diff', kind: 'read', status: 'in_progress', locations: [] });
    await wait(500);
    emit({ type: 'toolCallUpdate', id: 't1', status: 'completed' });
    emit({
      type: 'toolCall',
      id: 't2',
      title: 'Read src/server.ts',
      kind: 'read',
      status: 'in_progress',
      locations: [abs('src/server.ts:44'), abs('src/cache.ts')],
    });
    await wait(600);
    emit({ type: 'toolCallUpdate', id: 't2', status: 'completed' });
    emit({ type: 'toolCall', id: 't3', title: 'grep "setCached"', kind: 'search', status: 'in_progress', locations: [] });
    await wait(400);
    emit({ type: 'toolCallUpdate', id: 't3', status: 'failed', title: 'grep "setCached" (no matches in tests)' });
    emit({
      type: 'plan',
      entries: [
        { content: 'Read the changed files', status: 'completed' },
        { content: 'Check cache invalidation and error paths', status: 'in_progress' },
        { content: action.kind === 'review' ? 'Leave review comments' : 'Answer the question', status: 'pending' },
      ],
    });
    if (stop()) {
      return 'cancelled';
    }

    if (action.kind === 'review') {
      const session = chat ? chat.sessionId : deps.sessionFor(deps.repoPath, 'work').id;
      const comments: Omit<NewThread, 'sessionId'>[] = [
        {
          filePath: 'src/cache.ts',
          side: 'new',
          startLine: 9,
          endLine: 14,
          body: 'Eviction drops the *first inserted* key, not the least recently used one. Hot files get evicted as often as cold ones.',
          severity: 'suggestion',
        },
        {
          filePath: 'src/server.ts',
          side: 'new',
          startLine: 45,
          endLine: 45,
          body: 'Cached bodies are never invalidated when the file changes on disk.',
          severity: 'must-fix',
        },
        {
          filePath: 'src/health.ts',
          side: 'new',
          startLine: 12,
          endLine: 12,
          body: 'Magic number: extract `512 * 1024 * 1024` into a named constant.',
          severity: 'nit',
        },
      ];
      for (const [index, comment] of comments.entries()) {
        const id = `c${index}`;
        emit({
          type: 'toolCall',
          id,
          title: `add_comment ${comment.filePath}:${comment.startLine}`,
          kind: 'other',
          status: 'in_progress',
          locations: [abs(`${comment.filePath}:${comment.startLine}`)],
        });
        await wait(350);
        deps.touch(deps.insertThread({ ...comment, sessionId: session, authorType: 'agent', authorName: 'Claude Code' }));
        emit({ type: 'toolCallUpdate', id, status: 'completed' });
      }
    }

    if (action.kind === 'thread' || action.kind === 'reviewFeedback') {
      const targets = [...deps.threads.values()].filter((t) => {
        if (t.pending || t.status !== 'open') {
          return false;
        }
        if (action.kind === 'thread') {
          return t.id === action.threadId;
        }
        return t.comments.some((c) => c.reviewId === action.reviewId);
      });
      for (const thread of targets) {
        const id = `r-${thread.id}`;
        emit({ type: 'toolCall', id, title: `reply ${thread.id.slice(0, 8)}`, kind: 'other', status: 'in_progress', locations: [] });
        await wait(300);
        thread.comments.push({
          id: deps.newId(),
          threadId: thread.id,
          authorType: 'agent',
          authorName: 'Claude Code',
          body: 'Mocked answer: I looked at the code around this comment and it behaves as intended.',
          createdAt: deps.now(),
          githubCommentId: null,
          pending: false,
          reviewId: null,
          mentionsAgent: false,
        });
        deps.touch(thread);
        emit({ type: 'toolCallUpdate', id, status: 'completed' });
      }
    }

    if (mode === 'edit' || mode === 'resolve') {
      const requestId = deps.newId();
      emit({
        type: 'permissionRequest',
        requestId,
        title: 'Edit src/utils/format.ts',
        options: [
          { id: 'allow', name: 'Allow once', kind: 'allow_once' },
          { id: 'always', name: 'Always allow', kind: 'allow_always' },
          { id: 'reject', name: 'Deny', kind: 'reject_once' },
        ],
        diff: { path: 'src/utils/format.ts', oldText: OLD_FORMAT, newText: NEW_FORMAT },
      });
      const choice = await new Promise<string | null>((resolve) => permissionWaiters.set(requestId, resolve));
      if (stop()) {
        return 'cancelled';
      }
      emit({
        type: 'toolCall',
        id: 'w1',
        title: 'Write src/utils/format.ts',
        kind: 'edit',
        status: choice && choice !== 'reject' ? 'completed' : 'failed',
        locations: [abs('src/utils/format.ts:3')],
      });
    }

    const summary =
      action.kind === 'review'
        ? 'I reviewed the changes and left **3 comments**:\n\n1. `src/cache.ts` — eviction is FIFO, not LRU.\n2. `src/server.ts:45` — cache is never invalidated (**must-fix**).\n3. `src/health.ts` — magic number.\n\nOverall the change is small and well-scoped.'
        : `Here's what I found${text ? ` about “${text.slice(0, 60)}”` : ''}:\n\n- The cache lives in \`src/cache.ts\` and is consulted in \`handle()\`.\n- Errors now distinguish \`ENOENT\` (404) from other failures (500).\n\n\`\`\`ts\nconst status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 404 : 500;\n\`\`\`\n\n| Area | Risk |\n| --- | --- |\n| Cache | Medium |\n| Health | Low |`;
    await streamText(`msg-${deps.newId()}`, summary);
    emit({
      type: 'plan',
      entries: [
        { content: 'Read the changed files', status: 'completed' },
        { content: 'Check cache invalidation and error paths', status: 'completed' },
        { content: action.kind === 'review' ? 'Leave review comments' : 'Answer the question', status: 'completed' },
      ],
    });
    return stop() ? 'cancelled' : 'end_turn';
  }

  return {
    list_agents: () => [
      { id: 'claude', name: 'Claude Code', installed: true, binaryPath: '/usr/local/bin/claude', authenticated: true, note: null },
    ],
    list_chats: (args) =>
      [...chats.values()]
        .filter((chat) => chat.repoPath === args.repoPath)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    start_chat: (args) => {
      const input = args.input as { repoPath: string; agentId: string; mode: Chat['mode']; sessionId: string; title?: string };
      const chat = {
        id: `chat-${deps.newId()}`,
        repoPath: input.repoPath,
        agentId: input.agentId,
        mode: input.mode,
        sessionId: input.sessionId,
        title: input.title ?? 'New chat',
        createdAt: deps.now(),
        updatedAt: deps.now(),
      };
      chats.set(chat.id, chat);
      return chat;
    },
    get_chat_messages: (args) => messages.get(String(args.chatId)) ?? [],
    send_prompt: async (args) => {
      const chatId = String(args.chatId);
      const text = String(args.text ?? '');
      const action = (args.action ?? { kind: 'chat' }) as AgentAction;
      const channel = args.onEvent as { onmessage?: (event: AgentEvent) => void } | undefined;
      const events: AgentEvent[] = [];
      const emit = (event: AgentEvent) => {
        events.push(event);
        channel?.onmessage?.(event);
      };
      cancelled.delete(chatId);
      record(chatId, {
        id: deps.newId(),
        chatId,
        role: 'user',
        content: { text, context: (args.context as ContextChip[]) ?? [] },
        createdAt: deps.now(),
      });
      if (text.toLowerCase().includes('fail')) {
        emit({ type: 'error', message: 'Authentication required: run `claude` in a terminal to log in.' });
        record(chatId, { id: deps.newId(), chatId, role: 'agent', content: events, createdAt: deps.now() });
        return null;
      }
      const stopReason = await script(chatId, text, action, emit);
      emit({ type: 'done', stopReason });
      record(chatId, { id: deps.newId(), chatId, role: 'agent', content: events, createdAt: deps.now() });
      const chat = chats.get(chatId);
      if (chat) {
        chat.updatedAt = deps.now();
      }
      return null;
    },
    cancel_prompt: (args) => {
      cancelled.add(String(args.chatId));
      for (const [id, resolve] of permissionWaiters) {
        permissionWaiters.delete(id);
        resolve(null);
      }
      return null;
    },
    respond_permission: (args) => {
      const resolve = permissionWaiters.get(String(args.requestId));
      permissionWaiters.delete(String(args.requestId));
      resolve?.((args.optionId as string | null) ?? null);
      return null;
    },
    delete_chat: (args) => {
      chats.delete(String(args.chatId));
      messages.delete(String(args.chatId));
      return null;
    },

    github_auth_status: () => auth,
    github_import_gh_token: async () => {
      await wait(500);
      auth = { ...auth, authenticated: true, login: 'demo-user', source: 'gh' };
      return auth;
    },
    github_set_token: async (args) => {
      await wait(400);
      if (!String(args.token).startsWith('gh')) {
        throw { code: 'unauthorized', message: 'GitHub rejected the token' };
      }
      auth = { ...auth, authenticated: true, login: 'demo-user', source: 'keychain' };
      return auth;
    },
    github_device_start: () => {
      devicePolls = 0;
      return { userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device', deviceCode: 'dev-1', interval: 1, expiresIn: 900 };
    },
    github_device_poll: () => {
      devicePolls++;
      if (devicePolls < 3) {
        throw { code: 'pending', message: 'waiting for authorization' };
      }
      auth = { ...auth, authenticated: true, login: 'demo-user', source: 'keychain' };
      return auth;
    },
    github_logout: () => {
      auth = { ...auth, authenticated: false, login: null, source: null };
      return null;
    },
    git_fetch: async () => {
      await wait(500);
      return { ok: true, output: '' };
    },
    git_pull: async () => {
      await wait(500);
      throw { code: 'dirty', message: 'Working tree has uncommitted changes. Commit or stash them before pulling.' };
    },
    git_push: async () => {
      await wait(700);
      return {
        ok: false,
        output:
          "To github.com:demo/tiny-serve.git\n ! [rejected]        feat/cache -> feat/cache (fetch first)\nerror: failed to push some refs to 'github.com:demo/tiny-serve.git'",
      };
    },
    git_stash_push: async (args) => {
      await wait(300);
      return { sha: 'mockstash', message: String(args.message) };
    },
    git_stash_restore: async () => {
      await wait(300);
    },
    git_checkout: async () => {
      await wait(300);
      currentPr = null;
    },
    find_pr: () => currentPr,
    list_prs: () => PRS,
    checkout_pr: async (args) => {
      await wait(600);
      const raw = String(args.urlOrNumber);
      const number = Number(raw.replace(/.*\/pull\//, '').replace('#', ''));
      const pr = PRS.find((item) => item.number === number);
      if (!pr) {
        throw { code: 'not_found', message: `PR #${raw} not found in demo/tiny-serve` };
      }
      currentPr = pr;
      return pr;
    },
    push_review: async (args) => {
      await wait(800);
      const reviewId = typeof args.reviewId === 'string' ? args.reviewId : null;
      const ids = reviewId
        ? [...deps.threads.values()].filter((t) => t.reviewId === reviewId && !t.githubThreadId).map((t) => t.id)
        : ((args.threadIds as string[] | null) ?? []);
      let pushed = 0;
      let skipped = 0;
      for (const id of ids) {
        const thread = deps.threads.get(id);
        if (!thread) {
          continue;
        }
        if (thread.filePath === 'src/health.ts') {
          skipped++;
          continue;
        }
        thread.githubThreadId = `gh-${id}`;
        deps.touch(thread);
        pushed++;
      }
      return { pushed, skipped, failed: 0, errors: [] };
    },
    pull_review: async (args) => {
      await wait(600);
      deps.touch(
        deps.insertThread({
          sessionId: String(args.sessionId),
          filePath: 'src/server.ts',
          side: 'new',
          startLine: 20,
          endLine: 20,
          body: 'Should `cache` default to `true`? Feels surprising for a dev server.',
          authorType: 'github',
          authorName: 'octocat',
        }),
      );
      return { pulled: 1, updated: 0, skipped: 0 };
    },
    github_review_candidates: () => ({
      candidates: [...deps.threads.values()]
        .filter((t) => t.status === 'open' && !t.githubThreadId && t.comments[0]?.authorType === 'user')
        .map((thread) => ({ thread, sessionRef: '', draft: !!thread.pending, blockedReason: null })),
      blocker: null,
      githubPending: null,
      prUrl: 'https://github.com/example/repo/pull/1',
    }),
    github_pushable_threads: () =>
      [...deps.threads.values()].filter((t) => !t.pending && t.status === 'open' && !t.githubThreadId),
    github_reply: (args) => {
      const thread = deps.threads.get(String(args.threadId));
      if (!thread) {
        throw { code: 'not_found', message: 'thread not found' };
      }
      thread.comments.push({
        id: deps.newId(),
        threadId: thread.id,
        authorType: 'user',
        authorName: 'You',
        body: String(args.body),
        createdAt: deps.now(),
        githubCommentId: null,
        pending: false,
        reviewId: null,
        mentionsAgent: false,
      });
      return deps.touch(thread);
    },
    github_set_resolved: (args) => {
      const thread = deps.threads.get(String(args.threadId));
      if (!thread) {
        throw { code: 'not_found', message: 'thread not found' };
      }
      thread.status = args.resolved ? 'resolved' : 'open';
      return deps.touch(thread);
    },
  };
}
