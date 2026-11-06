import { useState, useRef, useEffect } from 'react';
import type { CommentThread as CommentThreadType } from './types';
import type { CommentAuthor, CommentSide, SubmitOptions } from './types';
import { isThreadResolved } from './types';
import { ThreadBadge } from '../ui/thread-badge';
import { ThreadCard, ThreadMenu } from './thread-card';
import { CheckCircleIcon, CommentIcon, FoldIcon, UnfoldIcon } from '../ui/icon';
import { cn } from '../../lib/cn';
import { commentPreview } from './comment-preview';
import { AuthorAvatar } from './comment-bubble';
import { useViewState } from '../../lib/view-state';
import { appliedSuggestion } from '../../features/suggestions/suggestion';

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
  const [isCollapsed, setIsCollapsed] = useViewState(`thread:${thread.id}:collapsed`, () => isThreadResolved(thread));
  const rowRef = useRef<HTMLTableRowElement>(null);
  const resolved = isThreadResolved(thread);
  const wasResolved = useRef(resolved);
  const [justChanged, setJustChanged] = useState(false);

  useEffect(() => {
    if (wasResolved.current === resolved) {
      return;
    }
    wasResolved.current = resolved;
    setJustChanged(true);
    setIsCollapsed(resolved);
  }, [resolved, setIsCollapsed]);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) {
      return;
    }
    const handler = () => setIsCollapsed(false);
    el.addEventListener('diffity:focus-thread', handler);
    return () => el.removeEventListener('diffity:focus-thread', handler);
  }, [setIsCollapsed]);

  const isOutdated =
    thread.anchorContent && currentCode && thread.anchorContent !== currentCode
    && !appliedSuggestion(thread.comments.map((comment) => comment.body), currentCode);

  if (isCollapsed) {
    const first = thread.comments[0];
    const replies = thread.comments.length - 1;
    const collapsedContent = (
      <td colSpan={colSpan} className="px-4 py-1.5 font-sans">
        <div className={cn('thread-card flex items-center gap-2 max-w-[720px] h-9 pl-3 pr-1.5 rounded-lg border border-border bg-bg-secondary text-xs', justChanged && 'animate-fade-in')}>
          {resolved
            ? <CheckCircleIcon className={cn('w-3.5 h-3.5 shrink-0', thread.status === 'resolved' ? 'text-added' : 'text-text-muted')} />
            : <CommentIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />}
          {thread.status === 'dismissed' && <ThreadBadge variant='dismissed' />}
          {isOutdated && <ThreadBadge variant='outdated' />}
          {first && (
            <span className="shrink-0" title={first.author.name}>
              <AuthorAvatar name={first.author.name} avatarUrl={first.author.avatarUrl} type={first.author.type} />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-text-muted">{first ? commentPreview(first.body) : ''}</span>
          {replies > 0 && <span className="shrink-0 text-text-muted">{replies} repl{replies === 1 ? 'y' : 'ies'}</span>}
          <span className="flex items-center gap-1 shrink-0">
            {resolved && (
              <button
                onClick={() => onUnresolve(thread.id)}
                className="h-6 px-2 rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                Reopen
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(false)}
              className="h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              <UnfoldIcon size="xs" />
              Show
            </button>
            <ThreadMenu items={[{ label: 'Delete thread', onSelect: () => onDeleteThread(thread.id), danger: true }]} />
          </span>
        </div>
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
        headerRight={resolved && (
          <button
            onClick={() => setIsCollapsed(true)}
            className="h-6 px-2 inline-flex items-center gap-1.5 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
          >
            <FoldIcon size="xs" />
            Hide
          </button>
        )}
        menuItems={resolved ? [] : [{ label: 'Collapse', onSelect: () => setIsCollapsed(true) }]}
        currentCode={currentCode}
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
