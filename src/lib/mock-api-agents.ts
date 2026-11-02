// Browser-dev mocks for the agents-ui workstream (agent chat, GitHub, PRs). Registered by lib/mock-api.ts.
import type {
  AgentAction,
  AgentEvent,
  Chat,
  ChatMessage,
  ContextChip,
  GithubAuthStatus,
  Guide,
  NewThread,
  InboxPullRequest,
  PrInbox,
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
  guides: Map<string, Guide>;
  /** Fingerprint of the mock diff for a ref. */
  fingerprintFor: (ref: string) => string;
}

/** What the mock agent writes for the fixture diff (tiny-serve gains an in-memory cache). */
function fixtureGuide(sessionId: string, ref: string, fingerprint: string): Guide {
  return {
    sessionId,
    ref,
    fingerprint,
    agentName: 'Claude Code',
    createdAt: new Date().toISOString(),
    summary:
      'The server now keeps the files it serves in an **in-memory cache**, so repeat requests skip the disk. Errors are split into *not found* and *internal error*, and a small health report is added for monitoring.',
    before: 'Every request read the file from disk, and any failure answered `404`.',
    after: 'Repeat requests are answered from memory (up to 500 files), and only a missing file answers `404`; other failures answer `500`.',
    diagram:
      'flowchart LR\n  req["Request"] --> handle["handle()"]\n  handle --> cached{"getCached()"}:::added\n  cached -- hit --> respond["Respond"]\n  cached -- miss --> disk["readFile()"]\n  disk --> store["setCached()"]:::added\n  store --> respond\n  handle -. error .-> status["404 or 500"]:::changed\n  handle -.-> notfound["404 on every error"]:::removed\n  %% ref node:handle [[src/server.ts#L42]]\n  %% ref node:cached [[src/server.ts#L45]]\n  %% ref node:store [[src/cache.ts#L8]]\n  %% ref edge:cached->disk [[src/server.ts#L47]]',
    flow: [
      { node: 'req', text: 'A browser asks for a file.' },
      { node: 'handle', text: '`handle()` resolves the path and checks it stays inside the root.' },
      { node: 'cached', text: 'It looks in the new in-memory cache first.' },
      { node: 'disk', text: 'On a miss it reads the file from disk, as before.' },
      { node: 'store', text: 'The bytes go into the cache so the next request skips the disk.' },
      { node: 'respond', text: 'The response is sent with the right MIME type.' },
    ],
    chapters: [
      {
        title: 'Cache file reads',
        phase: 'Server',
        summary:
          '`src/cache.ts` (renamed from `legacy-cache.ts`) holds up to 500 file bodies and drops the oldest entry when it is full. `handle()` in `src/server.ts` asks the cache first and stores what it reads from disk.',
        points: ['The cap lives in [[src/cache.ts#L2]]; there is no way to change it at runtime.'],
        focus: ['Eviction removes the oldest entry, not the least recently used'],
        attention: 'high',
        files: ['src/cache.ts', 'src/server.ts'],
        callstack: [
          { depth: 0, call: 'handle(req, res, options)', change: 'same', path: 'src/server.ts', line: 42, side: 'new', why: 'Every request for a file comes through here.' },
          { depth: 1, call: 'cached = getCached(filePath)', change: 'added', path: 'src/server.ts', line: 45, side: 'new', why: 'Asks memory first, and only when `options.cache` is on.' },
          { depth: 1, call: 'body = cached ?? readFile(filePath)', change: 'added', path: 'src/server.ts', line: 46, side: 'new' },
          { depth: 1, call: 'body = readFile(filePath)', change: 'removed', path: 'src/server.ts', line: 39, side: 'old' },
          { depth: 1, call: 'if !cached: setCached(filePath, body)', change: 'added', path: 'src/server.ts', line: 48, side: 'new', why: 'Stores what was read so the next request skips the disk.' },
          { depth: 2, call: 'if full: cache.delete(oldest)', change: 'added', path: 'src/cache.ts', line: 12, side: 'new', why: 'Drops the oldest *added* entry once [[src/cache.ts#L2]] is reached.' },
          { depth: 1, call: 'res.end(body)', change: 'same', path: 'src/server.ts', line: 51, side: 'new' },
        ],
        notes: [
          { path: 'src/cache.ts', line: 9, side: 'new', text: '`Map` keeps insertion order, so the first key is the oldest one *added*, not the least recently read.', critical: false },
          { path: 'src/server.ts', line: 45, side: 'new', text: 'Nothing clears this entry when the file changes on disk, so edits are not served until the server restarts.', critical: true },
          { path: 'src/server.ts', side: 'new', text: 'The cache is on by default (`cache: true` in `DEFAULT_OPTIONS`).', critical: false },
        ],
      },
      {
        title: 'Report server health',
        phase: 'Server',
        summary: 'A new `healthReport()` reads heap use and uptime, and `handleHealth()` answers `200` or `503` with the report as JSON. Nothing calls it yet.',
        focus: ['The 512 MB limit is hard-coded'],
        attention: 'normal',
        files: ['src/health.ts'],
        notes: [],
      },
      {
        title: 'Format sizes and plurals',
        phase: 'Utilities',
        summary: '`formatBytes()` now rounds exact kilobytes up a unit and prints whole bytes, and `pluralize()` returns the count with the word.',
        focus: [],
        attention: 'normal',
        files: ['src/utils/format.ts'],
        notes: [{ path: 'src/utils/format.ts', line: 26, side: 'new', text: '`pluralize()` now returns the count too, so callers that print the count themselves will show it twice.', critical: false }],
      },
      {
        title: 'Docs, config and assets',
        phase: 'Utilities',
        summary: 'The README documents `--no-cache` and the cache flow, the old `config.json` is removed and a logo is added.',
        focus: [],
        attention: 'low',
        files: ['README.md', 'config.json', 'docs/logo.svg'],
        notes: [],
      },
    ],
  };
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

function inboxPr(repo: string, number: number, title: string, extra: Partial<InboxPullRequest> = {}): InboxPullRequest {
  const minutesAgo = extra.updatedAt ? 0 : (number % 7) * 47 + 12;
  return {
    number,
    title,
    url: `https://github.com/${repo}/pull/${number}`,
    state: 'OPEN',
    isDraft: false,
    author: 'octocat',
    baseRef: 'main',
    headRef: `feat/${number}`,
    headSha: 'f00d',
    reviewDecision: 'REVIEW_REQUIRED',
    checks: 'SUCCESS',
    body: '',
    createdAt: '2026-09-20T10:00:00Z',
    reviewThreadCount: 0,
    updatedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    headRepo: repo,
    isCrossRepository: false,
    repo,
    commentCount: 0,
    checkCount: 12,
    ...extra,
  };
}

const INBOX_DIRECT = [
  inboxPr('demo/tiny-serve', 42, 'Add in-memory cache to the static file server', { reviewThreadCount: 2, commentCount: 1, checkCount: 8 }),
  inboxPr('acme/payments-api', 1893, 'Retry webhook delivery with exponential backoff', { author: 'jdoe', checks: 'FAILURE', commentCount: 4 }),
  inboxPr('acme/web', 772, 'Drop Node 18 from the CI matrix', { author: 'tlee', reviewDecision: 'CHANGES_REQUESTED', commentCount: 8 }),
];
const INBOX: PrInbox = {
  reviewDirect: INBOX_DIRECT,
  reviewRequested: [
    ...INBOX_DIRECT,
    inboxPr('acme/payments-api', 1889, 'Rename BillingAccount to Account across services', { author: 'nadia', checkCount: 31, commentCount: 5 }),
    inboxPr('acme/gateway', 340, 'Add rate limit headers to public endpoints', { author: 'okafor', checks: 'PENDING' }),
  ],
  assigned: [inboxPr('demo/diffity', 209, 'Docs: explain the .diffityignore file', { author: 'utvara', reviewDecision: 'APPROVED', commentCount: 2 })],
  authored: [
    inboxPr('demo/tiny-serve', 41, 'Fix formatBytes rounding for values under 1 KB', { author: 'demo-user', reviewDecision: 'APPROVED' }),
    inboxPr('demo/diffity', 217, 'PR inbox in the open dialog', { author: 'demo-user', isDraft: true, reviewDecision: null, checks: 'PENDING' }),
  ],
};

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
    emit({ type: 'toolCall', id: 't0', title: 'ToolSearch', kind: 'other', status: 'in_progress', locations: [] });
    await wait(200);
    emit({ type: 'toolCallUpdate', id: 't0', status: 'completed' });
    emit({ type: 'toolCall', id: 't1', title: 'mcp__diffity__get_diff', kind: 'other', status: 'in_progress', locations: [] });
    await wait(500);
    emit({ type: 'toolCallUpdate', id: 't1', status: 'completed' });
    emit({ type: 'toolCall', id: 't1b', title: 'Terminal', kind: 'execute', status: 'in_progress', locations: [] });
    emit({ type: 'toolCallUpdate', id: 't1b', status: 'in_progress', title: `cd ${abs('')} && git log --oneline -5 && cat package.json 2>/dev/null | head -40` });
    await wait(400);
    emit({ type: 'toolCallUpdate', id: 't1b', status: 'completed' });
    emit({ type: 'toolCall', id: 't1d', title: 'grep -rn "openActivity\\b\\|toggleActivity\\|selected:" src --include=*.ts | grep -v "^src/features/claude/activity-panel.tsx"; grep -n "byRepo" src/features/claude/run-activity.ts | head -20', kind: 'execute', status: 'completed', locations: [] });
    emit({ type: 'toolCall', id: 't1e', title: 'sed -n 205,240p src/features/claude/run-activity.ts', kind: 'execute', status: 'completed', locations: [] });
    emit({ type: 'toolCall', id: 't1c', title: 'Read /private/tmp/claude-501/tool-results/mcp-diffity-get_diff-1792159442041.txt (1 - 500)', kind: 'read', status: 'completed', locations: [] });
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

    if (action.kind === 'guide') {
      const session = chat ? chat.sessionId : deps.sessionFor(deps.repoPath, action.ref).id;
      emit({ type: 'toolCall', id: 'g1', title: 'set_guide', kind: 'other', status: 'in_progress', locations: [] });
      await wait(700);
      deps.guides.set(session, fixtureGuide(session, action.ref, deps.fingerprintFor(action.ref)));
      emit({ type: 'toolCallUpdate', id: 'g1', status: 'completed' });
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
      { id: 'codex', name: 'Codex', installed: false, binaryPath: null, authenticated: null, note: '`codex` not found on PATH' },
      { id: 'opencode', name: 'OpenCode', installed: false, binaryPath: null, authenticated: null, note: '`opencode` not found on PATH' },
    ],
    list_chats: (args) =>
      [...chats.values()]
        .filter((chat) => chat.repoPath === args.repoPath)
        .filter((chat) => !args.ref || chat.sessionId === deps.sessionFor(String(args.repoPath), String(args.ref)).id)
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
        emit({ type: 'error', code: 'agent_auth_required', message: 'Authentication required: run `claude` in a terminal to log in.' });
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
    github_pr_inbox: async () => {
      await wait(400);
      if (!auth.authenticated) {
        throw { code: 'unauthenticated', message: 'Not signed in to GitHub' };
      }
      return INBOX;
    },
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
