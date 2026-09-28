import { CommentIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { FileStatus } from '@/lib/types';

const LABELS: Record<FileStatus, { letter: string; className: string; title: string }> = {
  added: { letter: 'A', className: 'text-added bg-added/15', title: 'Added' },
  untracked: { letter: 'U', className: 'text-added bg-added/15', title: 'Untracked' },
  deleted: { letter: 'D', className: 'text-removed bg-removed/15', title: 'Deleted' },
  modified: { letter: 'M', className: 'text-warning bg-warning/15', title: 'Modified' },
  renamed: { letter: 'R', className: 'text-renamed bg-renamed/15', title: 'Renamed' },
  copied: { letter: 'C', className: 'text-renamed bg-renamed/15', title: 'Copied' },
};

export function FileStatusBadge(props: { status: FileStatus }) {
  const label = LABELS[props.status];
  return (
    <span
      title={label.title}
      className={cn('inline-flex size-[18px] shrink-0 items-center justify-center rounded-sm font-mono text-2xs font-bold', label.className)}
    >
      {label.letter}
    </span>
  );
}

export function DiffStat(props: { additions: number; deletions: number }) {
  const { additions, deletions } = props;
  return (
    <span className="inline-flex shrink-0 gap-1 font-mono text-xs font-semibold tabular-nums">
      {additions > 0 && <span className="text-added">+{additions}</span>}
      {deletions > 0 && <span className="text-removed">−{deletions}</span>}
    </span>
  );
}

export function CommentCount(props: { count: number; tone?: 'accent' | 'muted' }) {
  const { count, tone = 'accent' } = props;
  return (
    <span
      title={`${count} open ${count === 1 ? 'comment' : 'comments'}`}
      className={cn('inline-flex shrink-0 items-center gap-1 text-2xs font-semibold tabular-nums', tone === 'accent' ? 'text-accent' : 'text-fg-subtle')}
    >
      <CommentIcon size={12} />
      {count}
    </span>
  );
}
