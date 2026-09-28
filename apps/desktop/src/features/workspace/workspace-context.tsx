import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { TREE_REF, type RepoInfo } from '@/lib/types';

export interface WorkspaceValue {
  repoPath: string;
  repo: RepoInfo | null;
  repoError: unknown;
  ref: string;
  setRef: (ref: string) => void;
  sessionId: string | null;
  /** Review session for the file browser (ref `__tree__`). */
  treeSessionId: string | null;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

interface WorkspaceProviderProps {
  repoPath: string;
  initialRef?: string;
  children: ReactNode;
}

export function WorkspaceProvider(props: WorkspaceProviderProps) {
  const { repoPath, initialRef, children } = props;
  const [ref, setRef] = useState(initialRef ?? 'work');

  const repoQuery = useQuery({
    queryKey: queryKeys.repo(repoPath),
    queryFn: () => api.openRepo(repoPath),
    staleTime: Infinity,
  });

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(repoPath, ref),
    queryFn: () => api.getSession(repoPath, ref),
    staleTime: Infinity,
  });

  const treeSessionQuery = useQuery({
    queryKey: queryKeys.session(repoPath, TREE_REF),
    queryFn: () => api.getSession(repoPath, TREE_REF),
    staleTime: Infinity,
  });

  const value: WorkspaceValue = {
    repoPath,
    repo: repoQuery.data ?? null,
    repoError: repoQuery.error,
    ref,
    setRef,
    sessionId: sessionQuery.data?.id ?? null,
    treeSessionId: treeSessionQuery.data?.id ?? null,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error('useWorkspace must be used inside WorkspaceProvider');
  }
  return value;
}
