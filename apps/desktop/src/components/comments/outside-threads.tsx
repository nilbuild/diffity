import type { CommentThread } from './types';
import { DEFAULT_AUTHOR } from './types';
import type { CommentActions } from '../../hooks/use-comment-actions';
import { OrphanedThreads } from './orphaned-threads';
import { MovedToCommitLink } from '../../features/comments/moved-to-commit-link';

interface OutsideThreadsProps {
  threads: CommentThread[];
  commentActions: CommentActions;
  viewEmpty?: boolean;
  className?: string;
}

/** Threads of this view whose file (or whole diff) is no longer part of it, e.g. after committing. */
export function OutsideThreads(props: OutsideThreadsProps) {
  const { threads, commentActions, viewEmpty, className } = props;

  if (threads.length === 0) {
    return null;
  }

  const count = `${threads.length} comment${threads.length === 1 ? '' : 's'}`;
  const title = viewEmpty
    ? `${count} left on changes that are no longer here`
    : `${count} on files that are no longer changed in this view`;

  return (
    <OrphanedThreads
      threads={threads}
      title={title}
      showFilePath
      className={className}
      onEditComment={commentActions.editComment}
      onDeleteComment={commentActions.deleteComment}
      onDeleteThread={commentActions.deleteThread}
      onReply={(threadId, body, options) => commentActions.addReply(threadId, body, DEFAULT_AUTHOR, options)}
      onResolve={commentActions.resolveThread}
      onUnresolve={commentActions.unresolveThread}
      renderExtra={(thread) => <MovedToCommitLink threadId={thread.id} filePath={thread.filePath} />}
    />
  );
}
