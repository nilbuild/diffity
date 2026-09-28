import { create } from 'zustand';
import type { AgentAction, ContextChip } from '@/lib/types';

export type AgentBusRequest =
  | { id: string; type: 'ask'; chip: ContextChip }
  | { id: string; type: 'action'; action: AgentAction };

interface AgentBusState {
  queue: AgentBusRequest[];
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  askAboutSelection: (chip: ContextChip) => void;
  runAction: (action: AgentAction) => void;
  /** AgentPanel calls this to take ownership of all pending requests. */
  drain: () => AgentBusRequest[];
}

let counter = 0;
const nextId = () => `req-${Date.now()}-${++counter}`;

export const useAgentBus = create<AgentBusState>((set, get) => ({
  queue: [],
  panelOpen: true,
  setPanelOpen: (open) => set({ panelOpen: open }),
  askAboutSelection: (chip) =>
    set((state) => ({ panelOpen: true, queue: [...state.queue, { id: nextId(), type: 'ask', chip }] })),
  runAction: (action) =>
    set((state) => ({ panelOpen: true, queue: [...state.queue, { id: nextId(), type: 'action', action }] })),
  drain: () => {
    const pending = get().queue;
    if (pending.length === 0) {
      return pending;
    }
    set({ queue: [] });
    return pending;
  },
}));

export const agentBus = {
  askAboutSelection: (chip: ContextChip) => useAgentBus.getState().askAboutSelection(chip),
  runAction: (action: AgentAction) => useAgentBus.getState().runAction(action),
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
