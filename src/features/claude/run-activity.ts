import { create } from 'zustand';
import type { AgentEvent, ChatMessage, ContextChip, PlanEntry, RunModel, SentAs } from '../../lib/types';

export type ActivityItem =
  | { kind: 'thought'; id: string; text: string; startedAt: number | null; endedAt: number | null }
  | { kind: 'text'; id: string; messageId: string; text: string }
  | { kind: 'tool'; id: string; title: string; toolKind: string; status: string; locations: string[]; at: number | null }
  | { kind: 'comment'; id: string; filePath: string; line: number; body: string; at: number };

export interface ActivityLog {
  items: ActivityItem[];
  plan: PlanEntry[];
}

export type RunOutcome = 'running' | 'done' | 'stopped' | 'failed';

/** What an agent run did, kept for a while after it ends so the panel can still show it. */
export interface RunActivity extends ActivityLog {
  runId: string;
  chatId: string | null;
  repoPath: string;
  ref: string | null;
  agentId: string;
  model: RunModel | null;
  actionKind: string;
  startedAt: number;
  endedAt: number | null;
  outcome: RunOutcome;
  /** Held back by a run in the same project from another window. */
  waiting: boolean;
  /** What was typed, for a message sent from the Claude panel. */
  prompt: { text: string; chips: ContextChip[]; sentAs: SentAs | null } | null;
}

interface ActivityState {
  byRun: Record<string, RunActivity>;
}

/** What agent runs are doing and recently did, by run. Several can run in a project at once (reviews beside an edit). */
export const useRunActivity = create<ActivityState>(() => ({ byRun: {} }));

/** Finished runs kept for the panel, besides the ones still running. */
const KEEP_FINISHED = 20;

/** A project's runs, newest first; with `inView`, only those in the views it accepts. */
export function projectActivities(byRun: Record<string, RunActivity>, repoPath: string, inView?: (ref: string | null) => boolean): RunActivity[] {
  return Object.values(byRun)
    .filter((activity) => activity.repoPath === repoPath && (!inView || inView(activity.ref)))
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** The project's latest run, running ones first. */
export function latestActivity(byRun: Record<string, RunActivity>, repoPath: string): RunActivity | null {
  const all = projectActivities(byRun, repoPath);
  return all.find((activity) => activity.outcome === 'running') ?? all[0] ?? null;
}

/** Folds events into the log: streamed thought and text chunks join the item before them, tool updates patch their call. */
export function applyEvents(log: ActivityLog, events: AgentEvent[], at: number | null): ActivityLog {
  if (events.length === 0) {
    return log;
  }
  const items = [...log.items];
  let plan = log.plan;
  const closeThought = () => {
    const last = items[items.length - 1];
    if (last?.kind === 'thought' && last.endedAt === null && at !== null) {
      items[items.length - 1] = { ...last, endedAt: at };
    }
  };
  for (const event of events) {
    const last = items[items.length - 1];
    switch (event.type) {
      case 'thought':
        if (last?.kind === 'thought') {
          items[items.length - 1] = { ...last, text: last.text + event.delta };
        } else {
          items.push({ kind: 'thought', id: `thought-${items.length}`, text: event.delta, startedAt: at, endedAt: null });
        }
        break;
      case 'text': {
        const index = openText(items, event.messageId);
        if (index !== -1) {
          const item = items[index] as Extract<ActivityItem, { kind: 'text' }>;
          items[index] = { ...item, text: item.text + event.delta };
        } else {
          closeThought();
          items.push({ kind: 'text', id: `text-${items.length}`, messageId: event.messageId, text: event.delta });
        }
        break;
      }
      case 'toolCall': {
        closeThought();
        const index = findTool(items, event.id);
        const item = { kind: 'tool' as const, id: event.id, title: event.title, toolKind: event.kind, status: event.status, locations: event.locations, at };
        if (index === -1) {
          items.push(item);
        } else {
          items[index] = { ...item, at: (items[index] as Extract<ActivityItem, { kind: 'tool' }>).at };
        }
        break;
      }
      case 'toolCallUpdate': {
        const index = findTool(items, event.id);
        if (index !== -1) {
          const tool = items[index] as Extract<ActivityItem, { kind: 'tool' }>;
          items[index] = {
            ...tool,
            status: event.status,
            title: event.title ?? tool.title,
            toolKind: event.kind ?? tool.toolKind,
            locations: event.locations ? [...new Set([...tool.locations, ...event.locations])] : tool.locations,
          };
        }
        break;
      }
      case 'plan':
        plan = event.entries;
        break;
      case 'done':
      case 'error':
        closeThought();
        break;
    }
  }
  return { items, plan };
}

/** The message a text chunk continues; comments the agent posts mid-message land after it without splitting it. */
function openText(items: ActivityItem[], messageId: string): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === 'text') {
      return item.messageId === messageId ? index : -1;
    }
    if (item.kind !== 'comment') {
      return -1;
    }
  }
  return -1;
}

