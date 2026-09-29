import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { getRepoPath } from '../../lib/api';
import { queryClient } from '../../lib/query-client';
import type { Review, ReviewVerdict } from '../../lib/types';
import { enqueueClaude } from '../claude/claude-runner';

interface ReviewStateValue {
  enabled: boolean;
  sessionId: string | null;
  pendingReview: Review | null;
  /** A GitHub pull request is checked out: comments can be drafted and posted as one review. */
  prMode: boolean;
}

const ReviewStateContext = createContext<ReviewStateValue>({ enabled: false, sessionId: null, pendingReview: null, prMode: false });

export function ReviewStateProvider(props: { sessionId: string | null; prMode?: boolean; children: ReactNode }) {
  const { sessionId, prMode = false, children } = props;
  const pendingReview = usePendingReview(sessionId);

  return (
    <ReviewStateContext.Provider value={{ enabled: sessionId !== null, sessionId, pendingReview, prMode }}>
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

export interface SubmitReviewInput {
  body: string;
  verdict: ReviewVerdict | null;
  sendToClaude: boolean;
  prNumber: number | null;
}

const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  comment: 'Review posted',
  approve: 'Approved',
  requestChanges: 'Changes requested',
};

function successTitle(review: Review, pushed: boolean, claude: boolean): string {
  if (pushed && review.verdict) {
    return VERDICT_LABEL[review.verdict];
  }
  if (claude) {
    return 'Sent to Claude';
  }
  const count = review.commentCount;
  return count > 0 ? `Published ${count} ${count === 1 ? 'comment' : 'comments'}` : 'Note published';
}

function triggerClaude(review: Review, sendToClaude: boolean): string | null {
  const context = { repoPath: getRepoPath(), sessionId: review.sessionId };
  if (sendToClaude || review.bodyMentionsAgent) {
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
      let pushed: string | null = null;
      if (input.prNumber !== null) {
        try {
          const result = await tauri.pushSubmittedReview(getRepoPath(), sessionId, input.prNumber, review.id);
          pushed = result.failed > 0 ? `posted to PR #${input.prNumber}, ${result.failed} failed` : `posted to PR #${input.prNumber}`;
        } catch (error) {
          toast.error(`Comments were saved, but posting to PR #${input.prNumber} failed`, {
            description: `${tauri.errorMessage(error)} — use the GitHub button to push them again.`,
          });
        }
      }
      return { review, pushed, sendToClaude: input.sendToClaude };
    },
    onSuccess: (result) => {
      refresh();
      const claude = triggerClaude(result.review, result.sendToClaude);
      const count = result.review.commentCount;
      const parts = [count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : null, result.pushed, claude].filter(Boolean);
      toast.success(successTitle(result.review, result.pushed !== null, claude !== null), { description: parts.join(' · ') || undefined });
    },
    onError: (error) => toast.error(tauri.errorMessage(error)),
  });

  const discard = useMutation({
    mutationFn: () => tauri.discardReview(sessionId ?? ''),
    onSuccess: () => {
      refresh();
      toast.success('Draft comments discarded');
    },
    onError: (error) => toast.error(tauri.errorMessage(error)),
  });

  return { submit, discard };
}
