import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import type { PullRequest, Review, ReviewVerdict } from '@/lib/types';
import { agentBus } from '@/features/workspace/agent-bus';

export const reviewKeys = {
  all: (sessionId: string) => ['reviews', sessionId] as const,
  pending: (sessionId: string) => ['reviews', sessionId, 'pending'] as const,
  list: (sessionId: string) => ['reviews', sessionId, 'list'] as const,
};

const EMPTY: Review[] = [];

export function invalidateReviews(sessionId: string | null) {
  if (!sessionId) {
    return;
  }
  void queryClient.invalidateQueries({ queryKey: reviewKeys.all(sessionId) });
}

export function usePendingReview(sessionId: string | null): Review | null {
  const query = useQuery({
    queryKey: reviewKeys.pending(sessionId ?? ''),
    queryFn: () => api.getPendingReview(sessionId ?? ''),
    enabled: sessionId !== null,
  });
  return query.data ?? null;
}

export function useSubmittedReviews(sessionId: string | null): Review[] {
  const query = useQuery({
    queryKey: reviewKeys.list(sessionId ?? ''),
    queryFn: () => api.listReviews(sessionId ?? ''),
    enabled: sessionId !== null,
    select: (reviews) => reviews.filter((r) => r.state === 'submitted'),
  });
  return query.data ?? EMPTY;
}

export function useBranchPr(repoPath: string, enabled: boolean): PullRequest | null {
  const query = useQuery({
    queryKey: queryKeys.pr(repoPath),
    queryFn: () => api.findPr(repoPath),
    enabled,
    staleTime: 60_000,
  });
  return query.data ?? null;
}

export interface SubmitReviewInput {
  body: string;
  verdict: ReviewVerdict;
  sendToClaude: boolean;
  pr: PullRequest | null;
}

const VERDICT_LABEL: Record<ReviewVerdict, string> = {
  comment: 'Review submitted',
  approve: 'Approved',
  requestChanges: 'Changes requested',
};

function triggerAgent(review: Review, sendToClaude: boolean): string | null {
  if (sendToClaude || review.bodyMentionsAgent) {
    agentBus.runAction({ kind: 'reviewFeedback', reviewId: review.id });
    return 'sent to Claude';
  }
  for (const threadId of review.mentionedThreadIds) {
    agentBus.runAction({ kind: 'thread', threadId });
  }
  if (review.mentionedThreadIds.length === 0) {
    return null;
  }
  return `Claude will answer ${review.mentionedThreadIds.length === 1 ? '1 mention' : `${review.mentionedThreadIds.length} mentions`}`;
}

export function useReviewActions(repoPath: string, sessionId: string | null) {
  const refresh = () => {
    if (!sessionId) {
      return;
    }
    invalidateReviews(sessionId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId) });
  };

  const submit = useMutation({
    mutationFn: async (input: SubmitReviewInput) => {
      if (!sessionId) {
        throw new Error('No review session yet');
      }
      const review = await api.submitReview(sessionId, input.body.trim() || null, input.verdict);
      let pushed: string | null = null;
      if (input.pr) {
        try {
          const result = await api.pushSubmittedReview(repoPath, sessionId, input.pr.number, review.id);
          pushed = result.failed > 0 ? `posted to #${input.pr.number} with ${result.failed} failed` : `posted to #${input.pr.number}`;
        } catch (error) {
          toast.error(`Could not post to GitHub: ${api.errorMessage(error)}`);
        }
      }
      return { review, pushed, sendToClaude: input.sendToClaude };
    },
    onSuccess: (result) => {
      refresh();
      const agent = triggerAgent(result.review, result.sendToClaude);
      const count = result.review.commentCount;
      const parts = [count > 0 ? `${count} ${count === 1 ? 'comment' : 'comments'}` : null, result.pushed, agent].filter(Boolean);
      toast.success(VERDICT_LABEL[result.review.verdict ?? 'comment'], { description: parts.join(' · ') || undefined });
    },
    onError: (error) => toast.error(api.errorMessage(error)),
  });

  const discard = useMutation({
    mutationFn: () => api.discardReview(sessionId ?? ''),
    onSuccess: () => {
      refresh();
      toast.success('Review discarded');
    },
    onError: (error) => toast.error(api.errorMessage(error)),
  });

  return { submit, discard };
}
