import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as tauri from '../lib/tauri';
import { fetchCommits, fetchGitHubDetails, getRepoPath, parseGitHubRemote } from '../lib/api';
import type { Branch, PullRequest } from '../lib/types';
import { prBaseFor } from '../lib/pr-ref';

export function gitStatusOptions() {
  return {
    queryKey: ['git-status'],
    queryFn: () => tauri.gitStatus(getRepoPath()),
    staleTime: 10_000,
    retry: false,
  } as const;
}

export function useGitStatus() {
  return useQuery(gitStatusOptions());
}

export function useRepoMeta() {
  return useQuery({
    queryKey: ['repo-meta'],
    queryFn: () => tauri.openRepo(getRepoPath()),
    staleTime: 30_000,
  });
}

export function useHasGitHubRemote(): boolean {
  return useGitHubRemote().hasRemote;
}

/** Whether origin is on GitHub; `pending` while the repository metadata that tells is still loading. */
export function useGitHubRemote(): { hasRemote: boolean; pending: boolean } {
  const { data, isPending } = useRepoMeta();
  return { hasRemote: parseGitHubRemote(data?.remoteUrl ?? null) !== null, pending: isPending };
}

/** GitHub sign-in state; `signedOut` only once the check has answered, so a slow check never shows a sign-in prompt. */
export function useGitHubSignIn(): { signedIn: boolean; signedOut: boolean; pending: boolean } {
  const { data, isPending, isError } = useGitHubAuth();
  return { signedIn: !!data?.authenticated, signedOut: isError || (!!data && !data.authenticated), pending: isPending };
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
  const { hasRemote, pending: remotePending } = useGitHubRemote();
  const status = useGitStatus();
  const branch = status.data?.branch ?? null;
  // Keyed by branch so a checkout (in the app or a terminal) never shows the previous branch's PR.
  const query = useQuery({
    queryKey: ['github-details', branch],
    queryFn: fetchGitHubDetails,
    enabled: hasRemote && !status.isPending,
    staleTime: 60_000,
    retry: false,
  });
  return { details: query.data ?? null, loading: remotePending || (hasRemote && (status.isPending || query.isLoading)), hasRemote };
}

const BRANCH_PR_KEY = 'diffity-branch-pr';
const DEFAULT_BRANCHES = new Set(['main', 'master', 'develop', 'trunk']);

function readBranchPrs(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BRANCH_PR_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Whether the checked-out branch probably has a pull request: it had one last time, or (never seen) it is a pushed
 * feature branch. Views then wait a little longer for GitHub before deciding what to show.
 */
export function expectsPullRequest(key: string, branch: string | null, upstream: string | null | undefined): boolean {
  const known = readBranchPrs()[key];
  if (known !== undefined) {
    return known > 0;
  }
  return !!branch && !!upstream && !DEFAULT_BRANCHES.has(branch);
}

export function rememberBranchPr(key: string, prNumber: number) {
  try {
    const stored = readBranchPrs();
    if (stored[key] === prNumber) {
      return;
    }
    stored[key] = prNumber;
    localStorage.setItem(BRANCH_PR_KEY, JSON.stringify(stored));
  } catch {
    return;
  }
}

/** Records whether the checked-out branch has a pull request once GitHub has answered, for `expectsPullRequest`. */
export function useRememberBranchPr() {
  const { details, loading, hasRemote } = useGitHubPr();
  const { data: auth } = useGitHubAuth();
  const { data: status } = useGitStatus();
  const key = status ? `${getRepoPath()}\n${status.branch ?? ''}` : null;
  const prNumber = details?.prNumber ?? 0;
  const known = !!key && hasRemote && !!auth?.authenticated && !loading;

  useEffect(() => {
    if (!known || !key) {
      return;
    }
    rememberBranchPr(key, prNumber);
  }, [known, key, prNumber]);
}

/** The PR lookup is still running for a branch that probably has one (see `expectsPullRequest`). */
export function usePrLookupExpected(): boolean {
  const { loading, hasRemote } = useGitHubPr();
  const { data: auth } = useGitHubAuth();
  const { data: status } = useGitStatus();
  const { pending: remotePending } = useGitHubRemote();
  if (!loading) {
    return false;
  }
  if (remotePending || !status) {
    return true;
  }
  return hasRemote && auth?.authenticated !== false && expectsPullRequest(`${getRepoPath()}\n${status.branch ?? ''}`, status.branch, status.upstream);
}

/** The checked-out PR is yours (you authored it), so review comments are notes for Claude rather than a GitHub review. */
export function useOwnPr(): boolean {
  const { details } = useGitHubPr();
  const { data: auth } = useGitHubAuth();
  const author = details?.pr?.author?.toLowerCase();
  const login = auth?.login?.toLowerCase();
  return !!author && !!login && author === login;
}

export function useBranches() {
  return useQuery({
    queryKey: ['branches'],
    queryFn: () => tauri.listBranches(getRepoPath()),
    staleTime: 30_000,
    retry: false,
  });
}

export function useWorktrees() {
  return useQuery({
    queryKey: ['worktrees'],
    queryFn: () => tauri.listWorktrees(getRepoPath()),
    staleTime: 30_000,
    retry: false,
  });
}

/** In a fork, `upstream` holds the real base; your fork's `origin` copy can be stale. */
const BASE_CANDIDATES = [
  'upstream/main', 'upstream/master', 'origin/main', 'origin/master', 'main', 'master',
  'upstream/develop', 'origin/develop', 'develop', 'upstream/trunk', 'origin/trunk', 'trunk',
];

export function guessBaseBranch(branches: Branch[], current: string | null): string | null {
  const names = new Set(branches.map((branch) => branch.name));
  for (const candidate of BASE_CANDIDATES) {
    if (!names.has(candidate)) {
      continue;
    }
    if (candidate === current || candidate === `origin/${current}` || candidate === `upstream/${current}`) {
      continue;
    }
    return candidate;
  }
  return null;
}

/** Base branch to compare the current branch against: the PR base, else main/master (prefers `upstream`, then `origin`). */
export function useBaseBranch(pr: Pick<PullRequest, 'baseRef' | 'baseRemote'> | null, current: string | null): string | null {
  const { data: branches } = useBranches();
  if (pr) {
    return prBaseFor(pr);
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
