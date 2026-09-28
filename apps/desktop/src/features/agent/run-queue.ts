import { create } from 'zustand';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import { GENERAL_FILE_PATH, type AgentAction, type Chat, type Thread } from '@/lib/types';
import { useAgentBus, type AgentThreadActivity } from '@/features/workspace/agent-bus';
import { useAgentStore } from './agent-store';
import { createChat, sendToChat } from './chat-actions';
import type { RunMeta } from './timeline';

export type ThreadAction = Extract<AgentAction, { kind: 'thread' } | { kind: 'reviewFeedback' }>;

export interface RunContext {
  repoPath: string;
  agentId: string;
  agentName: string;
  sessionId: string | null;
}

export interface RunJob {
  id: string;
  action: ThreadAction;
  threadIds: string[];
  title: string;
  detail: string | null;
  sessionId: string | null;
  state: 'queued' | 'running';
  context: RunContext;
}

interface RunQueueState {
  jobs: RunJob[];
}

export const useRunQueue = create<RunQueueState>(() => ({ jobs: [] }));

let counter = 0;
let lastJobChatId: string | null = null;
let waitingForIdle: (() => void) | null = null;

export function isThreadAction(action: AgentAction): action is ThreadAction {
  return action.kind === 'thread' || action.kind === 'reviewFeedback';
}

function findCachedThread(threadId: string): Thread | null {
  const entries = queryClient.getQueriesData<Thread[]>({ queryKey: ['threads'] });
  for (const [, threads] of entries) {
    const found = threads?.find((thread) => thread.id === threadId);
    if (found) {
      return found;
    }
  }
  return null;
}

function threadLocation(thread: Thread) {
  if (thread.filePath === GENERAL_FILE_PATH) {
    return 'general comment';
  }
  const name = thread.filePath.split('/').pop() ?? thread.filePath;
  if (thread.startLine === 0) {
    return name;
  }
  return `${name}:${thread.startLine}`;
}

export function threadActionTitle(action: ThreadAction, threadCount: number) {
  if (action.kind === 'reviewFeedback') {
    if (threadCount === 0) {
      return 'Address review';
    }
    return `Address review · ${threadCount} thread${threadCount === 1 ? '' : 's'}`;
  }
  return 'Reply to thread';
}

function syncThreadActivity() {
  const activity: Record<string, Exclude<AgentThreadActivity, 'idle'>> = {};
  for (const job of useRunQueue.getState().jobs) {
    for (const threadId of job.threadIds) {
      if (activity[threadId] === 'working') {
        continue;
      }
      activity[threadId] = job.state === 'running' ? 'working' : 'queued';
    }
  }
  useAgentBus.getState().setThreadActivity(activity);
}

function updateJob(jobId: string, patch: Partial<RunJob>) {
  useRunQueue.setState((state) => ({
    jobs: state.jobs.map((job) => (job.id === jobId ? { ...job, ...patch } : job)),
  }));
  syncThreadActivity();
}

function removeJob(jobId: string) {
  useRunQueue.setState((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId) }));
  syncThreadActivity();
}

let externalRuns = 0;

function anyChatStreaming() {
  if (externalRuns > 0) {
    return true;
  }
  return Object.values(useAgentStore.getState().runtimes).some((runtime) => runtime.streaming);
}

/** Wraps a run started outside the queue so queued thread runs wait for it, even before it starts streaming. */
export async function trackExternalRun<T>(start: () => Promise<T>): Promise<T> {
  externalRuns++;
  try {
    return await start();
  } finally {
    externalRuns--;
    void pump();
  }
}

function pumpWhenIdle() {
  if (waitingForIdle) {
    return;
  }
  const unsubscribe = useAgentStore.subscribe(() => {
    if (anyChatStreaming()) {
      return;
    }
    unsubscribe();
    waitingForIdle = null;
    void pump();
  });
  waitingForIdle = unsubscribe;
}

