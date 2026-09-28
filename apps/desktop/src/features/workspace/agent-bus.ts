import { create } from 'zustand';
import type { AgentAction, ContextChip } from '@/lib/types';

export type AgentBusRequest =
  | { id: string; type: 'ask'; chip: ContextChip }
  | { id: string; type: 'action'; action: AgentAction; context?: ContextChip[] };

interface AgentBusState {
  queue: AgentBusRequest[];
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  askAboutSelection: (chip: ContextChip) => void;
  runAction: (action: AgentAction, context?: ContextChip[]) => void;
  /** AgentPanel calls this to take ownership of all pending requests. */
  drain: () => AgentBusRequest[];
  /** Threads the agent is currently working on (a `thread` / `reviewFeedback` run is in progress). */
  activeThreadIds: string[];
  /** Per-thread agent activity; threads not listed are idle. Written by the agent feature. */
  threadActivity: Record<string, Exclude<AgentThreadActivity, 'idle'>>;
  setThreadActivity: (activity: Record<string, Exclude<AgentThreadActivity, 'idle'>>) => void;
}

export type AgentThreadActivity = 'idle' | 'queued' | 'working';

let counter = 0;
const nextId = () => `req-${Date.now()}-${++counter}`;

export const useAgentBus = create<AgentBusState>((set, get) => ({
  queue: [],
  panelOpen: true,
  setPanelOpen: (open) => set({ panelOpen: open }),
  askAboutSelection: (chip) =>
    set((state) => ({ panelOpen: true, queue: [...state.queue, { id: nextId(), type: 'ask', chip }] })),
  runAction: (action, context) =>
    set((state) => ({ panelOpen: true, queue: [...state.queue, { id: nextId(), type: 'action', action, context }] })),
  drain: () => {
    const pending = get().queue;
    if (pending.length === 0) {
      return pending;
    }
    set({ queue: [] });
    return pending;
  },
  activeThreadIds: [],
  threadActivity: {},
  setThreadActivity: (activity) =>
    set({
      threadActivity: activity,
      activeThreadIds: Object.keys(activity).filter((threadId) => activity[threadId] === 'working'),
    }),
}));

/** Whether the agent is working on (or has queued work for) a thread. */
export function useAgentThreadActivity(threadId: string): AgentThreadActivity {
  return useAgentBus((state) => state.threadActivity[threadId] ?? 'idle');
}

export const agentBus = {
  askAboutSelection: (chip: ContextChip) => useAgentBus.getState().askAboutSelection(chip),
  runAction: (action: AgentAction, context?: ContextChip[]) => useAgentBus.getState().runAction(action, context),
};

export type RevealLocationHandler = (path: string, line: number | null) => void;

let revealHandler: RevealLocationHandler | null = null;

/** Core UI registers a navigator (switch tab + scroll to path:line). Returns an unregister fn. */
export function setRevealLocationHandler(handler: RevealLocationHandler) {
  revealHandler = handler;
  return () => {
    if (revealHandler === handler) {
      revealHandler = null;
    }
  };
}

/** Returns false when no navigator is registered so callers can fall back (e.g. open in editor). */
export function revealLocation(path: string, line: number | null): boolean {
  if (!revealHandler) {
    return false;
  }
  revealHandler(path, line);
  return true;
}
