import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { GitOpResult } from '@/lib/types';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { IconArrowDown, IconArrowUp, IconBranch, IconRefresh } from '@/features/agent/icons';
import { Spinner } from '@/features/agent/primitives';
import { cn } from '@/lib/cn';

type GitOp = 'fetch' | 'pull' | 'push';

const AUTO_FETCH_MS = 60_000;

const opLabel: Record<GitOp, string> = { fetch: 'Fetch', pull: 'Pull', push: 'Push' };

function lastLines(output: string, count = 8) {
  const lines = output.trim().split('\n');
  return lines.slice(-count).join('\n');
}

export function GitSyncButtons() {
  const { repoPath, repo } = useWorkspace();
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<GitOp | null>(null);

  const statusQuery = useQuery({
    queryKey: queryKeys.gitStatus(repoPath),
    queryFn: () => api.gitStatus(repoPath),
    enabled: repo?.isGit !== false,
  });

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;
    api
      .onRepoChanged((payload) => {
        if (payload.repoPath !== repoPath) {
          return;
        }
        queryClient.invalidateQueries({ queryKey: queryKeys.gitStatus(repoPath) });
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
    };
  }, [repoPath, queryClient]);

  const hasUpstream = Boolean(statusQuery.data?.upstream);

  useEffect(() => {
    if (!hasUpstream) {
      return;
    }
    const timer = window.setInterval(() => {
      api
        .gitFetch(repoPath)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.gitStatus(repoPath) }))
        .catch(() => undefined);
    }, AUTO_FETCH_MS);
    return () => window.clearInterval(timer);
  }, [repoPath, hasUpstream, queryClient]);

  const run = async (op: GitOp) => {
    if (running) {
      return;
    }
    setRunning(op);
    const call: (repoPath: string) => Promise<GitOpResult> =
      op === 'fetch' ? api.gitFetch : op === 'pull' ? api.gitPull : api.gitPush;
    try {
      const result = await call(repoPath);
      if (!result.ok) {
        toast.error(`${opLabel[op]} failed`, {
          description: <pre className="max-h-40 overflow-auto font-mono text-[11px] whitespace-pre-wrap">{lastLines(result.output)}</pre>,
          duration: 10_000,
        });
        return;
      }
      if (op !== 'fetch') {
        toast.success(op === 'pull' ? 'Pulled latest changes' : 'Pushed to remote');
      }
    } catch (error) {
      const dirty = api.isAppError(error) && error.code === 'dirty';
      toast.error(`${opLabel[op]} failed`, {
        description: dirty ? `${api.errorMessage(error)}` : lastLines(api.errorMessage(error)),
        duration: 10_000,
      });
    } finally {
      setRunning(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.gitStatus(repoPath) });
      if (op !== 'fetch') {
        queryClient.invalidateQueries({ queryKey: ['repo', repoPath] });
        queryClient.invalidateQueries({ queryKey: queryKeys.pr(repoPath) });
      }
    }
  };

  if (repo && !repo.isGit) {
    return null;
  }

  const status = statusQuery.data;
  const branch = status?.branch ?? repo?.branch ?? null;
  const behind = status?.behind ?? 0;
  const ahead = status?.ahead ?? 0;

  return (
    <div className="flex items-center gap-0.5 text-xs">
      <span
        className="mr-1 flex max-w-[180px] items-center gap-1 truncate text-fg-muted"
        title={status?.upstream ? `${branch} → ${status.upstream}` : (branch ?? 'Detached HEAD')}
      >
        <IconBranch size={12} className="shrink-0" />
        <span className="truncate">{branch ?? 'detached'}</span>
      </span>
      <SyncButton label={null} title="Fetch from remote" running={running === 'fetch'} disabled={running !== null} onClick={() => run('fetch')}>
        <IconRefresh size={12} />
      </SyncButton>
      <SyncButton
        label={behind > 0 ? String(behind) : null}
        title={behind > 0 ? `Pull ${behind} commit${behind === 1 ? '' : 's'} (fast-forward)` : 'Pull'}
        running={running === 'pull'}
        disabled={running !== null || !hasUpstream}
        highlight={behind > 0}
        onClick={() => run('pull')}
      >
        <IconArrowDown size={12} />
      </SyncButton>
      <SyncButton
        label={ahead > 0 ? String(ahead) : null}
        title={
          !hasUpstream ? 'Push and set upstream' : ahead > 0 ? `Push ${ahead} commit${ahead === 1 ? '' : 's'}` : 'Push'
        }
        running={running === 'push'}
        disabled={running !== null || branch === null}
        highlight={ahead > 0 || (!hasUpstream && branch !== null)}
        onClick={() => run('push')}
      >
        <IconArrowUp size={12} />
      </SyncButton>
    </div>
  );
}

function SyncButton(props: {
  label: string | null;
  title: string;
  running: boolean;
  disabled: boolean;
  highlight?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { label, title, running, disabled, highlight, onClick, children } = props;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1 rounded-md px-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-50 disabled:hover:bg-transparent',
        highlight && 'text-accent',
      )}
    >
      {running ? <Spinner size={12} /> : children}
      {label && <span className="tabular-nums">{label}</span>}
    </button>
  );
}
