import { create } from 'zustand';

/** Text typed into an agent popover: the "Anything else?" note when sending comments, or review/change instructions. */
export type DraftField = 'note' | 'instructions';

interface DraftState {
  byKey: Record<string, string>;
}

export const useAgentDrafts = create<DraftState>(() => ({ byKey: {} }));

/** One draft per project, view and field, kept in memory until it is sent. */
export function draftKey(field: DraftField, repoPath: string, ref: string | null | undefined): string {
  return `${field}\u0000${repoPath}\u0000${ref ?? ''}`;
}

export function readDraft(key: string): string {
  return useAgentDrafts.getState().byKey[key] ?? '';
}

export function writeDraft(key: string, text: string) {
  useAgentDrafts.setState((state) => {
    const byKey = { ...state.byKey };
    if (text) {
      byKey[key] = text;
    } else {
      delete byKey[key];
    }
    return { byKey };
  });
}

export function clearDraft(key: string) {
  writeDraft(key, '');
}

export function useDraft(key: string): [string, (text: string) => void] {
  const text = useAgentDrafts((state) => state.byKey[key] ?? '');
  return [text, (next: string) => writeDraft(key, next)];
}
