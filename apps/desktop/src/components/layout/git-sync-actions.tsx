import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import type { GitOpResult } from '../../lib/types';
import { RefreshIcon } from '../icons/refresh-icon';
import { DownloadIcon } from '../icons/download-icon';
import { UploadIcon } from '../icons/upload-icon';
import { Spinner } from '../icons/spinner';

type GitOp = 'fetch' | 'pull' | 'push';

const OP_LABELS: Record<GitOp, { busy: string; done: string; failed: string }> = {
  fetch: { busy: 'Fetching…', done: 'Fetched', failed: 'Fetch failed' },
  pull: { busy: 'Pulling…', done: 'Pulled', failed: 'Pull failed' },
  push: { busy: 'Pushing…', done: 'Pushed', failed: 'Push failed' },
};

const RUNNERS: Record<GitOp, (repoPath: string) => Promise<GitOpResult>> = {
  fetch: tauri.gitFetch,
  pull: tauri.gitPull,
  push: tauri.gitPush,
};

const buttonClass = 'flex items-center gap-1 px-2 py-1 text-xs text-text-muted hover:bg-hover hover:text-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';

export function GitSyncActions() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<GitOp | null>(null);
  const { data: status } = useQuery({
    queryKey: ['git-status'],
    queryFn: () => tauri.gitStatus(getRepoPath()),
    staleTime: 10_000,
  });

  if (!status?.branch) {
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
    }
  };

  const icon = (op: GitOp, node: React.ReactNode) => (running === op ? <Spinner className="w-3 h-3" /> : node);
  const upstreamTitle = status.upstream ? ` (${status.upstream})` : '';

  return (
    <div className="flex items-stretch bg-bg-tertiary rounded-md overflow-hidden">
      <button className={buttonClass} disabled={running !== null} onClick={() => run('fetch')} title={`Fetch${upstreamTitle}`}>
        {icon('fetch', <RefreshIcon className="w-3.5 h-3.5" />)}
      </button>
      <button className={buttonClass} disabled={running !== null} onClick={() => run('pull')} title={`Pull${upstreamTitle}`}>
        {icon('pull', <DownloadIcon className="w-3.5 h-3.5" />)}
        {status.behind > 0 && <span className="tabular-nums">{status.behind}</span>}
      </button>
      <button className={buttonClass} disabled={running !== null} onClick={() => run('push')} title={status.upstream ? `Push${upstreamTitle}` : 'Publish branch'}>
        {icon('push', <UploadIcon className="w-3.5 h-3.5" />)}
        {status.ahead > 0 && <span className="tabular-nums">{status.ahead}</span>}
      </button>
    </div>
  );
}
