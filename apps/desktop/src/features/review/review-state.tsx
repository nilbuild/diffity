import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import { queryClient } from '../../lib/query-client';
import type { GithubPendingAction, PushResult, Review, ReviewVerdict } from '../../lib/types';
import { VERDICT_EVENT } from './review-candidates';
import { enqueueClaude } from '../claude/claude-runner';

interface ReviewStateValue {
  enabled: boolean;
  sessionId: string | null;
  pendingReview: Review | null;
  /** A GitHub pull request is checked out: comments can be drafted and posted as one review. */
  prMode: boolean;
  /** Viewing your own PR: comments are local notes for Claude; this is the PR number for optional posting. */
  ownPrNumber: number | null;
}

const ReviewStateContext = createContext<ReviewStateValue>({ enabled: false, sessionId: null, pendingReview: null, prMode: false, ownPrNumber: null });

export function ReviewStateProvider(props: { sessionId: string | null; prMode?: boolean; ownPrNumber?: number | null; children: ReactNode }) {
  const { sessionId, prMode = false, ownPrNumber = null, children } = props;
  const pendingReview = usePendingReview(sessionId);

  return (
    <ReviewStateContext.Provider value={{ enabled: sessionId !== null, sessionId, pendingReview, prMode, ownPrNumber }}>
      {children}
    </ReviewStateContext.Provider>
  );
}

export function useReviewState() {
  return useContext(ReviewStateContext);
}

export function usePendingReview(sessionId: string | null): Review | null {
  const query = useQuery({
    queryKey: ['reviews', sessionId, 'pending'],
    queryFn: () => tauri.getPendingReview(sessionId ?? ''),
    enabled: sessionId !== null,
  });
  return query.data ?? null;
}

/** `none` still answers @claude mentions; `skip` sends nothing (the caller starts its own run). */
export type ClaudeScope = 'all' | 'mentions' | 'none' | 'skip';

export interface SubmitReviewInput {
  body: string;
  verdict: ReviewVerdict | null;
  claude: ClaudeScope;
}

function successTitle(review: Review, claude: boolean): string {
  if (claude) {
    return 'Sent to Claude';
  }
  const count = review.commentCount;
  return count > 0 ? `Published ${count} ${count === 1 ? 'comment' : 'comments'}` : 'Note published';
}

export function triggerClaude(review: Review, scope: ClaudeScope): string | null {
  const context = { repoPath: getRepoPath(), sessionId: review.sessionId };
  if (scope === 'skip') {
    return null;
  }
  if (scope === 'all') {
    enqueueClaude({ kind: 'reviewFeedback', reviewId: review.id }, context);
    return 'Claude is working through it (see the status in the toolbar)';
  }
  for (const threadId of review.mentionedThreadIds) {
    enqueueClaude({ kind: 'thread', threadId }, context);
  }
  if (review.mentionedThreadIds.length === 0) {
    return null;
  }
  const count = review.mentionedThreadIds.length;
  return `Claude will answer ${count === 1 ? '1 mention' : `${count} mentions`}`;
}

export interface PostReviewInput {
  prNumber: number;
  body: string;
  verdict: ReviewVerdict;
  threadIds: string[];
  /** Other views whose pending reviews hold selected drafts; submitted locally first. */
  otherDraftSessions: string[];
  /** Submit this view's pending review locally first (drafts, summary or verdict to keep). */
  needsLocalReview: boolean;
  /** The local review from an earlier attempt whose GitHub post failed. */
  review: Review | null;
  pendingAction: GithubPendingAction | null;
}

export interface PostReviewResult {
  review: Review | null;
  result: PushResult;
}

export class PostReviewError extends Error {
  code: string;
  /** Local review already submitted before the GitHub post failed (reuse it on retry). */
  review: Review | null;

  constructor(code: string, message: string, review: Review | null) {
    super(message);
    this.code = code;
    this.review = review;
  }

  static from(error: unknown, review: Review | null) {
    const code = tauri.isAppError(error) ? error.code : 'error';
    return new PostReviewError(code, tauri.errorMessage(error), review);
  }
}

export function useReviewActions(sessionId: string | null) {
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['reviews', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
  };

  const submit = useMutation({
    mutationFn: async (input: SubmitReviewInput) => {
      if (!sessionId) {
        throw new Error('No review session yet');
      }
      const review = await tauri.submitReview(sessionId, input.body.trim() || null, input.verdict);
      return { review, claude: input.claude };
    },
    onSuccess: (result) => {
      refresh();
      const claude = triggerClaude(result.review, result.claude);
      const count = result.review.commentCount;
      const parts = [count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : null, claude].filter(Boolean);
      toast.success(successTitle(result.review, claude !== null), { description: parts.join(' · ') || undefined });
    },
    onError: (error) => toast.error(tauri.errorMessage(error)),
  });

  /** Posts a GitHub review of the checked-out PR from the selected comments (drafts and local threads). */
  const post = useMutation<PostReviewResult, PostReviewError, PostReviewInput>({
    mutationFn: async (input) => {
      if (!sessionId) {
        throw new PostReviewError('invalid', 'No review session yet', null);
      }
      let review = input.review;
      try {
        for (const other of input.otherDraftSessions) {
          await tauri.submitReview(other, null, null);
        }
        if (!review && input.needsLocalReview) {
          review = await tauri.submitReview(sessionId, input.body.trim() || null, input.verdict);
        }
      } catch (error) {
        throw PostReviewError.from(error, review);
      }
      try {
        const result = await tauri.pushReview(
          getRepoPath(),
          sessionId,
          input.prNumber,
          VERDICT_EVENT[input.verdict],
          input.body.trim() || null,
          input.threadIds,
          review?.id ?? null,
          input.pendingAction,
        );
        return { review, result };
      } catch (error) {
        throw PostReviewError.from(error, review);
      }
    },
    onSettled: () => {
      refresh();
      queryClient.invalidateQueries({ queryKey: ['review-candidates'] });
    },
  });

  const discard = useMutation({
    mutationFn: () => tauri.discardReview(sessionId ?? ''),
    onSuccess: () => {
      refresh();
      toast.success('Draft comments discarded');
    },
    onError: (error) => toast.error(tauri.errorMessage(error)),
  });

  return { submit, post, discard };
}
