import { CommentIcon } from '../../components/icons/comment-icon';
import { useOpenThreadCount } from '../../hooks/use-repo-threads';
import { toggleComments, useUi } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { buttonOutline } from '../../components/ui/button-styles';

export function CommentsButton() {
  const count = useOpenThreadCount();
  const open = useUi((state) => state.commentsOpen);

  return (
    <button
      onClick={toggleComments}
      className={cn(
        buttonOutline,
        'px-2.5',
        open && 'bg-selected border-accent/40 text-accent hover:bg-selected',
      )}
      title={`All comments in this repository, across every view${count > 0 ? ` (${count} open)` : ''} — C`}
    >
      <CommentIcon className="w-3.5 h-3.5" />
      <span className="hidden min-[1440px]:inline">Comments</span>
      {count > 0 && (
        <span className="min-w-4 px-1 rounded-full bg-accent/15 text-accent text-[10px] font-semibold leading-4 text-center tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}
