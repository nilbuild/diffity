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
    placeholderData: (previous) => previous,
  });
}

export function isOpenThread(thread: RepoThread): boolean {
  return thread.status === 'open';
}
