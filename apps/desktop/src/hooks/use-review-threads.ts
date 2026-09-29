import { useQuery } from '@tanstack/react-query';
import { fetchThreads } from '../lib/api';
import type { CommentThread } from '../components/comments/types';

export function useReviewThreads(sessionId: string | null | undefined) {
  return useQuery<CommentThread[]>({
    queryKey: ['threads', sessionId],
    queryFn: () => fetchThreads(sessionId!),
    enabled: !!sessionId,
  });
}
