import { useCallback, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { create } from 'zustand';
import * as tauri from '../lib/tauri';
import { queryClient } from '../lib/query-client';

export function useRepoPath(): string {
  const params = useParams();
  return params.repo ?? '';
}

export function repoBase(repoPath: string) {
  return `/r/${encodeURIComponent(repoPath)}`;
}

export function useRepoNav() {
  const navigate = useNavigate();
  const repoPath = useRepoPath();
  const base = repoBase(repoPath);

  const toDiff = useCallback((ref: string) => {
    navigate(`${base}/diff?ref=${encodeURIComponent(ref)}`);
  }, [navigate, base]);

  const toTree = useCallback((path?: string, type?: 'file' | 'dir') => {
    const params = new URLSearchParams();
    if (path) {
      params.set('path', path);
    }
    if (type === 'file') {
      params.set('type', 'file');
    }
    const query = params.toString();
    navigate(`${base}/tree${query ? `?${query}` : ''}`);
  }, [navigate, base]);

  const toOverview = useCallback(() => {
    navigate(`${base}/overview`);
  }, [navigate, base]);

  const toWelcome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return { repoPath, toDiff, toTree, toOverview, toWelcome };
}

interface RepoChangeState {
  tick: number;
}

export const useRepoChange = create<RepoChangeState>(() => ({ tick: 0 }));

export function useRepoEvents(repoPath: string) {
  useEffect(() => {
    let disposed = false;
    const unlisteners: (() => void)[] = [];
    const keep = (fn: () => void) => {
      if (disposed) {
        fn();
        return;
      }
      unlisteners.push(fn);
    };

    tauri.watchRepo(repoPath).catch(() => undefined);
    tauri
      .onRepoChanged((payload) => {
        if (payload.repoPath !== repoPath) {
          return;
        }
        useRepoChange.setState((state) => ({ tick: state.tick + 1 }));
        queryClient.invalidateQueries({ queryKey: ['overview'] });
        queryClient.invalidateQueries({ queryKey: ['commits'] });
        queryClient.invalidateQueries({ queryKey: ['git-status'] });
        queryClient.invalidateQueries({ queryKey: ['repo-meta'] });
        queryClient.invalidateQueries({ queryKey: ['branches'] });
      })
      .then(keep, () => undefined);
    tauri
      .onThreadsChanged((payload) => {
        queryClient.invalidateQueries({ queryKey: ['threads', payload.sessionId] });
        queryClient.invalidateQueries({ queryKey: ['reviews', payload.sessionId] });
      })
      .then(keep, () => undefined);

    return () => {
      disposed = true;
      for (const fn of unlisteners) {
        fn();
      }
      tauri.unwatchRepo(repoPath).catch(() => undefined);
    };
  }, [repoPath]);
}
