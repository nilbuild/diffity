import { cn } from '@/lib/cn';
import { ClockIcon, XIcon } from '@/components/ui/icon';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Spinner } from '@/components/ui/Spinner';
import { cancelQueuedJob, clearQueuedJobs, useRunQueue } from './run-queue';

/** Pending `@claude` thread / review runs, shown above the composer while more than the current run is waiting. */
export function RunQueue() {
  const jobs = useRunQueue((state) => state.jobs);
  const queued = jobs.filter((job) => job.state === 'queued');

  if (queued.length === 0) {
    return null;
  }

  return (
    <div className="mx-3 mb-1 overflow-hidden rounded-lg border border-border bg-raised">
      <div className="flex h-7 items-center gap-2 border-b border-border-subtle pr-1 pl-2.5">
        <ClockIcon size={12} className="text-fg-subtle" />
        <span className="text-xs font-medium text-fg">Queue</span>
        <span className="text-2xs text-fg-subtle tabular-nums">{queued.length} waiting</span>
        <Button size="sm" variant="ghost" className="ml-auto h-5 px-1.5 text-2xs" onClick={clearQueuedJobs}>
          Clear
        </Button>
      </div>
      <ul className="max-h-[132px] overflow-y-auto py-0.5">
        {jobs.map((job, index) => (
          <li key={job.id} className="group flex h-7 items-center gap-2 pr-1 pl-2.5 text-xs">
            <span className="flex w-3 shrink-0 justify-center">
              {job.state === 'running' ? (
                <Spinner size={12} className="text-accent" />
              ) : (
                <span className="text-2xs text-fg-subtle tabular-nums">{index + 1}</span>
              )}
            </span>
            <span className={cn('min-w-0 truncate', job.state === 'running' ? 'text-fg' : 'text-fg-muted')}>
              {job.title}
            </span>
            {job.detail && <span className="min-w-0 truncate font-mono text-2xs text-fg-subtle">{job.detail}</span>}
            {job.state === 'running' ? (
              <span className="ml-auto shrink-0 pr-1.5 text-2xs text-accent">Running</span>
            ) : (
              <IconButton
                size="sm"
                label="Remove from queue"
                className="ml-auto opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                onClick={() => cancelQueuedJob(job.id)}
              >
                <XIcon size={12} />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
