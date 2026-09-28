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
  setDraft: (draft: CommentDraft | null) => void;
  setActiveThread: (threadId: string | null) => void;
}

export const useCommentDraft = create<DraftState>((set) => ({
  draft: null,
  activeThreadId: null,
  setDraft: (draft) => set({ draft }),
  setActiveThread: (activeThreadId) => set({ activeThreadId }),
}));
