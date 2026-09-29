import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGitStatus, useRepoMeta } from '../../hooks/use-repo-state';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import type { GitOpResult } from '../../lib/types';
import { Spinner } from '../icons/spinner';
import { DownloadIcon, RefreshIcon, UploadIcon } from '../ui/icon';

type GitOp = 'fetch' | 'pull' | 'push';

const OP_LABELS: Record<GitOp, { busy: string; done: string; failed: string }> = {
  fetch: { busy: 'Fetching from the remote…', done: 'Fetched', failed: 'Fetch failed' },
  pull: { busy: 'Pulling…', done: 'Pulled', failed: 'Pull failed' },
  push: { busy: 'Pushing…', done: 'Pushed', failed: 'Push failed' },
};

const RUNNERS: Record<GitOp, (repoPath: string) => Promise<GitOpResult>> = {
  fetch: tauri.gitFetch,
  pull: tauri.gitPull,
  push: tauri.gitPush,
};

const buttonClass = 'flex items-center gap-1 h-5 px-1.5 rounded text-[11px] text-text-muted hover:bg-hover hover:text-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';

export function GitSyncActions() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<GitOp | null>(null);
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();

  if (!status?.branch || !meta?.remoteUrl) {
    return null;
  }

  const run = async (op: GitOp) => {
    setRunning(op);
    const id = toast.loading(OP_LABELS[op].busy);
    try {
      const result = await RUNNERS[op](getRepoPath());
      const output = result.output.trim();
      if (result.ok) {
        toast.success(OP_LABELS[op].done, { id, description: output || undefined });
      } else {
        toast.error(OP_LABELS[op].failed, { id, description: output || undefined });
      }
    } catch (error) {
      toast.error(OP_LABELS[op].failed, { id, description: tauri.errorMessage(error) });
    } finally {
      setRunning(null);
      queryClient.invalidateQueries({ queryKey: ['git-status'] });
      queryClient.invalidateQueries({ queryKey: ['github-details'] });
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      queryClient.invalidateQueries({ queryKey: ['commits'] });
    }
  };

  const icon = (op: GitOp, node: React.ReactNode) => (running === op ? <Spinner className="w-3 h-3" /> : node);
  const upstreamTitle = status.upstream ? ` (${status.upstream})` : '';

  return (
    <div className="flex items-center gap-0.5">
      <button className={buttonClass} disabled={running !== null} onClick={() => run('fetch')} title={`Fetch: download new commits without changing your files${upstreamTitle}`}>
        {icon('fetch', <RefreshIcon className="w-3 h-3" />)}
      </button>
      <button className={buttonClass} disabled={running !== null} onClick={() => run('pull')} title={status.behind > 0 ? `Pull ${status.behind} commit${status.behind === 1 ? '' : 's'}${upstreamTitle}` : `Pull${upstreamTitle}`}>
        {icon('pull', <DownloadIcon className="w-3 h-3" />)}
        {status.behind > 0 && <span className="tabular-nums">{status.behind}</span>}
      </button>
      <button className={buttonClass} disabled={running !== null} onClick={() => run('push')} title={status.upstream ? (status.ahead > 0 ? `Push ${status.ahead} commit${status.ahead === 1 ? '' : 's'}${upstreamTitle}` : `Push${upstreamTitle}`) : 'Publish this branch to the remote'}>
        {icon('push', <UploadIcon className="w-3 h-3" />)}
        {status.ahead > 0 && <span className="tabular-nums">{status.ahead}</span>}
      </button>
    </div>
  );
}
