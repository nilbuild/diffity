import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGitHubPr, useGitStatus, useOwnPr, useRepoMeta } from '../../hooks/use-repo-state';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import type { GitOpResult } from '../../lib/types';
import { Spinner } from '../icons/spinner';
import { cn } from '../../lib/cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { FetchIcon, PullIcon, PushIcon } from '../ui/icon';

dayjs.extend(relativeTime);

const lastFetched = new Map<string, number>();

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

const itemClass = 'flex items-center gap-1 h-full px-2 text-[11px] font-medium text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default disabled:hover:bg-transparent aria-disabled:opacity-50 aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-disabled:hover:text-text-secondary';

export function GitSyncActions() {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState<GitOp | null>(null);
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();
  const { details } = useGitHubPr();
  const ownPr = useOwnPr();

  if (!status?.branch || !meta?.remoteUrl) {
    return null;
  }

  const repoPath = getRepoPath();

  const run = async (op: GitOp) => {
    setRunning(op);
    const id = toast.loading(OP_LABELS[op].busy);
    try {
      const result = await RUNNERS[op](repoPath);
      const output = result.output.trim();
      if (result.ok) {
        toast.success(OP_LABELS[op].done, { id, description: output || undefined });
        if (op !== 'push') {
          lastFetched.set(repoPath, Date.now());
        }
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
  const upstream = status.upstream;
  const fetchedAt = lastFetched.get(repoPath);
  const fetchTitle = `Fetch new commits from the remote without changing your files. ${fetchedAt ? `Last fetched ${dayjs(fetchedAt).fromNow()}` : 'Not fetched since the app opened'}`;
  const nothingToPush = !!upstream && status.ahead === 0;
  const plural = (count: number) => `${count} commit${count === 1 ? '' : 's'}`;
  const idle = running === null && !!upstream && status.ahead === 0 && status.behind === 0;
  const hoverOnly = idle ? 'hidden group-hover/status:flex' : undefined;
  const showPush = !!upstream || !details?.pr || ownPr;

  return (
    <div className="flex items-stretch h-6 rounded-md border border-control-border bg-raised overflow-hidden divide-x divide-control-border">
      <button className={itemClass} disabled={running !== null} onClick={() => run('fetch')} title={fetchTitle}>
        {icon('fetch', <FetchIcon size="xs" />)}
        Fetch
      </button>
      {upstream && (
        <button
          className={cn(itemClass, status.behind > 0 && 'bg-pull/10 text-pull hover:bg-pull/15 hover:text-pull', hoverOnly)}
          disabled={running !== null}
          onClick={() => run('pull')}
          title={status.behind > 0 ? `Pull ${plural(status.behind)} from ${upstream}` : `Nothing new on ${upstream} since the last fetch. Pull anyway`}
        >
          {icon('pull', <PullIcon size="xs" />)}
          Pull
          {status.behind > 0 && <span className="tabular-nums">{status.behind}</span>}
        </button>
      )}
      {showPush && (
        <button
          className={cn(itemClass, !nothingToPush && 'bg-push/10 text-push hover:bg-push/15 hover:text-push', hoverOnly)}
          disabled={running !== null}
          aria-disabled={nothingToPush}
          onClick={() => {
            if (nothingToPush) {
              return;
            }
            void run('push');
          }}
          title={!upstream ? `Publish ${status.branch} to the remote and track it` : status.ahead > 0 ? `Push ${plural(status.ahead)} to ${upstream}` : `Nothing to push: ${upstream} already has your commits`}
        >
          {icon('push', <PushIcon size="xs" />)}
          {upstream ? 'Push' : 'Publish branch'}
          {!!upstream && status.ahead > 0 && <span className="tabular-nums">{status.ahead}</span>}
        </button>
      )}
    </div>
  );
}
