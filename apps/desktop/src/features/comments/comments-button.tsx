import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { Skeleton } from '../../components/ui/skeleton';
import { toggleComments, useUi } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { buttonOutline } from '../../components/ui/button-styles';
import { CommentIcon } from '../../components/ui/icon';

export function CommentsButton() {
  const { data, isPending, isError } = useRepoThreads();
  const count = (data ?? []).filter(isOpenThread).length;
  const loading = isPending && !isError;
  const open = useUi((state) => state.commentsOpen);

  return (
    <button
      onClick={toggleComments}
      className={cn(buttonOutline, 'px-2.5', open && 'bg-selected hover:bg-selected')}
      title={`All comments in this repository, across every view${count > 0 ? ` (${count} open)` : ''} — C`}
      aria-pressed={open}
    >
      <CommentIcon size="md" className="text-text-secondary" />
      {loading && <Skeleton className="w-2 h-3" />}
      {count > 0 && <span className="text-[13px] tabular-nums text-text">{count}</span>}
    </button>
  );
}
