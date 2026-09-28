import { create } from 'zustand';
import type { ContextChip } from '@/lib/types';
import type { TimelineItem } from './timeline';

export type UiMode = 'ask' | 'edit';

export interface ChatRuntime {
  items: TimelineItem[];
  streaming: boolean;
  loaded: boolean;
}

interface AgentStoreState {
  activeChatId: string | null;
  agentId: string | null;
  uiMode: UiMode;
  runtimes: Record<string, ChatRuntime>;
  attached: ContextChip[];
  composerFocusToken: number;
  setActiveChat: (chatId: string | null) => void;
  setAgentId: (agentId: string) => void;
  setUiMode: (mode: UiMode) => void;
  attach: (chip: ContextChip) => void;
  detach: (index: number) => void;
  clearAttached: () => void;
  focusComposer: () => void;
  setItems: (chatId: string, update: (items: TimelineItem[]) => TimelineItem[]) => void;
  setStreaming: (chatId: string, streaming: boolean) => void;
  markLoaded: (chatId: string, items: TimelineItem[]) => void;
  removeRuntime: (chatId: string) => void;
}

const emptyRuntime: ChatRuntime = { items: [], streaming: false, loaded: false };

function sameChip(a: ContextChip, b: ContextChip) {
  return (
    a.filePath === b.filePath &&
    a.side === b.side &&
    a.startLine === b.startLine &&
    a.endLine === b.endLine
  );
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  activeChatId: null,
  agentId: null,
  uiMode: 'ask',
  runtimes: {},
  attached: [],
  composerFocusToken: 0,
  setActiveChat: (chatId) => set({ activeChatId: chatId }),
  setAgentId: (agentId) => set({ agentId }),
  setUiMode: (mode) => set({ uiMode: mode }),
  attach: (chip) =>
    set((state) => {
      if (state.attached.some((existing) => sameChip(existing, chip))) {
        return state;
      }
      return { attached: [...state.attached, chip] };
    }),
  detach: (index) => set((state) => ({ attached: state.attached.filter((_, i) => i !== index) })),
  clearAttached: () => set({ attached: [] }),
  focusComposer: () => set((state) => ({ composerFocusToken: state.composerFocusToken + 1 })),
  setItems: (chatId, update) =>
    set((state) => {
      const runtime = state.runtimes[chatId] ?? emptyRuntime;
      return { runtimes: { ...state.runtimes, [chatId]: { ...runtime, items: update(runtime.items) } } };
    }),
  setStreaming: (chatId, streaming) =>
    set((state) => {
      const runtime = state.runtimes[chatId] ?? emptyRuntime;
      return { runtimes: { ...state.runtimes, [chatId]: { ...runtime, streaming } } };
    }),
  markLoaded: (chatId, items) =>
    set((state) => {
      const runtime = state.runtimes[chatId];
      if (runtime?.loaded || runtime?.streaming) {
        return state;
      }
      return { runtimes: { ...state.runtimes, [chatId]: { items, streaming: false, loaded: true } } };
    }),
  removeRuntime: (chatId) =>
    set((state) => {
      const runtimes = { ...state.runtimes };
      delete runtimes[chatId];
      return {
        runtimes,
        activeChatId: state.activeChatId === chatId ? null : state.activeChatId,
      };
    }),
}));

export function useChatRuntime(chatId: string | null): ChatRuntime {
  return useAgentStore((state) => (chatId ? state.runtimes[chatId] ?? emptyRuntime : emptyRuntime));
}
