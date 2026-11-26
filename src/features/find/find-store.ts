import { useEffect } from 'react';
import { create } from 'zustand';
import type { FindLine, FindMatch } from '../../lib/find';

/** What the showing page lets ⌘F search: its lines (data, not DOM) and how to bring a match on screen. */
export interface FindSource {
  /** "changes" or "file", for the placeholder and the palette. */
  label: string;
  lines: FindLine[];
  /** Expands, loads or scrolls to the file so the match's row mounts; the find bar then centres the row. */
  reveal: (match: FindMatch) => void;
  /** The file the reader is looking at: typing starts from its first match. */
  currentScope?: () => string | null;
  /** Files whose text is still loading (held-back patches), shown as "searching…". */
  pending?: number;
}

interface FindState {
  source: FindSource | null;
  open: boolean;
  /** Bumped by ⌘F so an open bar refocuses and selects its text. */
  focusTick: number;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Why the regular expression can't be used, or null. */
  error: string | null;
  matches: FindMatch[];
  truncated: boolean;
  current: number;
  /** Bumped whenever the reader moves to a match, so the same index can be revealed again. */
  revealTick: number;
}

export const useFind = create<FindState>(() => ({
  source: null,
  open: false,
  focusTick: 0,
  query: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  error: null,
  matches: [],
  truncated: false,
  current: -1,
  revealTick: 0,
}));

export function openFind() {
  if (!useFind.getState().source) {
    return;
  }
  useFind.setState((state) => ({ open: true, focusTick: state.focusTick + 1 }));
}

export function closeFind() {
  useFind.setState({ open: false });
}

export function stepFind(direction: 1 | -1) {
  const { matches, current, open } = useFind.getState();
  if (!open || matches.length === 0) {
    return;
  }
  const next = current < 0 ? (direction > 0 ? 0 : matches.length - 1) : (current + direction + matches.length) % matches.length;
  useFind.setState((state) => ({ current: next, revealTick: state.revealTick + 1 }));
}

export function useFindSource(source: FindSource | null) {
  useEffect(() => {
    useFind.setState({ source });
  }, [source]);
  useEffect(() => () => useFind.setState({ source: null, open: false, matches: [], current: -1 }), []);
}

/** The current match's row key when it is in `scope`, so a lazily rendered slice holding it stays mounted. */
export function useCurrentFindKey(scope: string): string | null {
  return useFind((state) => {
    if (!state.open) {
      return null;
    }
    const match = state.matches[state.current];
    return match && match.scope === scope ? match.key : null;
  });
}
