import { useState } from 'react';
import type { CommentThread as CommentThreadType, SubmitOptions } from './types';
import { isThreadResolved } from './types';
import { CommentBubble } from './comment-bubble';
import { CommentForm } from './comment-form';
import { cn } from '../../lib/cn';
import { enqueueClaude, useThreadActivity } from '../../features/claude/claude-runner';
import { useReviewState } from '../../features/review/review-state';
import { EllipsisIcon, GitHubIcon, GitPullRequestIcon, SparkleIcon } from '../ui/icon';
import { Popover, useMenu } from '../ui/popover';
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
  /** Narrow cards: secondary actions move into the ⋯ menu. */
  compact?: boolean;
}

function ThreadMenu(props: { items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
  const { items } = props;
  const menu = useMenu();

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        className="w-6 h-6 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
        title="More"
        aria-label="More thread actions"
      >
        <EllipsisIcon size="sm" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={200}>
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              menu.close();
              item.onSelect();
            }}
            className={cn('flex items-center w-full h-8 px-2.5 rounded-md text-left text-[13px] hover:bg-hover cursor-pointer', item.danger ? 'text-deleted' : 'text-text')}
          >
            {item.label}
          </button>
        ))}
      </Popover>
    </>
  );
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
    compact = false,
  } = props;
  const review = useReviewState();
  const replyKey = `reply:${thread.id}`;
  const [showReply, setShowReply] = useState(() => hasDraft(review.sessionId, replyKey));
  const claudeThread = thread.comments[0]?.author.type === 'agent';
  const resolved = isThreadResolved(thread);
  const activity = useThreadActivity(thread.id);
  const canAskClaude = review.enabled && !resolved && !thread.pending && activity === 'idle' && !!onReply;
  const lastByClaude = thread.comments[thread.comments.length - 1]?.author.type === 'agent';
  const showAskClaude = canAskClaude && !lastByClaude;

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
      <div className="flex items-center gap-2 h-9 px-3 bg-bg-secondary border-b border-border-muted whitespace-nowrap">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {headerLeft}
          <OriginBadge thread={thread} prMode={review.prMode} prUrl={details?.pr?.url ?? null} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {headerRight}
          {!compact && canPromote && (
            <button
              onClick={() => void promote()}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
              title="Copy Claude's comment into your GitHub review as a draft you can edit"
            >
              <GitPullRequestIcon size="xs" className="text-added" />
              Add to my review
            </button>
          )}
          {!compact && showAskClaude && !canPromote && (
            <button
              onClick={resolveWithClaude}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
              title="Ask Claude Code to address this thread"
            >
              <SparkleIcon className="w-3 h-3 text-claude" />
              Ask Claude
            </button>
          )}
          {!compact && onResolve && onUnresolve && (
            <button
              onClick={resolved ? onUnresolve : onResolve}
              className="h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              {resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
          <ThreadMenu
            items={[
              ...(compact && onResolve && onUnresolve && !resolved ? [{ label: 'Mark as addressed', onSelect: onResolve }] : []),
              ...(compact && onUnresolve && resolved ? [{ label: 'Reopen', onSelect: onUnresolve }] : []),
              ...(canAskClaude && (compact || !showAskClaude || canPromote) ? [{ label: 'Ask Claude about it', onSelect: resolveWithClaude }] : []),
              ...(compact && canPromote ? [{ label: 'Add to my review', onSelect: () => void promote() }] : []),
              { label: 'Delete thread', onSelect: onDeleteThread, danger: true },
            ]}
          />
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
        <div className="flex items-center gap-2 px-3 pb-2 text-xs text-text-muted">
          <span className="flex w-5 justify-center shrink-0">
            {activity === 'working' ? (
              <span className="inline-block w-3 h-3 border-2 border-claude/25 border-t-claude rounded-full animate-spin" />
            ) : (
              <SparkleIcon className="w-3 h-3 text-claude" />
            )}
          </span>
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
              placeholder={lastByClaude && review.enabled ? 'Reply to Claude…' : 'Reply…'}
              submitLabel="Reply"
              reviewable={!claudeThread}
              isReply
              draftKey={replyKey}
              threadPending={!!thread.pending}
              claudeReplies={lastByClaude && review.enabled}
            />
          </div>
        ) : (
          <div className="pl-10 pr-3 pb-3">
            <button
              onClick={() => setShowReply(true)}
              className="flex items-center w-full h-8 px-2.5 rounded-md border border-control-border bg-raised text-left text-[13px] text-text-muted hover:border-focus hover:text-text-secondary transition-colors cursor-text"
            >
              {lastByClaude && review.enabled ? 'Reply to Claude…' : 'Reply…'}
            </button>
          </div>
        )
      )}
    </div>
  );
}
