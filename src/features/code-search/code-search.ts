import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import * as tauri from '../../lib/tauri';
import { toggleSidebar, useUi } from '../../lib/ui-store';
import type { SearchResult } from '../../lib/types';

/** What the sidebar's search field does: filter the tree by file name, or search inside files. */
export type SidebarSearchMode = 'files' | 'code';
/** In the Diff view, code search covers every file or only the diff's. */
export type CodeSearchScope = 'all' | 'diff';

export interface CodeSearchPrefs {
  mode: SidebarSearchMode;
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  scope: CodeSearchScope;
  recent: string[];
}

const DEFAULT_PREFS: CodeSearchPrefs = {
  mode: 'files',
  query: '',
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  scope: 'all',
  recent: [],
};

const MAX_RECENT = 5;
const DEBOUNCE_MS = 150;

interface CodeSearchState {
  /** One entry per repository, shared by the Files and Diff sidebars so switching views keeps the search. */
  byRepo: Record<string, CodeSearchPrefs>;
  /** A shortcut asked the field to take focus; the field clears it once it has. */
  focusRequest: string | null;
}

const useCodeSearchStore = create<CodeSearchState>(() => ({ byRepo: {}, focusRequest: null }));

export function useCodeSearchPrefs(repoPath: string): CodeSearchPrefs {
  return useCodeSearchStore((state) => state.byRepo[repoPath] ?? DEFAULT_PREFS);
}

export function updateCodeSearch(repoPath: string, patch: Partial<CodeSearchPrefs>) {
  useCodeSearchStore.setState((state) => ({
    byRepo: { ...state.byRepo, [repoPath]: { ...(state.byRepo[repoPath] ?? DEFAULT_PREFS), ...patch } },
  }));
}

export function rememberSearch(repoPath: string, query: string) {
  const prefs = useCodeSearchStore.getState().byRepo[repoPath] ?? DEFAULT_PREFS;
  const recent = [query, ...prefs.recent.filter((item) => item !== query)].slice(0, MAX_RECENT);
  updateCodeSearch(repoPath, { recent });
}

/** `/` and ⌘⇧F: switch the field to `mode`, open the sidebar if it is hidden, and focus the field. */
export function requestSearchFocus(repoPath: string, mode: SidebarSearchMode, query?: string) {
  updateCodeSearch(repoPath, query === undefined ? { mode } : { mode, query });
  if (useUi.getState().sidebarCollapsed) {
    toggleSidebar();
  }
  useCodeSearchStore.setState({ focusRequest: repoPath });
}

export function useSearchFocusRequest(repoPath: string): boolean {
  return useCodeSearchStore((state) => state.focusRequest === repoPath);
}

export function clearSearchFocusRequest() {
  useCodeSearchStore.setState({ focusRequest: null });
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

class SearchCancelled extends Error {}

export function isSearchCancelled(error: unknown): boolean {
  return error instanceof SearchCancelled;
}

/**
 * Results for the current query, 150 ms after typing stops. The previous results stay while the next search runs, and
 * the backend drops a search as soon as a newer one starts.
 */
export function useCodeSearchResults(repoPath: string, prefs: CodeSearchPrefs, paths: string[] | null, enabled: boolean) {
  const query = useDebounced(prefs.query, DEBOUNCE_MS);
  const settled = query === prefs.query;
  const result = useQuery({
    queryKey: ['code-search', repoPath, query, prefs.caseSensitive, prefs.wholeWord, prefs.regex, paths],
    queryFn: async (): Promise<SearchResult> => {
      const found = await tauri.searchCode(repoPath, {
        query,
        caseSensitive: prefs.caseSensitive,
        wholeWord: prefs.wholeWord,
        regex: prefs.regex,
        paths,
      });
      if (found.cancelled) {
        throw new SearchCancelled();
      }
      return found;
    },
    enabled: enabled && query.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    gcTime: 60_000,
  });
  return { ...result, settled };
}
