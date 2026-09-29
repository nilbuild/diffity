import { useState } from 'react';
import type { CommentThread as CommentThreadType, SubmitOptions } from './types';
import { isThreadResolved } from './types';
import { CommentBubble } from './comment-bubble';
import { CommentForm } from './comment-form';
import { TrashIcon } from '../icons/trash-icon';
import { SparkleIcon } from '../icons/sparkle-icon';
import { cn } from '../../lib/cn';
import { getRepoPath } from '../../lib/api';
import { enqueueClaude, useThreadActivity } from '../../features/claude/claude-runner';
import { useReviewState } from '../../features/review/review-state';

interface ThreadCardProps {
  thread: CommentThreadType;
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (commentId: string) => void;
  onDeleteThread: () => void;
  onReply?: (body: string, options: SubmitOptions) => void;
  onResolve?: () => void;
  onUnresolve?: () => void;
  headerLeft?: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function ThreadCard(props: ThreadCardProps) {
  const {
    thread,
    onEditComment,
    onDeleteComment,
    onDeleteThread,
    onReply,
    onResolve,
    onUnresolve,
    headerLeft,
    headerRight,
    className,
    children,
  } = props;
  const [showReply, setShowReply] = useState(false);
  const resolved = isThreadResolved(thread);
  const activity = useThreadActivity(thread.id);
  const review = useReviewState();
  const canAskClaude = review.enabled && !resolved && !thread.pending && activity === 'idle' && !!onReply;

  const resolveWithClaude = () => {
    enqueueClaude({ kind: 'resolve', threadId: thread.id }, { repoPath: getRepoPath(), sessionId: thread.sessionId ?? null });
  };

  return (
    <div className={cn('rounded-lg overflow-hidden border border-border', className)} data-thread-id={thread.id}>
      <div className="flex items-center justify-between h-9 px-3 bg-bg-secondary border-b border-border-muted">
        <div className="flex items-center gap-2">
          {headerLeft}
        </div>
        <div className="flex items-center gap-1">
          {canAskClaude && (
            <button
              onClick={resolveWithClaude}
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-accent transition-colors cursor-pointer mr-2"
              title="Ask Claude Code to address this thread"
            >
              <SparkleIcon className="w-3 h-3" />
              Resolve with Claude
            </button>
          )}
          {onResolve && onUnresolve && (
            resolved ? (
              <button
                onClick={onUnresolve}
                className="h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                Reopen
              </button>
            ) : (
              <button
                onClick={onResolve}
                className="h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
              >
                Resolve
              </button>
            )
          )}
          {headerRight}
          <button
            onClick={onDeleteThread}
            className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-muted hover:text-deleted hover:bg-hover transition-colors cursor-pointer"
            title="Delete thread"
          >
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {children}
      <div>
        {thread.comments.map((comment) => (
          <CommentBubble
            key={comment.id}
            comment={comment}
            onEdit={(body) => onEditComment(comment.id, body)}
            onDelete={() => onDeleteComment(comment.id)}
          />
        ))}
      </div>
      {activity !== 'idle' && (
        <div className="flex items-center gap-2 px-4 pb-2 text-xs text-text-muted">
          {activity === 'working' ? (
            <span className="inline-block w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          ) : (
            <SparkleIcon className="w-3 h-3" />
          )}
          {activity === 'working' ? 'Claude Code is working…' : 'Queued for Claude Code'}
        </div>
      )}
      {onReply && (
        showReply ? (
          <div className="px-3 pb-3">
            <CommentForm
              onSubmit={(body, options) => {
                onReply(body, options);
                setShowReply(false);
              }}
              onCancel={() => setShowReply(false)}
              placeholder="Reply..."
              submitLabel="Reply"
              reviewable
              threadPending={!!thread.pending}
            />
          </div>
        ) : (
          <div className="px-3 pb-3">
            <button
              onClick={() => setShowReply(true)}
              className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
            >
              Reply
            </button>
          </div>
        )
      )}
    </div>
  );
}
