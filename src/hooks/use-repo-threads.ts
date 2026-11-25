import { useQuery } from '@tanstack/react-query';
import * as tauri from '../lib/tauri';
import type { RepoThread } from '../lib/types';
import { useRepoPath } from './use-repo';

export function repoThreadsKey(repoPath: string) {
  return ['repo-threads', repoPath];
}

export function useRepoThreads() {
  const repoPath = useRepoPath();
  return useQuery<RepoThread[]>({
    queryKey: repoThreadsKey(repoPath),
    queryFn: () => tauri.listRepoThreads(repoPath),
    enabled: !!repoPath,
    staleTime: 5_000,
  });
}

export function isOpenThread(thread: RepoThread): boolean {
  return thread.status === 'open';
}

/** Left in the view on screen, or moved into it when its changes were committed. No view (Home): every comment. */
export function inView(thread: RepoThread, viewRef: string | null): boolean {
  if (!viewRef) {
    return true;
  }
  if (thread.otherBranch) {
    return false;
  }
  return thread.ref === viewRef || thread.movedTo?.ref === viewRef;
}
