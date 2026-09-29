import { useState } from 'react';
import type { CommentThread as CommentThreadType, SubmitOptions } from './types';
import { isThreadResolved } from './types';
import { CommentBubble } from './comment-bubble';
import { CommentForm } from './comment-form';
import { cn } from '../../lib/cn';
import { enqueueClaude, useThreadActivity } from '../../features/claude/claude-runner';
import { useReviewState } from '../../features/review/review-state';
import { GitHubIcon, GitPullRequestIcon, SparkleIcon, TrashIcon } from '../ui/icon';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '../../lib/api';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { DEFAULT_AUTHOR } from './types';
import { hasDraft } from './comment-form';

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

function OriginBadge(props: { thread: CommentThreadType; prMode: boolean; prUrl: string | null }) {
  const { thread, prMode, prUrl } = props;
  const base = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium';

  if (thread.comments[0]?.author.type === 'agent') {
    return <span className={cn(base, 'bg-claude/12 text-claude')} title="Written by Claude, kept in Diffity">Claude</span>;
  }
  if (thread.pending) {
    return (
      <span className={cn(base, 'bg-fill text-text-secondary')} title={prMode ? 'Draft in your GitHub review; posted when you submit' : 'Draft; saved when you submit'}>
        {prMode ? 'Draft · GitHub' : 'Draft'}
      </span>
    );
  }
  if (thread.githubThreadId) {
    if (prUrl) {
      return (
        <a href={prUrl} className={cn(base, 'bg-added/12 text-added hover:underline')} title="Posted on GitHub — open the pull request">
          <GitHubIcon size={10} />
          Posted
        </a>
      );
    }
    return <span className={cn(base, 'bg-added/12 text-added')}><GitHubIcon size={10} />On GitHub</span>;
  }
  if (!prMode) {
    return null;
  }
  return <span className={cn(base, 'bg-fill text-text-secondary')} title="Only in Diffity; not part of your GitHub review">Local</span>;
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
  const review = useReviewState();
  const replyKey = `reply:${thread.id}`;
  const [showReply, setShowReply] = useState(() => hasDraft(review.sessionId, replyKey));
  const claudeThread = thread.comments[0]?.author.type === 'agent';
  const resolved = isThreadResolved(thread);
  const activity = useThreadActivity(thread.id);
  const canAskClaude = review.enabled && !resolved && !thread.pending && activity === 'idle' && !!onReply;

  const { details } = useGitHubPr();
  const queryClient = useQueryClient();
  const canPromote = review.prMode && claudeThread && !resolved && !!details && !!review.sessionId;

  const promote = async () => {
    const first = thread.comments[0];
    if (!first || !review.sessionId || !details) {
      return;
    }
    try {
      await api.createThread({
        sessionId: review.sessionId,
        filePath: thread.filePath,
        side: thread.side,
        startLine: thread.startLine,
        endLine: thread.endLine,
        body: first.body,
        author: DEFAULT_AUTHOR,
        anchorContent: thread.anchorContent ?? undefined,
        options: { pending: true },
      });
      await api.updateThreadStatus(thread.id, 'resolved', 'Added to the GitHub review as a draft');
      queryClient.invalidateQueries({ queryKey: ['threads', review.sessionId] });
      queryClient.invalidateQueries({ queryKey: ['reviews', review.sessionId] });
      toast.success(`Added to your review on PR #${details.prNumber}`, { description: 'It is a draft until you submit the review. Edit it first if you like.' });
    } catch (error) {
      toast.error('Could not add it to your review', { description: api.errorMessage(error) });
    }
  };

  const resolveWithClaude = () => {
    enqueueClaude({ kind: 'resolve', threadId: thread.id }, { repoPath: api.getRepoPath(), sessionId: thread.sessionId ?? null });
  };

  return (
    <div className={cn('rounded-lg overflow-hidden border border-border', className)} data-thread-id={thread.id}>
      <div className="flex items-center justify-between h-9 px-3 bg-bg-secondary border-b border-border-muted">
        <div className="flex items-center gap-2">
          {headerLeft}
          <OriginBadge thread={thread} prMode={review.prMode} prUrl={details?.pr?.url ?? null} />
        </div>
        <div className="flex items-center gap-1">
          {canPromote && (
            <button
              onClick={() => void promote()}
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text transition-colors cursor-pointer mr-2"
              title="Copy Claude's comment into your GitHub review as a draft you can edit"
            >
              <GitPullRequestIcon size="xs" className="text-added" />
              Add to my review
            </button>
          )}
          {canAskClaude && !canPromote && (
            <button
              onClick={resolveWithClaude}
              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text transition-colors cursor-pointer mr-2"
              title="Ask Claude Code to address this thread"
            >
              <SparkleIcon className="w-3 h-3 text-claude" />
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
            <span className="inline-block w-3 h-3 border-2 border-claude/25 border-t-claude rounded-full animate-spin" />
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
              reviewable={!claudeThread}
              isReply
              draftKey={replyKey}
              threadPending={!!thread.pending}
            />
          </div>
        ) : (
          <div className="px-3 pb-3">
            <button
              onClick={() => setShowReply(true)}
              className="h-7 px-2.5 -ml-2.5 rounded-md text-[13px] text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              Reply
            </button>
          </div>
        )
      )}
    </div>
  );
}
