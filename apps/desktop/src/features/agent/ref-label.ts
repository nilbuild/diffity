import { queryClient, queryKeys } from '@/lib/query';
import type { Commit } from '@/lib/types';

const SHA = /^[0-9a-f]{12,40}$/i;

const NAMED: Record<string, string> = {
  work: 'uncommitted changes',
  '.': 'uncommitted changes',
  staged: 'staged changes',
  unstaged: 'unstaged changes',
};

function commitSubject(repoPath: string, sha: string): string | null {
  const lists = queryClient.getQueriesData<Commit[]>({ queryKey: ['repo', repoPath, 'commits'] });
  for (const [, commits] of lists) {
    const match = commits?.find((commit) => commit.sha.startsWith(sha) || sha.startsWith(commit.sha));
    if (match) {
      return match.subject;
    }
  }
  return null;
}

function shortRef(repoPath: string, part: string): string {
  if (!SHA.test(part)) {
    return part;
  }
  const subject = commitSubject(repoPath, part);
  const short = part.slice(0, 7);
  return subject ? `${short} “${subject}”` : short;
}

/** Human label for a diff ref: "uncommitted changes", "main…feat/cache", or "85f5bf3 “Fix cache”" instead of a raw SHA. */
export function describeRef(repoPath: string, ref: string): string {
  const named = NAMED[ref];
  if (named) {
    return named;
  }
  const range = /^(.+?)(\.\.\.?)(.+)$/.exec(ref);
  if (range) {
    return `${shortRef(repoPath, range[1])}${range[2]}${shortRef(repoPath, range[3])}`;
  }
  const resolved = queryClient.getQueryData<{ label: string }>(queryKeys.resolvedRef(repoPath, ref));
  if (resolved && !resolved.label.includes(ref)) {
    return resolved.label;
  }
  return shortRef(repoPath, ref);
}
