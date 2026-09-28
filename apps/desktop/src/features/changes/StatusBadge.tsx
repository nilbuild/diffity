import { cn } from '@/lib/cn';
import type { FileStatus } from '@/lib/types';

const LABELS: Record<FileStatus, { letter: string; className: string; title: string }> = {
  added: { letter: 'A', className: 'text-added bg-added/12', title: 'Added' },
  untracked: { letter: 'U', className: 'text-added bg-added/12', title: 'Untracked' },
  deleted: { letter: 'D', className: 'text-removed bg-removed/12', title: 'Deleted' },
  modified: { letter: 'M', className: 'text-warning bg-warning/12', title: 'Modified' },
  renamed: { letter: 'R', className: 'text-accent bg-accent-soft', title: 'Renamed' },
  copied: { letter: 'C', className: 'text-accent bg-accent-soft', title: 'Copied' },
};

export function FileStatusBadge(props: { status: FileStatus }) {
  const label = LABELS[props.status];
  return (
    <span
      title={label.title}
      className={cn('inline-flex size-4 shrink-0 items-center justify-center rounded-sm font-mono text-2xs font-bold', label.className)}
    >
      {label.letter}
    </span>
  );
}

export function DiffStat(props: { additions: number; deletions: number }) {
  const { additions, deletions } = props;
  return (
    <span className="shrink-0 font-mono text-2xs tabular-nums">
      {additions > 0 && <span className="text-added">+{additions}</span>}
      {additions > 0 && deletions > 0 && ' '}
      {deletions > 0 && <span className="text-removed">−{deletions}</span>}
    </span>
  );
}
