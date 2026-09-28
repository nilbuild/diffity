import { cn } from '@/lib/cn';
import type { FileStatus } from '@/lib/types';

const LABELS: Record<FileStatus, { letter: string; className: string; title: string }> = {
  added: { letter: 'A', className: 'text-success bg-success/12', title: 'Added' },
  untracked: { letter: 'U', className: 'text-success bg-success/12', title: 'Untracked' },
  deleted: { letter: 'D', className: 'text-danger bg-danger/12', title: 'Deleted' },
  modified: { letter: 'M', className: 'text-warning bg-warning/12', title: 'Modified' },
  renamed: { letter: 'R', className: 'text-accent bg-accent-subtle', title: 'Renamed' },
  copied: { letter: 'C', className: 'text-accent bg-accent-subtle', title: 'Copied' },
};

export function FileStatusBadge(props: { status: FileStatus }) {
  const label = LABELS[props.status];
  return (
    <span
      title={label.title}
      className={cn('inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] font-mono text-[10px] font-bold', label.className)}
    >
      {label.letter}
    </span>
  );
}

export function DiffStat(props: { additions: number; deletions: number }) {
  const { additions, deletions } = props;
  return (
    <span className="shrink-0 font-mono text-[11px] tabular-nums">
      {additions > 0 && <span className="text-success">+{additions}</span>}
      {additions > 0 && deletions > 0 && ' '}
      {deletions > 0 && <span className="text-danger">−{deletions}</span>}
    </span>
  );
}
