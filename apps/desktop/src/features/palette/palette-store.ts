import { useEffect } from 'react';
import { create } from 'zustand';
import type { ReactNode } from 'react';

export type PaletteMode = 'all' | 'actions' | 'files';

export interface PaletteAction {
  id: string;
  title: string;
  group?: string;
  hint?: string;
  keywords?: string;
  icon?: ReactNode;
  run: () => void;
}

export interface PaletteFile {
  path: string;
  status?: string;
  additions?: number;
  deletions?: number;
  comments?: number;
  viewed?: boolean;
}

interface PaletteState {
  mode: PaletteMode | null;
  /** Actions registered by the page that is showing (layout, whitespace, Claude…), keyed by owner. */
  pageActions: Record<string, PaletteAction[]>;
  /** Files of the diff that is showing, plus how to reveal one. */
  viewFiles: { files: PaletteFile[]; reveal: (path: string) => void } | null;
}

export const usePalette = create<PaletteState>(() => ({ mode: null, pageActions: {}, viewFiles: null }));

export function openPalette(mode: PaletteMode) {
  usePalette.setState({ mode });
}

export function closePalette() {
  usePalette.setState({ mode: null });
}

export function usePageActions(owner: string, actions: PaletteAction[]) {
  useEffect(() => {
    usePalette.setState((state) => ({ pageActions: { ...state.pageActions, [owner]: actions } }));
  }, [owner, actions]);
  useEffect(() => () => {
    usePalette.setState((state) => {
      const next = { ...state.pageActions };
      delete next[owner];
      return { pageActions: next };
    });
  }, [owner]);
}

export function useViewFiles(files: PaletteFile[] | null, reveal: (path: string) => void) {
  useEffect(() => {
    usePalette.setState({ viewFiles: files ? { files, reveal } : null });
  }, [files, reveal]);
  useEffect(() => () => usePalette.setState({ viewFiles: null }), []);
}

const RECENT_ACTIONS = 'diffity-palette-recent';
const RECENT_FILES = 'diffity-recent-files:';

function readList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function pushList(key: string, value: string, limit: number) {
  try {
    const next = [value, ...readList(key).filter((item) => item !== value)].slice(0, limit);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    return;
  }
}

export function recentActionIds(): string[] {
  return readList(RECENT_ACTIONS);
}

export function rememberAction(id: string) {
  pushList(RECENT_ACTIONS, id, 12);
}

export function recentFiles(repoPath: string): string[] {
  return readList(RECENT_FILES + repoPath);
}

export function rememberFile(repoPath: string, path: string) {
  pushList(RECENT_FILES + repoPath, path, 20);
}

/** Subsequence match with a bonus for word starts and contiguous runs; 0 means no match. */
export function fuzzyScore(query: string, text: string): number {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return 1;
  }
  const hay = text.toLowerCase();
  const direct = hay.indexOf(needle);
  if (direct >= 0) {
    return 1000 - direct + (direct === 0 || /[\s/._-]/.test(hay[direct - 1] ?? '') ? 200 : 0);
  }
  let score = 0;
  let from = 0;
  let run = 0;
  for (const char of needle) {
    if (char === ' ') {
      continue;
    }
    const index = hay.indexOf(char, from);
    if (index < 0) {
      return 0;
    }
    run = index === from ? run + 1 : 0;
    score += 10 + run * 5 + (index === 0 || /[\s/._-]/.test(hay[index - 1] ?? '') ? 8 : 0);
    from = index + 1;
  }
  return score;
}
