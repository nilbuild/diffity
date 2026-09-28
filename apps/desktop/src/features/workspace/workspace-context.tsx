import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { RepoInfo } from '@/lib/types';

export interface WorkspaceValue {
  repoPath: string;
  repo: RepoInfo | null;
  ref: string;
  setRef: (ref: string) => void;
  sessionId: string | null;
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
  });

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(repoPath, ref),
    queryFn: () => api.getSession(repoPath, ref),
  });

  const value: WorkspaceValue = {
    repoPath,
    repo: repoQuery.data ?? null,
    ref,
    setRef,
    sessionId: sessionQuery.data?.id ?? null,
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
