import { create } from 'zustand';

interface LargeDiffState {
  /** The diff these choices belong to (ref + whitespace); a different diff starts over. */
  scope: string;
  loaded: Set<string>;
  all: boolean;
}

/** Which held-back files ("Load diff") the reader opened. Lives outside the file cards so virtualisation keeps it. */
export const useLargeDiff = create<LargeDiffState>(() => ({ scope: '', loaded: new Set(), all: false }));

export function enterLargeDiffScope(scope: string) {
  if (useLargeDiff.getState().scope === scope) {
    return;
  }
  useLargeDiff.setState({ scope, loaded: new Set(), all: false });
}

export function loadHeldBackFile(path: string) {
  const loaded = new Set(useLargeDiff.getState().loaded);
  loaded.add(path);
  useLargeDiff.setState({ loaded });
}

export function loadAllHeldBackFiles() {
  useLargeDiff.setState({ all: true });
}

export function useHeldBackLoaded(path: string): boolean {
  return useLargeDiff((state) => state.all || state.loaded.has(path));
}
