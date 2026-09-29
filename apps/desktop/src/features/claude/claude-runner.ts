import { create } from 'zustand';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { openSettingsAt } from '../../lib/ui-store';
import type { AgentAction, AgentInfo, AgentMode, PermissionDiff, PermissionOption, RepoThread } from '../../lib/types';
import { refForSession } from '../../lib/api';
import { goToThread, viewLabel } from '../../lib/thread-location';
import type { CommentThread } from '../../components/comments/types';

export type ClaudeAction = Extract<
  AgentAction,
  { kind: 'review' } | { kind: 'resolve' } | { kind: 'thread' } | { kind: 'reviewFeedback' }
>;

export interface ClaudeRunContext {
  repoPath: string;
  sessionId: string | null;
  ref?: string | null;
}

export interface ClaudeRun {
  id: string;
  action: ClaudeAction;
  context: ClaudeRunContext;
  state: 'queued' | 'running';
  threadIds: string[];
  startedAt: number | null;
  commentsAdded: number;
  chatId: string | null;
  sessionId: string | null;
  /** The view (ref) the run works in; where its comments land. */
  ref: string | null;
  /** Threads Claude started during the run, oldest first. */
  newThreadIds: string[];
}

export interface ClaudePermission {
  runId: string;
  requestId: string;
  title: string;
  options: PermissionOption[];
  diff: PermissionDiff | null;
}

interface ClaudeState {
  runs: ClaudeRun[];
  permission: ClaudePermission | null;
}

export const useClaude = create<ClaudeState>(() => ({ runs: [], permission: null }));

export type ThreadActivity = 'idle' | 'queued' | 'working';

let counter = 0;
let pumping = false;

const AGENT_ID = 'claude';

function modeFor(action: ClaudeAction): AgentMode {
  return action.kind === 'review' ? 'review' : 'resolve';
}

export function runLabel(action: ClaudeAction): string {
  switch (action.kind) {
    case 'review':
      return 'Claude is reviewing';
    case 'resolve':
      return action.threadId ? 'Claude is on a thread' : 'Claude is resolving';
    case 'thread':
      return 'Claude is replying';
    case 'reviewFeedback':
      return 'Claude is on your review';
  }
}

function chatTitle(action: ClaudeAction): string {
  switch (action.kind) {
    case 'review':
      return action.focus ? `Review (${action.focus}) · ${action.ref}` : `Review · ${action.ref}`;
    case 'resolve':
      return action.threadId ? `Resolve thread ${action.threadId.slice(0, 8)}` : 'Resolve all comments';
    case 'thread':
      return 'Reply to thread';
    case 'reviewFeedback':
      return 'Address review';
  }
}

function cachedThreads(): CommentThread[] {
  const result: CommentThread[] = [];
  for (const [, threads] of queryClient.getQueriesData<CommentThread[]>({ queryKey: ['threads'] })) {
    if (threads) {
      result.push(...threads);
    }
  }
  return result;
}

function patchRun(runId: string, patch: Partial<ClaudeRun>) {
  useClaude.setState((state) => ({
    runs: state.runs.map((run) => (run.id === runId ? { ...run, ...patch } : run)),
  }));
}

function removeRun(runId: string) {
  useClaude.setState((state) => ({
    runs: state.runs.filter((run) => run.id !== runId),
    permission: state.permission?.runId === runId ? null : state.permission,
  }));
}

function initialThreadIds(action: ClaudeAction, sessionId: string | null): string[] {
  if (action.kind === 'thread') {
    return [action.threadId];
  }
  if (action.kind === 'resolve') {
    if (action.threadId) {
      return [action.threadId];
    }
    return cachedThreads()
      .filter((thread) => thread.sessionId === sessionId && thread.status === 'open' && !thread.pending)
      .map((thread) => thread.id);
  }
  return [];
}

export function enqueueClaude(action: ClaudeAction, context: ClaudeRunContext) {
  const run: ClaudeRun = {
    id: `run-${Date.now()}-${++counter}`,
    action,
    context,
    state: 'queued',
    threadIds: initialThreadIds(action, context.sessionId),
    startedAt: null,
    commentsAdded: 0,
    chatId: null,
    sessionId: null,
    ref: action.kind === 'review' ? action.ref : context.ref ?? refForSession(context.sessionId),
    newThreadIds: [],
  };
  useClaude.setState((state) => ({ runs: [...state.runs, run] }));
  void pump();
}

