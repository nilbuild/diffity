import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

export const queryKeys = {
  recentRepos: () => ['recentRepos'] as const,
  repo: (repoPath: string) => ['repo', repoPath] as const,
  gitStatus: (repoPath: string) => ['repo', repoPath, 'gitStatus'] as const,
  branches: (repoPath: string) => ['repo', repoPath, 'branches'] as const,
  commits: (repoPath: string, search: string | null) => ['repo', repoPath, 'commits', search] as const,
  resolvedRef: (repoPath: string, ref: string) => ['repo', repoPath, 'resolvedRef', ref] as const,
  diff: (repoPath: string, ref: string, ignoreWhitespace: boolean) =>
    ['repo', repoPath, 'diff', ref, ignoreWhitespace] as const,
  fileVersions: (repoPath: string, ref: string, path: string) =>
    ['repo', repoPath, 'fileVersions', ref, path] as const,
  tree: (repoPath: string) => ['repo', repoPath, 'tree'] as const,
  file: (repoPath: string, path: string) => ['repo', repoPath, 'file', path] as const,
  session: (repoPath: string, ref: string) => ['session', repoPath, ref] as const,
  threads: (sessionId: string) => ['threads', sessionId] as const,
  viewed: (sessionId: string) => ['viewed', sessionId] as const,
  setting: (key: string) => ['setting', key] as const,
  agents: () => ['agents'] as const,
  chats: (repoPath: string) => ['chats', repoPath] as const,
  chatMessages: (chatId: string) => ['chatMessages', chatId] as const,
  githubAuth: () => ['github', 'auth'] as const,
  pr: (repoPath: string) => ['github', 'pr', repoPath] as const,
  prs: (repoPath: string) => ['github', 'prs', repoPath] as const,
};
