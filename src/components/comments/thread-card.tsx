import type { CommentThread as CommentThreadType, SubmitOptions } from './types';
import { isThreadResolved } from './types';
import { CommentBubble } from './comment-bubble';
import { CommentForm } from './comment-form';
import { cn } from '../../lib/cn';
import { enqueueClaude, useThreadActivity, useThreadRunAgent } from '../../features/claude/claude-runner';
import { agentByName, agentMeta } from '../../features/claude/agents';
import { pickForAgent, useRunPick } from '../../features/claude/model-setting';
import { AskClaudeThreadButton } from '../../features/claude/ask-claude-thread';
import { useReviewState } from '../../features/review/review-state';
import { EllipsisVerticalIcon, GitHubIcon, GitPullRequestIcon, SparkleIcon } from '../ui/icon';
import { Popover, useMenu } from '../ui/popover';
import * as api from '../../lib/api';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { hasDraft } from './comment-form';
import { useViewState } from '../../lib/view-state';
import { Spinner } from '../icons/spinner';
import { useState } from 'react';
import { SuggestionThreadContext } from '../../features/suggestions/suggestion-block';
import { PromoteForm } from '../../features/review/promote-form';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { useRepoNav } from '../../hooks/use-repo';
import { useUncommittedPaths } from '../layout/diff-context-bar';
import { uncommittedTwin } from '../layout/ref-menu';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { AddressedBadge } from './addressed-badge';

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
  /** Extra ⋯ entries shown first (e.g. Collapse). */
  menuItems?: { label: string; onSelect: () => void }[];
  className?: string;
  children?: React.ReactNode;
  /** Narrow cards: secondary actions move into the ⋯ menu. */
  compact?: boolean;
  /** What the thread's lines read now (from the diff), for suggested changes. */
  currentCode?: string;
}

export function ThreadMenu(props: { items: { label: string; onSelect: () => void; danger?: boolean }[] }) {
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
        <EllipsisVerticalIcon size="sm" />
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

  const first = thread.comments[0];
  if (first?.author.type === 'agent') {
    const name = agentByName(first.author.name)?.short ?? first.author.name;
    return <span className={cn(base, 'bg-claude/12 text-claude')} title={`Written by ${name}, kept in Diffity`}>{name}</span>;
  }
  if (thread.pending) {
    return (
      <span className={cn(base, 'bg-fill text-text-secondary')} title={prMode ? 'In your GitHub review. Posted when you submit the review.' : 'Saved when you submit the review'}>
        Draft
      </span>
    );
  }
  if (thread.githubThreadId) {
    if (prUrl) {
      return (
        <a href={prUrl} className={cn(base, 'bg-added/12 text-added hover:underline')} title="Open the pull request on GitHub">
          <GitHubIcon size={10} />
          On GitHub
        </a>
      );
    }
    return <span className={cn(base, 'bg-added/12 text-added')}><GitHubIcon size={10} />On GitHub</span>;
  }
  if (!prMode) {
    return null;
  }
  return <span className={cn(base, 'bg-fill text-text-secondary')} title="Not on GitHub. It goes there only if you tick it in Submit review.">Diffity only</span>;
}

/**
 * A view that ends at a commit (a PR, a commit) can't show an agent's edits until they're committed, so the reply
 * says "fixed" next to old code. Points to where the edit is.
 */
