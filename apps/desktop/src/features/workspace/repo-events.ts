import { useEffect } from 'react';
import { create } from 'zustand';
import * as api from '@/lib/api';
import { queryClient } from '@/lib/query';

interface RepoEventsState {
  changeCount: number;
}

export const useRepoEvents = create<RepoEventsState>(() => ({ changeCount: 0 }));

/** Watches the repo on disk; bumps `changeCount` and refreshes cheap queries on every `repo-changed`. */
export function useRepoWatcher(repoPath: string) {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    api.watchRepo(repoPath).catch(() => undefined);
    api
      .onRepoChanged((payload) => {
        if (payload.repoPath !== repoPath) {
          return;
        }
        useRepoEvents.setState((s) => ({ changeCount: s.changeCount + 1 }));
        void queryClient.invalidateQueries({
          predicate: (query) => {
            const [scope, path, kind] = query.queryKey as unknown[];
            if (scope !== 'repo' || path !== repoPath) {
              return false;
            }
            return kind !== 'diff' && kind !== 'fileVersions';
          },
        });
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
      api.unwatchRepo(repoPath).catch(() => undefined);
    };
  }, [repoPath]);
}
