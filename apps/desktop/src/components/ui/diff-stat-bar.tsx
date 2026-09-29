import { cn } from '../../lib/cn';

export function DiffStatBar(props: { additions: number; deletions: number; blocks?: number }) {
  const { additions, deletions, blocks = 5 } = props;
  const total = additions + deletions;
  const added = total === 0 ? 0 : Math.round((additions / total) * blocks);
  const removed = total === 0 ? 0 : Math.min(blocks - added, Math.max(deletions > 0 ? 1 : 0, Math.round((deletions / total) * blocks)));

  return (
    <span className="inline-flex items-center gap-[2px]" aria-hidden>
      {Array.from({ length: blocks }, (_, index) => (
        <span
          key={index}
          className={cn('w-[7px] h-[7px] rounded-[2px]', index < added ? 'bg-added' : index < added + removed ? 'bg-deleted' : 'bg-fill-hover')}
        />
      ))}
    </span>
  );
}
