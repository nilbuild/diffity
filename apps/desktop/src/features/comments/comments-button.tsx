import { CommentIcon } from '../../components/icons/comment-icon';
import { useOpenThreadCount } from '../../hooks/use-repo-threads';
import { toggleComments, useUi } from '../../lib/ui-store';
import { cn } from '../../lib/cn';

export function CommentsButton() {
  const count = useOpenThreadCount();
  const open = useUi((state) => state.commentsOpen);

  return (
    <button
      onClick={toggleComments}
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-colors cursor-pointer shrink-0',
        open ? 'bg-accent/15 text-accent' : 'bg-bg-tertiary text-text-muted hover:text-text hover:bg-hover',
      )}
      title={`All comments in this repository, across every view${count > 0 ? ` (${count} open)` : ''} — C`}
    >
      <CommentIcon className="w-3.5 h-3.5" />
      <span className="hidden min-[1320px]:inline">Comments</span>
      {count > 0 && (
        <span className="min-w-4 px-1 rounded-full bg-accent text-white text-[10px] font-semibold leading-4 text-center tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
