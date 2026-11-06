import { create } from 'zustand';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { openComments, openSettingsAt } from '../../lib/ui-store';
import type { AgentAction, AgentInfo, AgentMode, PermissionDiff, PermissionOption, RepoThread, RunModel, Thread } from '../../lib/types';
import { parseCommitRef, refForSession } from '../../lib/api';
import { TREE_REF } from '../../lib/types';
import { goToGuide, goToThread, viewLabel } from '../../lib/thread-location';
import type { CommentThread } from '../../components/comments/types';
import { getPermissionSetting, runSkipsPrompts, showBypassNotice } from './permission-setting';
import { getRunPick, pickForAgent, type ModelPurpose, type RunPick } from './model-setting';
import { agentByName, agentMeta, type AgentMeta } from './agents';
import { mentionedAgent } from '../../lib/mentions';
import { finishActivity, recordComments, recordEvent, startActivity } from './run-activity';
import { isGuideOnScreen } from '../guide/guide-on-screen';
import { repoBase } from '../../hooks/use-repo';
import { addressedThreadIds, reviewAddressed, reviewFixesLabel } from '../comments/addressed';

export type ClaudeAction = Extract<
  AgentAction,
  { kind: 'review' } | { kind: 'guide' } | { kind: 'chat' } | { kind: 'resolve' } | { kind: 'thread' } | { kind: 'reviewFeedback' }
>;

export interface ClaudeRunContext {
  repoPath: string;
  sessionId: string | null;
  ref?: string | null;
  /** GitHub threads whose new agent reply should be posted back to GitHub when the run ends. */
  postRepliesToGitHub?: string[];
  /** What the user asked for, sent as the run's message (a `chat` run: changes to make). */
  text?: string;
  /** Agent and model picked for this run; unset uses the thread's agent (thread runs), then the repo's last pick, then Settings. */
  pick?: RunPick;
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
  /** Threads the agent started during the run, oldest first. */
  newThreadIds: string[];
  /** The agent doing the run, once it starts. */
  agentId: string | null;
  /** The run edits without any permission prompts (Settings → Agents → Permissions). */
  skipsPrompts: boolean;
  /** Stop was pressed before the chat started. */
  stopRequested?: boolean;
  /** The user chose "Allow for this run": later edits in this run are approved automatically. */
  editsApproved: boolean;
  /** Model and effort the run uses, once it starts. */
  model: RunModel | null;
  /** How the run ended; unset when it never got going (no agent, an error before the chat started). */
  outcome?: RunOutcome;
}

export type RunOutcome = 'done' | 'failed' | 'stopped';

export interface RunEnd {
  repoPath: string;
  outcome: RunOutcome;
  actionKind: ClaudeAction['kind'];
}

export interface RunStart {
  repoPath: string;
  actionKind: ClaudeAction['kind'];
}

const runEndListeners = new Set<(end: RunEnd) => void>();
const runStartListeners = new Set<(start: RunStart) => void>();
let isTaskPath: (repoPath: string) => boolean = () => false;
let taskLimit = 4;

/** Called when a run starts in any project (after any wait for a free task slot). */
export function onRunStart(listener: (start: RunStart) => void): () => void {
  runStartListeners.add(listener);
  return () => {
    runStartListeners.delete(listener);
  };
}

/** Lets the tasks feature mark runs in task folders: they edit without prompts inside the folder (Task mode),
 * share the parallel limit, and announce their own results. */
export function setTaskPathCheck(check: (repoPath: string) => boolean) {
  isTaskPath = check;
}

export function setTaskLimit(limit: number) {
  taskLimit = Math.max(1, limit);
}

function runningTaskRuns(): number {
  return useClaude.getState().runs.filter((run) => run.state === 'running' && isTaskPath(run.context.repoPath)).length;
}