function UncommittedChangeNote(props: { filePath: string }) {
  const { filePath } = props;
  const viewRef = useCurrentViewRef();
  const uncommitted = useUncommittedPaths();
  const nav = useRepoNav();

  if (!viewRef || !viewRef.includes('..') || !uncommitted?.has(filePath)) {
    return null;
  }
  // A branch or PR view's All changes mode includes uncommitted edits; elsewhere only Uncommitted changes has them.
  const twin = uncommittedTwin(viewRef);
  const target = `/r/${encodeURIComponent(nav.repoPath)}/diff?${new URLSearchParams({ ref: twin ?? 'work', file: filePath }).toString()}`;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-10 pr-3 pb-2 text-xs text-text-secondary">
      <span className="min-w-0">
        <span className="inline-block w-1.5 h-1.5 mr-1.5 rounded-full bg-modified align-middle -mt-px" aria-hidden />
        Changed locally, not committed yet
      </span>
      <button
        type="button"
        onClick={() => nav.navigate(target)}
        className="text-text underline decoration-text-muted/50 underline-offset-2 hover:decoration-text cursor-pointer"
        title={twin ? 'Switch to All changes, which includes uncommitted edits' : 'Open this file in Uncommitted changes'}
      >
        {twin ? 'Show in All changes' : 'Show change'}
      </button>
    </div>
  );
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
    menuItems = [],
    className,
    children,
    compact = false,
    currentCode,
  } = props;
  const review = useReviewState();
  const replyKey = `reply:${thread.id}`;
  const [showReply, setShowReply] = useViewState(`thread:${thread.id}:reply`, () => hasDraft(review.sessionId, replyKey));
  const claudeThread = thread.comments[0]?.author.type === 'agent';
  const resolved = isThreadResolved(thread);
  const activity = useThreadActivity(thread.id);
  const canAskClaude = review.enabled && !resolved && !thread.pending && activity === 'idle' && !!onReply;
  const last = thread.comments[thread.comments.length - 1];
  const lastByClaude = last?.author.type === 'agent';
  const lastAgentName = lastByClaude ? agentByName(last.author.name)?.short ?? last.author.name : null;
  const fixPick = useRunPick('fix', api.getRepoPath());
  const askPick = pickForAgent(fixPick, (lastByClaude ? agentByName(last.author.name)?.id : null) ?? fixPick.agent);
  const askAgent = agentMeta(askPick.agent);
  const runAgentId = useThreadRunAgent(thread.id);
  const runAgentName = runAgentId ? agentMeta(runAgentId).short : null;
  const showAskClaude = canAskClaude && !lastByClaude;
  const addressedBy = !resolved && thread.addressedBy ? agentByName(thread.addressedBy)?.short ?? thread.addressedBy : null;

  const { details } = useGitHubPr();
  const { data: sessionThreads } = useReviewThreads(review.sessionId);
  const promotedDraft = claudeThread ? sessionThreads?.find((item) => item.promotedFrom === thread.id) : undefined;
  const [composingPromote, setComposingPromote] = useState(false);
  const canPromote = review.promotePr !== null && claudeThread && !resolved && !!review.sessionId && !promotedDraft;
  const promoteTitle = review.promoteBlocked ?? `Write a draft for your GitHub review from ${lastAgentName ?? 'the agent'}'s comment`;
  const startPromote = () => {
    if (review.promoteBlocked) {
      return;
    }
    setComposingPromote(true);
  };

  const askClaude = () => {
    enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath: api.getRepoPath(), sessionId: thread.sessionId ?? null, pick: askPick });
  };

  return (
    <div className={cn('rounded-lg overflow-hidden border border-border', className)} data-thread-id={thread.id}>
      <div className="flex items-center gap-2 h-9 px-3 bg-bg-secondary border-b border-border-muted whitespace-nowrap">
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {headerLeft}
          <OriginBadge thread={thread} prMode={review.prMode} prUrl={details?.pr?.url ?? null} />
          {addressedBy && <AddressedBadge agent={addressedBy} />}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {promotedDraft && !resolved && (
            <span
              className="inline-flex items-center gap-1 h-6 px-2 text-xs text-text-secondary"
              title={`Your draft from this comment is in your review. This comment is resolved when the review is posted; delete the draft to undo.`}
            >
              <GitPullRequestIcon size="xs" className="text-added" />
              In your review
            </span>
          )}
          {!compact && canPromote && (
            <button
              onClick={startPromote}
              disabled={composingPromote || !!review.promoteBlocked}
              className="inline-flex items-center gap-1 h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-text-secondary"
              title={promoteTitle}
            >
              <GitPullRequestIcon size="xs" className="text-added" />
              Add to my review
            </button>
          )}
          {!compact && showAskClaude && !canPromote && (
            <AskClaudeThreadButton threadId={thread.id} sessionId={thread.sessionId ?? null} />
          )}
          {!compact && onResolve && onUnresolve && (
            <button
              onClick={resolved ? onUnresolve : onResolve}
              className="h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
            >
              {resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {headerRight}
          <ThreadMenu
            items={[
              ...menuItems,
              ...(compact && onResolve && onUnresolve && !resolved ? [{ label: 'Resolve', onSelect: onResolve }] : []),
              ...(compact && onUnresolve && resolved ? [{ label: 'Reopen', onSelect: onUnresolve }] : []),
              ...(canAskClaude && (compact || !showAskClaude || canPromote) ? [{ label: `Ask ${askAgent.short}`, onSelect: askClaude }] : []),
              ...(compact && canPromote && !review.promoteBlocked ? [{ label: 'Add to my review', onSelect: startPromote }] : []),
              { label: 'Delete thread', onSelect: onDeleteThread, danger: true },
            ]}
          />
        </div>
      </div>
      {children}
      <SuggestionThreadContext.Provider value={{ thread, currentCode }}>
        {thread.comments.map((comment) => (
          <CommentBubble
            key={comment.id}
            comment={comment}
            onEdit={(body) => onEditComment(comment.id, body)}
            onDelete={() => onDeleteComment(comment.id)}
          />
        ))}
      </SuggestionThreadContext.Provider>
      {lastByClaude && activity === 'idle' && <UncommittedChangeNote filePath={thread.filePath} />}
      {activity !== 'idle' && (
        <div className="flex items-center gap-2 pl-10 pr-3 pb-2 text-xs text-text-muted">
          <span className="flex justify-center shrink-0">
            {activity === 'working' ? (
              <Spinner className="text-claude" />
            ) : (
              <SparkleIcon className="w-3 h-3 text-claude" />
            )}
          </span>
          {activity === 'working' ? `${runAgentName ?? 'Agent'} is working…` : runAgentName ? `Queued for ${runAgentName}` : 'Queued'}
        </div>
      )}
      {composingPromote && canPromote && review.sessionId && review.promotePr !== null && (
        <PromoteForm
          thread={thread}
          sessionId={review.sessionId}
          prNumber={review.promotePr}
          agentName={agentByName(thread.comments[0]?.author.name ?? '')?.short ?? thread.comments[0]?.author.name ?? 'The agent'}
          onClose={() => setComposingPromote(false)}
        />
      )}
      {onReply && !composingPromote && (
        showReply ? (
          <div className="px-3 pb-3">
            <CommentForm
              onSubmit={(body, options) => {
                onReply(body, options);
                setShowReply(false);
              }}
              onCancel={() => setShowReply(false)}
              placeholder={lastAgentName && review.enabled ? `Reply to ${lastAgentName}…` : 'Reply…'}
              submitLabel="Reply"
              reviewable={!claudeThread}
              isReply
              draftKey={replyKey}
              threadPending={!!thread.pending}
              suggestionCode={thread.side === 'new' ? currentCode ?? thread.anchorContent ?? undefined : undefined}
              replyAgent={review.enabled ? lastAgentName : null}
            />
          </div>
        ) : (
          <div className="pl-10 pr-3 pb-3">
            <button
              data-reply-trigger
              onClick={() => setShowReply(true)}
              className="flex items-center w-full h-8 px-2.5 rounded-md border border-control-border bg-raised text-left text-[13px] text-text-muted hover:border-focus hover:text-text-secondary transition-colors cursor-text"
            >
              {lastAgentName && review.enabled ? `Reply to ${lastAgentName}…` : 'Reply…'}
            </button>
          </div>
        )
      )}
    </div>
  );
}