export async function stopClaude() {
  const { runs } = useClaude.getState();
  const running = runs.find((run) => run.state === 'running');
  useClaude.setState((state) => ({ runs: state.runs.filter((run) => run.state === 'running') }));
  if (!running?.chatId) {
    return;
  }
  const permission = useClaude.getState().permission;
  if (permission) {
    await answerClaudePermission(null);
  }
  await tauri.cancelPrompt(running.chatId).catch(() => undefined);
}

export async function answerClaudePermission(optionId: string | null) {
  const permission = useClaude.getState().permission;
  if (!permission) {
    return;
  }
  useClaude.setState({ permission: null });
  await tauri.respondPermission(permission.requestId, optionId).catch((error) => {
    toast.error(tauri.errorMessage(error));
  });
}

function agentProblem(agent: AgentInfo | undefined): string | null {
  if (!agent) {
    return 'Claude Code was not found.';
  }
  if (!agent.installed) {
    return agent.note ?? 'Claude Code is not installed. Install the `claude` CLI and try again.';
  }
  if (agent.authenticated === false) {
    return agent.note ?? 'Claude Code is not logged in. Run `claude` in a terminal to log in.';
  }
  return null;
}

async function resolveSession(run: ClaudeRun): Promise<string> {
  const { action, context } = run;
  if (action.kind === 'review') {
    const session = await tauri.getSession(context.repoPath, action.ref);
    return session.id;
  }
  if (action.kind === 'reviewFeedback') {
    const review = await tauri.getReview(action.reviewId);
    patchRun(run.id, { threadIds: review.threadIds });
    return review.sessionId;
  }
  if (action.kind === 'thread' || (action.kind === 'resolve' && action.threadId)) {
    const threadId = action.kind === 'thread' ? action.threadId : action.threadId;
    const thread = cachedThreads().find((item) => item.id === threadId);
    if (thread?.sessionId) {
      return thread.sessionId;
    }
  }
  if (!context.sessionId) {
    throw new Error('No review session');
  }
  return context.sessionId;
}

function friendlyError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('auth') || lower.includes('login') || lower.includes('log in') || lower.includes('api key')) {
    return `${message} — Claude Code is not logged in. Run \`claude\` in a terminal to log in.`;
  }
  return message;
}

function cachedRepoThreads(repoPath: string): RepoThread[] {
  return queryClient.getQueryData<RepoThread[]>(['repo-threads', repoPath]) ?? [];
}

/** Label for a run's view, preferring the backend label (it knows commit subjects). */
export function runViewLabel(repoPath: string, ref: string): string {
  return cachedRepoThreads(repoPath).find((thread) => thread.ref === ref)?.refLabel ?? viewLabel(ref);
}

function refForThread(repoPath: string, threadId: string): string | null {
  const thread = cachedRepoThreads(repoPath).find((item) => item.id === threadId);
  if (thread) {
    return thread.ref;
  }
  return refForSession(cachedThreads().find((item) => item.id === threadId)?.sessionId);
}

/** Opens the run's view, scrolled to its first new thread (or the thread it worked on). */
export function openRunResult(run: Pick<ClaudeRun, 'context' | 'ref' | 'newThreadIds' | 'threadIds'>) {
  if (!run.ref) {
    return;
  }
  const threadId = run.newThreadIds[0] ?? run.threadIds[0] ?? null;
  goToThread(run.context.repoPath, { ref: run.ref, threadId });
}

function finishedMessage(run: ClaudeRun, added: number): string {
  const where = run.ref ? ` on ${runViewLabel(run.context.repoPath, run.ref)}` : '';
  if (run.action.kind === 'review') {
    if (added === 0) {
      return `Claude finished reviewing${where} — no comments`;
    }
    return `Claude left ${added} comment${added === 1 ? '' : 's'}${where}`;
  }
  if (run.action.kind === 'thread') {
    return `Claude replied${where}`;
  }
  return `Claude finished${where}`;
}

