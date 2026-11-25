import { GENERAL_THREAD_FILE_PATH, type CommentThread } from './types';
import { cn } from '../../lib/cn';
import { openComments } from '../../lib/ui-store';
import { CommentIcon } from '../ui/icon';
import { useRepoNav } from '../../hooks/use-repo';
import { isAllChangesRef } from '../layout/ref-menu';

interface OutsideThreadsProps {
  threads: CommentThread[];
  viewEmpty?: boolean;
  className?: string;
}

/**
 * Open comments on code this view no longer shows: files that aren't changed in it any more (or, with no `paths`,
 * any code at all, for a view with no changes left). General comments are about the view, not code, so never count.
 */
export function threadsOutside(threads: CommentThread[], paths: Set<string> | null): CommentThread[] {
  return threads.filter((thread) => thread.status === 'open' && thread.filePath !== GENERAL_THREAD_FILE_PATH && !paths?.has(thread.filePath));
}

/** Points to the Comments panel for threads whose code is no longer part of this view, e.g. after committing. */
export function OutsideThreads(props: OutsideThreadsProps) {
  const { threads, viewEmpty, className } = props;

  if (threads.length === 0) {
    return null;
  }

  const count = `${threads.length} comment${threads.length === 1 ? '' : 's'}`;
  const label = viewEmpty ? `${count} on code that's no longer in this view` : `${count} on files that are no longer changed in this view`;

  return (
    <div className={cn('flex items-center justify-center gap-2 text-xs text-text-muted', className)}>
      <CommentIcon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
      <span aria-hidden>·</span>
      <button onClick={openComments} className="text-text-secondary underline decoration-text-muted/50 underline-offset-2 hover:text-text cursor-pointer">
        Show in Comments
      </button>
    </div>
  );
}

interface OtherViewThreadsProps {
  threads: CommentThread[];
  /** The other mode of this branch view, where these threads were left. */
  twin: string;
  className?: string;
}

/** Threads left in the other mode of a branch view (All changes / Committed only) that can't be placed in this one. */
export function OtherViewThreads(props: OtherViewThreadsProps) {
  const { threads, twin, className } = props;
  const nav = useRepoNav();

  if (threads.length === 0) {
    return null;
  }

  const count = `${threads.length} comment${threads.length === 1 ? '' : 's'}`;
  const toAllChanges = isAllChangesRef(twin);
  const label = toAllChanges ? `${count} on uncommitted changes` : `${count} from Committed only, on lines you've changed since`;

  return (
    <div className={cn('flex items-center justify-center gap-2 text-xs text-text-muted', className)}>
      <CommentIcon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
      <span aria-hidden>·</span>
      <button onClick={() => nav.toDiff(twin)} className="text-text-secondary underline decoration-text-muted/50 underline-offset-2 hover:text-text cursor-pointer">
        Show in {toAllChanges ? 'All changes' : 'Committed only'}
      </button>
    </div>
  );
}