async function resolveJobDetails(job: RunJob) {
  if (job.action.kind === 'thread') {
    const thread = findCachedThread(job.action.threadId);
    if (!thread) {
      return;
    }
    updateJob(job.id, { detail: threadLocation(thread), sessionId: thread.sessionId });
    return;
  }
  const review = await api.getReview(job.action.reviewId).catch(() => null);
  if (!review) {
    return;
  }
  updateJob(job.id, {
    threadIds: review.threadIds,
    sessionId: review.sessionId,
    title: threadActionTitle(job.action, review.threadIds.length),
  });
}

/** Queues a `thread` / `reviewFeedback` run. Runs start one after another, never alongside another run. */
export function enqueueThreadAction(action: ThreadAction, context: RunContext) {
  const job: RunJob = {
    id: `job-${Date.now()}-${++counter}`,
    action,
    threadIds: action.kind === 'thread' ? [action.threadId] : [],
    title: threadActionTitle(action, 0),
    detail: null,
    sessionId: null,
    state: 'queued',
    context,
  };
  useRunQueue.setState((state) => ({ jobs: [...state.jobs, job] }));
  syncThreadActivity();
  void resolveJobDetails(job).finally(() => void pump());
}

export function cancelQueuedJob(jobId: string) {
  const job = useRunQueue.getState().jobs.find((item) => item.id === jobId);
  if (!job || job.state !== 'queued') {
    return;
  }
  removeJob(jobId);
}

export function clearQueuedJobs() {
  useRunQueue.setState((state) => ({ jobs: state.jobs.filter((job) => job.state === 'running') }));
  syncThreadActivity();
}

function pickChat(context: RunContext): Chat | null {
  const store = useAgentStore.getState();
  const chats = queryClient.getQueryData<Chat[]>(queryKeys.chats(context.repoPath)) ?? [];
  const current = chats.find((chat) => chat.id === store.activeChatId);
  if (!current || current.mode !== 'resolve' || current.agentId !== context.agentId) {
    return null;
  }
  const runtime = store.runtimes[current.id];
  if (runtime?.streaming) {
    return null;
  }
  const empty = (runtime?.items.length ?? 0) === 0;
  if (!empty && current.id !== lastJobChatId) {
    return null;
  }
  return current;
}

async function runJob(job: RunJob) {
  const { context } = job;
  const sessionId = job.sessionId ?? context.sessionId;
  if (!sessionId) {
    throw new Error('No review session for this thread');
  }
  const chatTitle = job.detail ? `${job.title} · ${job.detail}` : job.title;
  const chat =
    pickChat(context) ??
    (await createChat({
      repoPath: context.repoPath,
      agentId: context.agentId,
      mode: 'resolve',
      sessionId,
      title: chatTitle,
    }));
  lastJobChatId = chat.id;
  useAgentStore.getState().setActiveChat(chat.id);
  useAgentStore.getState().setUiMode('edit');
  const run: RunMeta = {
    kind: job.action.kind,
    title: job.title,
    detail: job.detail,
    threadIds: job.threadIds,
  };
  await sendToChat({
    repoPath: context.repoPath,
    chatId: chat.id,
    sessionId,
    text: '',
    displayText: chatTitle,
    context: [],
    action: job.action,
    agentName: context.agentName,
    run,
  });
}

async function pump() {
  const { jobs } = useRunQueue.getState();
  if (jobs.some((job) => job.state === 'running')) {
    return;
  }
  const next = jobs.find((job) => job.state === 'queued');
  if (!next) {
    return;
  }
  if (anyChatStreaming()) {
    pumpWhenIdle();
    return;
  }
  updateJob(next.id, { state: 'running' });
  try {
    await runJob(next);
  } catch (error) {
    toast.error(`Could not start ${next.context.agentName}`, { description: api.errorMessage(error) });
  } finally {
    removeJob(next.id);
    void pump();
  }
}
