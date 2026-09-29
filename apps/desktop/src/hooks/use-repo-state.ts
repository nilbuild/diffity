import { useQuery } from '@tanstack/react-query';
import * as tauri from '../lib/tauri';
import { fetchCommits, fetchGitHubDetails, getRepoPath, parseGitHubRemote } from '../lib/api';
import type { Branch } from '../lib/types';

export function useGitStatus() {
  return useQuery({
    queryKey: ['git-status'],
    queryFn: () => tauri.gitStatus(getRepoPath()),
    staleTime: 10_000,
    retry: false,
  });
}

export function useRepoMeta() {
  return useQuery({
    queryKey: ['repo-meta'],
    queryFn: () => tauri.openRepo(getRepoPath()),
    staleTime: 30_000,
  });
}

export function useHasGitHubRemote(): boolean {
  const { data } = useRepoMeta();
  return parseGitHubRemote(data?.remoteUrl ?? null) !== null;
}

export function useGitHubAuth() {
  return useQuery({
    queryKey: ['github-auth'],
    queryFn: tauri.githubAuthStatus,
    staleTime: 60_000,
    retry: false,
  });
}

/** The open pull request for the current branch (null when signed out, no GitHub remote or no PR). */
export function useGitHubPr() {
  const hasRemote = useHasGitHubRemote();
  const query = useQuery({
    queryKey: ['github-details'],
    queryFn: fetchGitHubDetails,
    enabled: hasRemote,
    staleTime: 60_000,
    retry: false,
  });
  return { details: query.data ?? null, loading: hasRemote && query.isLoading, hasRemote };
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => tauri.listBranches(getRepoPath()),
    staleTime: 30_000,
    retry: false,
  });
}

const BASE_CANDIDATES = ['origin/main', 'origin/master', 'main', 'master', 'origin/develop', 'develop', 'origin/trunk', 'trunk'];

export function guessBaseBranch(branches: Branch[], current: string | null): string | null {
  const names = new Set(branches.map((branch) => branch.name));
  for (const candidate of BASE_CANDIDATES) {
    if (!names.has(candidate)) {
      continue;
    }
    if (candidate === current || candidate === `origin/${current}`) {
      continue;
    }
    return candidate;
  }
  return null;
}

/** Base branch to compare the current branch against: the PR base, else main/master (prefers the remote one). */
export function useBaseBranch(prBase: string | null, current: string | null): string | null {
  const { data: branches } = useBranches();
  if (prBase) {
    return `origin/${prBase}`;
  }
  if (!branches) {
    return null;
  }
  return guessBaseBranch(branches, current);
}

export function useRecentCommits(count: number) {
  return useQuery({
    queryKey: ['commits', 'recent', count],
    queryFn: () => fetchCommits(0, count),
    staleTime: 10_000,
  });
}