async function execute(run: ClaudeRun) {
  const agents = await tauri.listAgents();
  const agent = agents.find((item) => item.id === AGENT_ID) ?? agents[0];
  const problem = agentProblem(agent);
  if (problem || !agent) {
    toast.error('Could not start Claude', {
      description: problem ?? undefined,
      action: { label: 'Settings', onClick: () => openSettingsAt('claude') },
    });
    return;
  }
  const sessionId = await resolveSession(run);
  const ref = run.ref ?? refForSession(sessionId) ?? threadRef(run);
  run = { ...run, ref };
  const chat = await tauri.startChat({
    repoPath: run.context.repoPath,
    agentId: agent.id,
    mode: modeFor(run.action),
    sessionId,
    title: chatTitle(run.action),
  });
  patchRun(run.id, { chatId: chat.id, sessionId, startedAt: Date.now(), ref });

  const before = await tauri.listThreads(sessionId).catch(() => []);
  const baseline = new Set(before.map((thread) => thread.id));
  let added = 0;
  let newThreadIds: string[] = [];
  const unlisten = await tauri
    .onThreadsChanged(async (payload) => {
      if (payload.sessionId !== sessionId) {
        return;
      }
      const threads = await tauri.listThreads(sessionId).catch(() => null);
      if (!threads) {
        return;
      }
      newThreadIds = threads
        .filter((thread) => !baseline.has(thread.id) && thread.comments[0]?.authorType === 'agent')
        .map((thread) => thread.id);
      added = newThreadIds.length;
      patchRun(run.id, { commentsAdded: added, newThreadIds });
    })
    .catch(() => null);

  let failed: string | null = null;
  let cancelled = false;
  try {
    await tauri.sendPrompt(chat.id, '', [], run.action, (event) => {
      if (event.type === 'permissionRequest') {
        useClaude.setState({
          permission: {
            runId: run.id,
            requestId: event.requestId,
            title: event.title,
            options: event.options,
            diff: event.diff ?? null,
          },
        });
        return;
      }
      if (event.type === 'error') {
        failed = event.message;
        return;
      }
      if (event.type === 'done' && event.stopReason === 'cancelled') {
        cancelled = true;
      }
    });
  } catch (error) {
    failed = tauri.errorMessage(error);
  } finally {
    unlisten?.();
    queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['reviews'] });
  }
  if (failed) {
    toast.error('Claude stopped with an error', { description: friendlyError(failed) });
    return;
  }
  if (cancelled) {
    toast.info('Claude was stopped');
    return;
  }
  const latest = useClaude.getState().runs.find((item) => item.id === run.id) ?? run;
  const finished = { ...latest, ref, newThreadIds };
  const hasTarget = !!ref && (added > 0 || finished.threadIds.length > 0);
  toast.success(finishedMessage(finished, added), {
    duration: hasTarget ? 10_000 : undefined,
    action: hasTarget ? { label: 'View', onClick: () => openRunResult(finished) } : undefined,
  });
}

function threadRef(run: ClaudeRun): string | null {
  const threadId = run.action.kind === 'thread' || run.action.kind === 'resolve' ? run.action.threadId : undefined;
  if (!threadId) {
    return null;
  }
  return refForThread(run.context.repoPath, threadId);
}

async function pump() {
  if (pumping) {
    return;
  }
  pumping = true;
  try {
    for (;;) {
      const next = useClaude.getState().runs.find((run) => run.state === 'queued');
      if (!next) {
        return;
      }
      patchRun(next.id, { state: 'running' });
      try {
        await execute(next);
      } catch (error) {
        toast.error('Could not start Claude', {
          description: friendlyError(tauri.errorMessage(error)),
          action: { label: 'Settings', onClick: () => openSettingsAt('claude') },
        });
      } finally {
        removeRun(next.id);
      }
    }
  } finally {
    pumping = false;
  }
}

export function useThreadActivity(threadId: string): ThreadActivity {
  return useClaude((state) => {
    let activity: ThreadActivity = 'idle';
    for (const run of state.runs) {
      if (!run.threadIds.includes(threadId)) {
        continue;
      }
      if (run.state === 'running') {
        return 'working';
      }
      activity = 'queued';
    }
    return activity;
  });
}

export function useActiveRun(): ClaudeRun | null {
  return useClaude((state) => state.runs.find((run) => run.state === 'running') ?? null);
}

export function useQueuedCount(): number {
  return useClaude((state) => state.runs.filter((run) => run.state === 'queued').length);
}
