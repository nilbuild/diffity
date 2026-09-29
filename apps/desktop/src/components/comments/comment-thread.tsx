import { useState, useRef, useEffect } from 'react';
import type { CommentThread as CommentThreadType } from './types';
import type { CommentAuthor, CommentSide, SubmitOptions } from './types';
import { isThreadResolved } from './types';
import { CommentIcon } from '../icons/comment-icon';
import { ThreadBadge } from '../ui/thread-badge';
import { ThreadCard } from './thread-card';

interface CommentThreadProps {
  thread: CommentThreadType;
  onReply: (threadId: string, body: string, author: CommentAuthor, options?: SubmitOptions) => void;
  onResolve: (threadId: string) => void;
  onUnresolve: (threadId: string) => void;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onDeleteThread: (threadId: string) => void;
  currentAuthor: CommentAuthor;
  colSpan: number;
  viewMode?: 'unified' | 'split';
  side?: CommentSide;
  currentCode?: string;
}

function StatusBadge(props: { status: string }) {
  const { status } = props;

  switch (status) {
    case 'resolved':
      return <ThreadBadge variant='resolved' />;
    case 'dismissed':
      return <ThreadBadge variant='dismissed' />;
    default:
      return null;
  }
}

export function CommentThread(props: CommentThreadProps) {
  const {
    thread,
    onReply,
    onResolve,
    onUnresolve,
    onEditComment,
    onDeleteComment,
    onDeleteThread,
    currentAuthor,
    colSpan,
    viewMode,
    side,
    currentCode,
  } = props;
  const [isCollapsed, setIsCollapsed] = useState(isThreadResolved(thread));
  const rowRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) {
      return;
    }
    const handler = () => setIsCollapsed(false);
    el.addEventListener('diffity:focus-thread', handler);
    return () => el.removeEventListener('diffity:focus-thread', handler);
  }, []);

  const isOutdated =
    thread.anchorContent && currentCode && thread.anchorContent !== currentCode;

  if (isCollapsed) {
    const collapsedContent = (
      <td colSpan={colSpan} className="px-3 py-1 font-sans">
        <button
          onClick={() => setIsCollapsed(false)}
          className='thread-card inline-flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:bg-hover rounded-md transition-colors cursor-pointer'
        >
          <CommentIcon className='w-3.5 h-3.5' />
          <span>
            {thread.comments.length} comment
            {thread.comments.length !== 1 ? 's' : ''}
          </span>
          <StatusBadge status={thread.status} />
          {isOutdated && <ThreadBadge variant='outdated' />}
        </button>
      </td>
    );

    if (viewMode === 'split') {
      return (
        <tr ref={rowRef} data-thread-id={thread.id}>
          {side === 'old' ? (
            <>
              {collapsedContent}
              <td colSpan={colSpan}></td>
            </>
          ) : (
            <>
              <td colSpan={colSpan}></td>
              {collapsedContent}
            </>
          )}
        </tr>
      );
    }

    return <tr ref={rowRef} data-thread-id={thread.id}>{collapsedContent}</tr>;
  }

  const lineLabel =
    thread.startLine === thread.endLine
      ? `Line ${thread.startLine}`
      : `Lines ${thread.startLine}–${thread.endLine}`;

  const threadContent = (
    <td colSpan={colSpan} className="px-4 py-3 font-sans">
      <ThreadCard
        thread={thread}
        onReply={(body, options) => onReply(thread.id, body, currentAuthor, options)}
        onResolve={() => {
          onResolve(thread.id);
          setIsCollapsed(true);
        }}
        onUnresolve={() => onUnresolve(thread.id)}
        onEditComment={(commentId, body) => onEditComment(commentId, body)}
        onDeleteComment={(commentId) => onDeleteComment(thread.id, commentId)}
        onDeleteThread={() => onDeleteThread(thread.id)}
        className="thread-card max-w-[720px] bg-bg"
        headerLeft={
          <>
            <span className='text-[11px] text-text-muted font-mono'>
              {lineLabel}
            </span>
            <StatusBadge status={thread.status} />
            {isOutdated && <ThreadBadge variant='outdated' />}
          </>
        }
        headerRight={
          <button
            onClick={() => setIsCollapsed(true)}
            className='text-[11px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer ml-2'
          >
            Collapse
          </button>
        }
      />
    </td>
  );

  if (viewMode === 'split') {
    return (
      <tr ref={rowRef} data-thread-id={thread.id}>
        {side === 'old' ? (
          <>
            {threadContent}
            <td colSpan={colSpan}></td>
          </>
        ) : (
          <>
            <td colSpan={colSpan}></td>
            {threadContent}
          </>
        )}
      </tr>
    );
  }

  return <tr ref={rowRef} data-thread-id={thread.id}>{threadContent}</tr>;
}