function findTool(items: ActivityItem[], id: string): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === 'tool' && item.id === id) {
      return index;
    }
  }
  return -1;
}

/** A saved chat's agent turns as one log; saved events carry no times. */
export function logFromMessages(messages: ChatMessage[]): ActivityLog {
  let log: ActivityLog = { items: [], plan: [] };
  for (const message of messages) {
    if (message.role === 'agent' && Array.isArray(message.content)) {
      log = applyEvents(log, message.content, null);
    }
  }
  return log;
}

/** The model of the chat's latest turn that recorded one. */
export function modelFromMessages(messages: ChatMessage[]): RunModel | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const content = messages[index].content;
    if (messages[index].role === 'user' && !Array.isArray(content) && content.model) {
      return content.model;
    }
  }
  return null;
}

export function relativePath(repoPath: string, path: string): string {
  const root = repoPath.endsWith('/') ? repoPath : `${repoPath}/`;
  return path.startsWith(root) ? path.slice(root.length) : path;
}

/** Repo files the agent read, in the order it first opened them. */
export function filesRead(log: ActivityLog, repoPath: string): string[] {
  const seen = new Set<string>();
  for (const item of log.items) {
    if (item.kind === 'tool' && item.toolKind === 'read') {
      for (const location of item.locations) {
        seen.add(relativePath(repoPath, location));
      }
    }
  }
  return [...seen];
}

export function toolCount(log: ActivityLog): number {
  return log.items.filter((item) => item.kind === 'tool').length;
}

/** The file a still-running tool call is on, if any. */
export function currentFile(log: ActivityLog, repoPath: string): string | null {
  for (let index = log.items.length - 1; index >= 0; index -= 1) {
    const item = log.items[index];
    if (item.kind === 'tool') {
      const running = item.status === 'pending' || item.status === 'in_progress';
      return running && item.locations[0] ? relativePath(repoPath, item.locations[0]) : null;
    }
  }
  return null;
}

/** The agent's closing message and where it sits, when the run ends on one; for a review it's the wrap-up. */
export function wrapUp(log: ActivityLog): { text: string; index: number } | null {
  for (let index = log.items.length - 1; index >= 0; index -= 1) {
    const item = log.items[index];
    if (item.kind === 'text') {
      const text = item.text.trim();
      return text ? { text, index } : null;
    }
    if (item.kind !== 'comment') {
      return null;
    }
  }
  return null;
}

function patch(runId: string, change: (activity: RunActivity) => RunActivity) {
  useRunActivity.setState((state) => {
    const activity = state.byRun[runId];
    if (!activity) {
      return state;
    }
    return { byRun: { ...state.byRun, [runId]: change(activity) } };
  });
}

const buffers = new Map<string, AgentEvent[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** Applies buffered events; thought chunks arrive many times a second, so the store changes at most every 100ms. */
export function flushActivity() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const now = Date.now();
  for (const [runId, events] of buffers) {
    patch(runId, (activity) => ({ ...activity, ...applyEvents(activity, events, now), waiting: false }));
  }
  buffers.clear();
}

export function startActivity(activity: Omit<RunActivity, 'items' | 'plan' | 'endedAt' | 'outcome' | 'waiting'>) {
  useRunActivity.setState((state) => {
    const dropped = Object.values(state.byRun)
      .filter((item) => item.outcome !== 'running')
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(KEEP_FINISHED);
    const byRun = { ...state.byRun };
    for (const old of dropped) {
      delete byRun[old.runId];
    }
    byRun[activity.runId] = { ...activity, items: [], plan: [], endedAt: null, outcome: 'running', waiting: false };
    return { byRun };
  });
}

export function recordEvent(runId: string, event: AgentEvent) {
  if (event.type === 'waiting') {
    patch(runId, (activity) => ({ ...activity, waiting: true }));
    return;
  }
  buffers.set(runId, [...(buffers.get(runId) ?? []), event]);
  flushTimer ??= setTimeout(flushActivity, 100);
}

export function recordComments(runId: string, comments: Extract<ActivityItem, { kind: 'comment' }>[]) {
  flushActivity();
  patch(runId, (activity) => {
    const known = new Set(activity.items.filter((item) => item.kind === 'comment').map((item) => item.id));
    const fresh = comments.filter((comment) => !known.has(comment.id));
    return fresh.length > 0 ? { ...activity, items: [...activity.items, ...fresh] } : activity;
  });
}

export function finishActivity(runId: string, outcome: Exclude<RunOutcome, 'running'>) {
  flushActivity();
  const now = Date.now();
  patch(runId, (activity) => ({ ...activity, ...applyEvents(activity, [{ type: 'done', stopReason: outcome }], now), endedAt: now, outcome }));
}