function nextRunChange(): Promise<void> {
  return new Promise<void>((resolve) => {
    const unsubscribe = useClaude.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

/** Called after every run in any project, once it has left the queue. */
export function onRunEnd(listener: (end: RunEnd) => void): () => void {
  runEndListeners.add(listener);
  return () => {
    runEndListeners.delete(listener);
  };
}

export interface ClaudePermission {
  runId: string;
  repoPath: string;
  requestId: string;
  title: string;
  options: PermissionOption[];
  diff: PermissionDiff | null;
}

interface ClaudeState {
  runs: ClaudeRun[];
  /** Waiting approvals, oldest first; runs in different projects can ask at the same time. */
  permissions: ClaudePermission[];
}

export const useClaude = create<ClaudeState>(() => ({ runs: [], permissions: [] }));

export type ThreadActivity = 'idle' | 'queued' | 'working';

let counter = 0;
const pumping = new Set<string>();

/** Where an agent may edit files: it edits the working tree, so not on an old commit or a range away from HEAD. */
export function canSendToClaude(diffRef: string | null | undefined): boolean {
  if (!diffRef) {
    return true;
  }
  if (diffRef === 'work' || diffRef === 'staged' || diffRef === 'unstaged' || diffRef === TREE_REF) {
    return true;
  }
  if (parseCommitRef(diffRef)) {
    return false;
  }
  if (diffRef.includes('..')) {
    const head = diffRef.split(/\.{2,3}/)[1];
    return !head || head === 'HEAD';
  }
  return true;
}

/** Agents edit the checked-out code, so a commit or range can be worked on only when its newer side is HEAD. */
export async function canEditRef(repoPath: string, ref: string | null | undefined): Promise<boolean> {
  if (!ref || canSendToClaude(ref)) {
    return true;
  }
  try {
    const [view, work] = await Promise.all([tauri.resolveRef(repoPath, ref), tauri.resolveRef(repoPath, 'work')]);
    return !!view.headSha && view.headSha === work.headSha;
  } catch {
    return false;
  }
}

export function useCanEditRef(repoPath: string, ref: string | null | undefined): boolean {
  const quick = !ref || canSendToClaude(ref);
  const { data } = useQuery({
    queryKey: ['can-edit-ref', repoPath, ref],
    queryFn: () => canEditRef(repoPath, ref),
    enabled: !quick,
    staleTime: 5_000,
  });
  return quick || data === true;
}

export function modelPurpose(action: ClaudeAction): ModelPurpose {
  return action.kind === 'review' || action.kind === 'guide' ? 'review' : 'fix';
}

function modeFor(action: ClaudeAction, editable: boolean, inTask: boolean): AgentMode {
  if (action.kind === 'review' || action.kind === 'guide' || !editable) {
    return 'review';
  }
  return inTask ? 'task' : 'resolve';
}

export function runLabel(action: ClaudeAction, name: string): string {
  switch (action.kind) {
    case 'review':
      return `${name} is reviewing`;
    case 'guide':
      return `${name} is writing a guide`;
    case 'chat':
      return `${name} is making changes`;
    case 'resolve':
      if (action.threadIds && action.threadIds.length > 0) {
        return `${name} is working on ${action.threadIds.length} comment${action.threadIds.length === 1 ? '' : 's'}`;
      }
      return action.threadId ? `${name} is working on a comment` : `${name} is resolving`;
    case 'thread':
      return `${name} is replying`;
    case 'reviewFeedback':
      return `${name} is working through your review`;
  }
}

function chatTitle(action: ClaudeAction): string {
  switch (action.kind) {
    case 'review':
      return action.focus ? `Review (${action.focus}) · ${action.ref}` : `Review · ${action.ref}`;
    case 'guide':
      return `Guide · ${action.ref}`;
    case 'chat':
      return 'Make changes';
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
    permissions: state.permissions.filter((permission) => permission.runId !== runId),
  }));
}

function initialThreadIds(action: ClaudeAction, sessionId: string | null): string[] {
  if (action.kind === 'thread') {
    return [action.threadId];
  }
  if (action.kind === 'resolve') {
    if (action.threadIds && action.threadIds.length > 0) {
      return action.threadIds;
    }
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
    ref: action.kind === 'review' || action.kind === 'guide' ? action.ref : context.ref ?? refForSession(context.sessionId),
    newThreadIds: [],
    agentId: null,
    skipsPrompts: false,
    editsApproved: false,
    model: null,
  };
  useClaude.setState((state) => ({ runs: [...state.runs, run] }));
  void pump(context.repoPath);
}

const MAX_REPEATS = 20;
const repeats = new Map<string, { action: ClaudeAction; context: ClaudeRunContext }>();

/** Keeps what a run was asked to do, with the agent and model it used, so "Run again" can repeat it. */
export function rememberRun(runId: string, action: ClaudeAction, context: ClaudeRunContext) {
  repeats.delete(runId);
  repeats.set(runId, { action, context });
  while (repeats.size > MAX_REPEATS) {
    const oldest = repeats.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    repeats.delete(oldest);
  }
}

export function canRunAgain(runId: string): boolean {
  return repeats.has(runId);
}

/** Queues the same action again, with the same threads, note and model. */
export function runAgain(runId: string): boolean {
  const repeat = repeats.get(runId);
  if (!repeat) {
    return false;
  }
  enqueueClaude(repeat.action, repeat.context);
  return true;
}

function againAction(runId: string) {
  return { label: 'Run again', onClick: () => void runAgain(runId) };
}

/** Drops a run that has not started yet; a running one keeps going. */
export function cancelQueuedRun(runId: string) {
  useClaude.setState((state) => ({ runs: state.runs.filter((run) => run.id !== runId || run.state !== 'queued') }));
}

/** Stops the project's running run and drops the ones queued behind it. */
export async function stopClaude(repoPath: string) {
  const { runs, permissions } = useClaude.getState();
  const running = runs.find((run) => run.state === 'running' && run.context.repoPath === repoPath);
  useClaude.setState((state) => ({
    runs: state.runs.filter((run) => run.context.repoPath !== repoPath || run.state === 'running'),
  }));
  if (!running) {
    return;
  }
  if (!running.chatId) {
    patchRun(running.id, { stopRequested: true });
    return;
  }
  const waiting = permissions.filter((permission) => permission.runId === running.id);
  for (const permission of waiting) {
    await answerClaudePermission(permission.requestId, null);
  }
  await tauri.cancelPrompt(running.chatId).catch(() => undefined);
}

export async function answerClaudePermission(requestId: string, optionId: string | null, forRun = false, skipPrompts = false) {
  const permission = useClaude.getState().permissions.find((item) => item.requestId === requestId);
  if (!permission) {
    return;
  }
  useClaude.setState((state) => ({ permissions: state.permissions.filter((item) => item.requestId !== requestId) }));
  if (optionId && forRun && permission.diff) {
    patchRun(permission.runId, { editsApproved: true });
  }
  await tauri.respondPermission(permission.requestId, optionId, forRun, skipPrompts).catch((error) => {
    toast.error(tauri.errorMessage(error));
  });
}

function agentProblem(meta: AgentMeta, agent: AgentInfo | undefined): string | null {
  if (!agent) {
    return `${meta.name} was not found.`;
  }
  if (!agent.installed) {
    return agent.note ?? `${meta.name} is not installed. Install it with \`${meta.install}\` and try again.`;
  }
  if (agent.authenticated === false) {
    return agent.note ?? `${meta.name} is not logged in. ${meta.login}`;
  }
  return null;
}

/** For a thread run, the agent of the newest comment that names one: a user's mention, or an agent's own comment. */
async function threadAgent(action: ClaudeAction, sessionId: string): Promise<string | null> {
  if (action.kind !== 'thread') {
    return null;
  }
  const threads = await tauri.listThreads(sessionId).catch(() => []);
  const thread = threads.find((item) => item.id === action.threadId);
  return agentOfComments(thread?.comments ?? []);
}

export function agentOfComments(comments: { authorType: string; authorName: string; body: string }[]): string | null {
  for (const comment of [...comments].reverse()) {
    if (comment.authorType === 'agent') {
      return agentByName(comment.authorName)?.id ?? null;
    }
    const mentioned = comment.authorType === 'user' ? mentionedAgent(comment.body) : null;
    if (mentioned) {
      return mentioned;
    }
  }
  return null;
}

async function pickFor(run: ClaudeRun, sessionId: string): Promise<RunPick> {
  if (run.context.pick) {
    return run.context.pick;
  }
  const base = await getRunPick(modelPurpose(run.action), run.context.repoPath);
  const agentId = await threadAgent(run.action, sessionId);
  return agentId ? pickForAgent(base, agentId) : base;
}

async function resolveSession(run: ClaudeRun): Promise<string> {
  const { action, context } = run;
  if (action.kind === 'review' || action.kind === 'guide') {
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
    throw new Error('There are no changes here for the agent to work on. Open a diff and try again.');
  }
  return context.sessionId;
}

interface ClaudeFailure {
  code: string;
  message: string;
}

function toFailure(error: unknown): ClaudeFailure {
  if (tauri.isAppError(error)) {
    return { code: error.code, message: error.message };
  }
  return { code: '', message: tauri.errorMessage(error) };
}

function summarize(message: string): string {
  const first = message.trim().split('\n')[0] ?? '';
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

/** Plain message for known failures; raw output stays behind "Copy details". */
function showFailure(title: string, failure: ClaudeFailure, meta: AgentMeta | null, again?: { label: string; onClick: () => void }) {
  const name = meta?.name ?? 'The agent';
  if (failure.code === 'agent_auth_required') {
    toast.error(title, {
      description: `${name} is not logged in.${meta ? ` ${meta.login}` : ''}`,
      action: { label: 'Agent settings', onClick: () => openSettingsAt('agents') },
    });
    return;
  }
  if (failure.code === 'agent_not_installed') {
    toast.error(title, {
      description: `${name} is not installed.${meta ? ` Install it with \`${meta.install}\` and try again.` : ''}`,
      action: { label: 'Agent settings', onClick: () => openSettingsAt('agents') },
    });
    return;
  }
  const multiline = failure.message.trim().includes('\n');
  const details = multiline
    ? { label: 'Copy details', onClick: () => void navigator.clipboard.writeText(failure.message).catch(() => undefined) }
    : undefined;
  toast.error(title, {
    description: summarize(failure.message) || undefined,
    action: again ?? details,
    cancel: again ? details : undefined,
  });
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

/** Opens the run's view at the first of `threadIds` still on the diff; with several, the Comments panel lists them all. */
export function openRunResult(repoPath: string, ref: string | null, threadIds: string[]) {
  if (!ref) {
    return;
  }
  const repoThreads = cachedRepoThreads(repoPath);
  const onDiff = threadIds.filter((id) => (repoThreads.find((thread) => thread.id === id)?.anchor ?? 'current') === 'current');
  if (threadIds.length > 1 || onDiff.length < threadIds.length) {
    openComments();
  }
  goToThread(repoPath, { ref, threadId: onDiff[0] ?? null });
}

/** Whether the diff of `ref` is the view on screen, so a message about it need not name it. */
function diffOnScreen(repoPath: string, ref: string): boolean {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?');
  if (path !== `${repoBase(repoPath)}/diff`) {
    return false;
  }
  return (new URLSearchParams(query).get('ref') || 'work') === ref;
}

function finishedMessage(run: ClaudeRun, added: number, name: string): string {
  const where = run.ref && !diffOnScreen(run.context.repoPath, run.ref) ? ` on ${runViewLabel(run.context.repoPath, run.ref)}` : '';
  if (run.action.kind === 'review') {
    if (added === 0) {
      return `${name} finished reviewing${where} — no comments`;
    }
    return `${name} left ${added} comment${added === 1 ? '' : 's'}${where}`;
  }
  if (run.action.kind === 'thread') {
    return `${name} replied${where}`;
  }
  if (run.action.kind === 'chat') {
    return `${name} finished the changes${where}`;
  }
  return `${name} finished${where}`;
}

async function postRepliesToGitHub(sessionId: string, threadIds: string[], name: string): Promise<number> {
  if (threadIds.length === 0) {
    return 0;
  }
  const threads = await tauri.listThreads(sessionId).catch(() => []);
  let posted = 0;
  for (const thread of threads.filter((item) => threadIds.includes(item.id))) {
    const last = thread.comments[thread.comments.length - 1];
    if (!last || last.authorType !== 'agent' || last.githubCommentId) {
      continue;
    }
    try {
      await tauri.githubPostComment(last.id);
      posted += 1;
    } catch (error) {
      toast.error(`Could not post ${name}’s reply to GitHub`, { description: tauri.errorMessage(error) });
    }
  }
  if (posted > 0) {
    queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
  }
  return posted;
}

function batchOutcome(threads: Thread[], threadIds: string[], name: string): { title: string; detail: string | null } | null {
  if (threadIds.length === 0) {
    return null;
  }
  const worked = threads.filter((thread) => threadIds.includes(thread.id));
  // Your threads stay open once the agent is done with them, marked addressed, until you resolve them.
  const resolved = worked.filter((thread) => thread.status !== 'open' || !!thread.addressedBy).length;
  const replied = worked.filter((thread) => thread.status === 'open' && !thread.addressedBy && thread.comments[thread.comments.length - 1]?.authorType === 'agent').length;
  const untouched = worked.length - resolved - replied;
  const plural = (count: number) => `${count} comment${count === 1 ? '' : 's'}`;
  if (resolved + replied === 0) {
    return worked.length > 0 ? { title: `${name} skipped ${plural(worked.length)}`, detail: null } : null;
  }
  if (untouched === 0 && resolved === 0) {
    return { title: `${name} replied to ${plural(replied)}`, detail: null };
  }
  if (untouched === 0 && replied === 0) {
    return { title: `${name} addressed ${plural(resolved)}`, detail: null };
  }
  const parts = [
    resolved > 0 ? `${resolved} addressed` : null,
    replied > 0 ? `${replied} replied` : null,
    untouched > 0 ? `${untouched} skipped` : null,
  ].filter(Boolean);
  return { title: `${name} handled ${resolved + replied} of ${plural(worked.length)}`, detail: parts.join(' · ') };
}

async function execute(run: ClaudeRun) {
  const sessionId = await resolveSession(run);
  const pick = await pickFor(run, sessionId);
  const meta = agentMeta(pick.agent);
  patchRun(run.id, { agentId: pick.agent });
  rememberRun(run.id, run.action, { ...run.context, pick });
  const agents = await tauri.listAgents();
  const agent = agents.find((item) => item.id === pick.agent);
  const problem = agentProblem(meta, agent);
  if (problem || !agent) {
    toast.error(`Could not start ${meta.short}`, {
      description: problem ?? undefined,
      action: { label: 'Agent settings', onClick: () => openSettingsAt('agents') },
    });
    return;
  }
  const ref = run.ref ?? refForSession(sessionId) ?? threadRef(run);
  run = { ...run, ref };
  const inTask = isTaskPath(run.context.repoPath);
  const mode = modeFor(run.action, await canEditRef(run.context.repoPath, ref), inTask);
  const chat = await tauri.startChat({
    repoPath: run.context.repoPath,
    agentId: agent.id,
    mode,
    sessionId,
    title: chatTitle(run.action),
  });
  const skipsPrompts = runSkipsPrompts(mode, run.action, await getPermissionSetting());
  const model: RunModel = { model: pick.model, effort: pick.effort };
  const startedAt = Date.now();
  patchRun(run.id, { chatId: chat.id, sessionId, startedAt, ref, skipsPrompts, model });
  const repoPath = run.context.repoPath;
  startActivity({ runId: run.id, chatId: chat.id, repoPath, ref, agentId: agent.id, model, actionKind: run.action.kind, startedAt });
  if (useClaude.getState().runs.find((item) => item.id === run.id)?.stopRequested) {
    patchRun(run.id, { outcome: 'stopped' });
    finishActivity(repoPath, run.id, 'stopped');
    toast.info(`${meta.short} was stopped`, { action: againAction(run.id) });
    return;
  }
  if (skipsPrompts && !inTask) {
    showBypassNotice(meta.short, () => openSettingsAt('agents'));
  }

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
      const fresh = new Set(newThreadIds);
      recordComments(
        repoPath,
        run.id,
        threads
          .filter((thread) => fresh.has(thread.id))
          .map((thread) => ({ kind: 'comment' as const, id: thread.id, filePath: thread.filePath, line: thread.startLine, body: thread.comments[0]?.body ?? '', at: Date.now() })),
      );
    })
    .catch(() => null);

  let failed: ClaudeFailure | null = null;
  let cancelled = false;
  try {
    await tauri.sendPrompt(chat.id, run.context.text ?? '', [], run.action, model, (event) => {
      if (event.type === 'permissionRequest') {
        const permission: ClaudePermission = {
          runId: run.id,
          repoPath: run.context.repoPath,
          requestId: event.requestId,
          title: event.title,
          options: event.options,
          diff: event.diff ?? null,
        };
        useClaude.setState((state) => ({ permissions: [...state.permissions, permission] }));
        return;
      }
      recordEvent(repoPath, run.id, event);
      if (event.type === 'error') {
        failed = { code: event.code ?? '', message: event.message };
        return;
      }
      if (event.type === 'done' && event.stopReason === 'cancelled') {
        cancelled = true;
      }
    });
  } catch (error) {
    failed = toFailure(error);
  } finally {
    unlisten?.();
    queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['reviews'] });
    queryClient.invalidateQueries({ queryKey: ['guide', sessionId] });
  }
  const outcome: RunOutcome = failed ? 'failed' : cancelled ? 'stopped' : 'done';
  patchRun(run.id, { outcome });
  finishActivity(repoPath, run.id, outcome);
  if (failed) {
    showFailure(`${meta.short} stopped with an error`, failed, meta, againAction(run.id));
    return;
  }
  if (cancelled) {
    toast.info(`${meta.short} was stopped`, { action: againAction(run.id) });
    return;
  }
  if (inTask && run.action.kind === 'chat') {
    return;
  }
  if (run.action.kind === 'guide') {
    const guide = await tauri.getGuide(sessionId).catch(() => null);
    if (!guide || Date.parse(guide.createdAt) < startedAt) {
      toast.error(`${meta.short} finished without saving a guide`, { description: 'Open the activity to see what it did, then try again.' });
      return;
    }
    const chapters = `${guide.chapters.length} chapter${guide.chapters.length === 1 ? '' : 's'}`;
    const elsewhere = !!ref && !isGuideOnScreen(run.context.repoPath, ref);
    toast.success(`${meta.short} wrote a guide · ${chapters}`, {
      description: elsewhere && ref ? runViewLabel(run.context.repoPath, ref) : undefined,
      action: elsewhere && ref ? { label: 'Open guide', onClick: () => goToGuide(run.context.repoPath, ref) } : undefined,
    });
    return;
  }
  const latest = useClaude.getState().runs.find((item) => item.id === run.id) ?? run;
  const finished = { ...latest, ref, newThreadIds };
  const after = await tauri.listThreads(sessionId).catch(() => []);
  // Only threads still open need the user; resolved ones are done and would just bury them.
  const touched = new Set([...newThreadIds, ...finished.threadIds]);
  const needsYou = after.filter((thread) => touched.has(thread.id) && thread.status === 'open').map((thread) => thread.id);
  const addressed = addressedThreadIds(after, touched);
  const hasTarget = !!ref && needsYou.length > 0;
  const batch = run.action.kind === 'resolve' ? batchOutcome(after, finished.threadIds, meta.short) : null;
  const posted = await postRepliesToGitHub(sessionId, run.context.postRepliesToGitHub ?? [], meta.short);
  const postedNote = posted > 0 ? `Posted ${posted} repl${posted === 1 ? 'y' : 'ies'} to GitHub` : null;
  const checkNote = addressed.length > 0 ? `Check ${addressed.length === 1 ? 'it' : 'each'}, then resolve. ] goes to the next.` : null;
  const description = (batch ? [batch.detail, postedNote, checkNote] : [postedNote, checkNote]).filter(Boolean).join(' · ') || undefined;
  const showAction = hasTarget ? { label: needsYou.length === 1 ? 'Show comment' : `Show ${needsYou.length} open`, onClick: () => openRunResult(run.context.repoPath, ref, needsYou) } : undefined;
  toast.success(batch?.title ?? finishedMessage(finished, added, meta.short), {
    description,
    duration: hasTarget ? 12_000 : undefined,
    action: ref && addressed.length > 0 ? { label: reviewFixesLabel(addressed.length), onClick: () => reviewAddressed(run.context.repoPath, ref, addressed) } : showAction,
  });
}

function threadRef(run: ClaudeRun): string | null {
  const threadId = run.action.kind === 'thread' || run.action.kind === 'resolve' ? run.action.threadId : undefined;
  if (!threadId) {
    return null;
  }
  return refForThread(run.context.repoPath, threadId);
}

/** Runs one at a time per project, since they edit the same working tree; projects run side by side. */
async function pump(repoPath: string) {
  if (pumping.has(repoPath)) {
    return;
  }
  pumping.add(repoPath);
  try {
    for (;;) {
      const next = useClaude.getState().runs.find((run) => run.state === 'queued' && run.context.repoPath === repoPath);
      if (!next) {
        return;
      }
      // Task runs wait for a free slot. The last check and the switch to running happen with no await in between, so
      // several waiting task folders can't all take the one slot that just opened.
      let dropped = false;
      while (isTaskPath(repoPath) && runningTaskRuns() >= taskLimit) {
        await nextRunChange();
        if (!useClaude.getState().runs.some((run) => run.id === next.id)) {
          dropped = true;
          break;
        }
      }
      if (dropped) {
        continue;
      }
      patchRun(next.id, { state: 'running' });
      for (const listener of runStartListeners) {
        listener({ repoPath, actionKind: next.action.kind });
      }
      rememberRun(next.id, next.action, next.context);
      try {
        await execute(next);
      } catch (error) {
        const agentId = useClaude.getState().runs.find((run) => run.id === next.id)?.agentId;
        const meta = agentId ? agentMeta(agentId) : null;
        showFailure(`Could not start ${meta?.short ?? 'the agent'}`, toFailure(error), meta, againAction(next.id));
      } finally {
        const outcome = useClaude.getState().runs.find((run) => run.id === next.id)?.outcome ?? 'failed';
        removeRun(next.id);
        for (const listener of runEndListeners) {
          listener({ repoPath, outcome, actionKind: next.action.kind });
        }
      }
    }
  } finally {
    pumping.delete(repoPath);
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

/** The agent of the run working on (or queued for) a thread, once it is known. */
export function useThreadRunAgent(threadId: string): string | null {
  return useClaude((state) => state.runs.find((run) => run.threadIds.includes(threadId))?.agentId ?? null);
}

/** Threads that are queued or being worked on by any agent run. */
export function useBusyThreadIds(): Set<string> {
  const runs = useClaude((state) => state.runs);
  return new Set(runs.flatMap((run) => run.threadIds));
}

export function useActiveRun(repoPath: string): ClaudeRun | null {
  return useClaude((state) => state.runs.find((run) => run.state === 'running' && run.context.repoPath === repoPath) ?? null);
}

export function useQueuedCount(repoPath: string): number {
  return useClaude((state) => state.runs.filter((run) => run.state === 'queued' && run.context.repoPath === repoPath).length);
}

/** Projects with an agent run going. */
export function useBusyRepoPaths(): Set<string> {
  const runs = useClaude((state) => state.runs);
  return new Set(runs.filter((run) => run.state === 'running').map((run) => run.context.repoPath));
}
