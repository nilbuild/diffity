import { useQuery, useSuspenseQueries } from '@tanstack/react-query';
import * as tauri from '../lib/tauri';
import { fetchThreads } from '../lib/api';
import type { CommentThread } from '../components/comments/types';

export function useReviewThreads(sessionId: string | null | undefined) {
  return useQuery<CommentThread[]>({
    queryKey: ['threads', sessionId],
    queryFn: () => fetchThreads(sessionId!),
    enabled: !!sessionId,
  });
}

/**
 * Waits (suspends) until a view's comments and Viewed marks are loaded, in parallel with each other. The router
 * switches views in a transition, so the old screen stays up until the new one is complete instead of a skeleton
 * flashing while these two arrive.
 */
export function useReviewDataReady(threadsSession: string | null, viewedSession: string | null) {
  useSuspenseQueries({
    queries: [
      { queryKey: ['threads', threadsSession], queryFn: () => (threadsSession ? fetchThreads(threadsSession) : Promise.resolve([])) },
      { queryKey: ['viewed', viewedSession], queryFn: () => (viewedSession ? tauri.listViewed(viewedSession) : Promise.resolve([])) },
    ],
  });
}
