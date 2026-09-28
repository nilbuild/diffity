import { CommentIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import type { FileStatus } from '@/lib/types';

const LABELS: Record<FileStatus, { letter: string; className: string; title: string }> = {
  added: { letter: 'A', className: 'bg-added', title: 'Added' },
  untracked: { letter: 'U', className: 'bg-added', title: 'Untracked' },
  deleted: { letter: 'D', className: 'bg-removed', title: 'Deleted' },
  modified: { letter: 'M', className: 'bg-warning', title: 'Modified' },
  renamed: { letter: 'R', className: 'bg-renamed', title: 'Renamed' },
  copied: { letter: 'C', className: 'bg-renamed', title: 'Copied' },
};

export function FileStatusBadge(props: { status: FileStatus }) {
  const label = LABELS[props.status];
  return (
    <span title={label.title} aria-label={label.title} className={cn('size-2.5 shrink-0 rounded-full', label.className)} />
  );
}

export function DiffStat(props: { additions: number; deletions: number }) {
  const { additions, deletions } = props;
  return (
    <span className="inline-flex shrink-0 gap-1 text-xs tabular-nums">
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
