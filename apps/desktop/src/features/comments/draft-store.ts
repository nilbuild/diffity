import { create } from 'zustand';
import type { Side } from '@/lib/types';

export type DraftScope = 'diff' | 'tree';

export interface CommentDraft {
  scope: DraftScope;
  filePath: string;
  side: Side;
  startLine: number;
  endLine: number;
  anchorContent: string | null;
}

interface DraftState {
  draft: CommentDraft | null;
  activeThreadId: string | null;
  /** Unsent composer text keyed by composer (`new`, `reply:<threadId>`, `edit:<commentId>`, `general`). Survives remounts. */
  bodies: Record<string, string>;
  setDraft: (draft: CommentDraft | null) => void;
  setActiveThread: (threadId: string | null) => void;
  setBody: (key: string, body: string) => void;
  clearBody: (key: string) => void;
}

export const useCommentDraft = create<DraftState>((set) => ({
  draft: null,
  activeThreadId: null,
  bodies: {},
  setDraft: (draft) => set((s) => ({ draft, bodies: omit(s.bodies, 'new') })),
  setActiveThread: (activeThreadId) => set({ activeThreadId }),
  setBody: (key, body) => set((s) => ({ bodies: { ...s.bodies, [key]: body } })),
  clearBody: (key) => set((s) => ({ bodies: omit(s.bodies, key) })),
}));

function omit(bodies: Record<string, string>, key: string): Record<string, string> {
  if (!(key in bodies)) {
    return bodies;
  }
  const next = { ...bodies };
  delete next[key];
  return next;
}

/** Opens a reply composer on a thread, optionally prefilled (e.g. `@claude `). */
export function openReply(threadId: string, prefill = '') {
  const state = useCommentDraft.getState();
  const key = `reply:${threadId}`;
  const current = state.bodies[key] ?? '';
  if (prefill && current.includes(prefill.trim())) {
    return;
  }
  state.setBody(key, current ? `${prefill}${current}` : prefill);
}
