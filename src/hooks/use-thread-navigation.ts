import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CommentThread } from '../components/comments/types';
import { getUnresolvedFileThreads } from '../lib/comment-navigation';
import { setCurrentThread, stepIndex, trackCurrentThread, useCurrentThread } from '../lib/current-thread';

/** Steps through the open threads from the current one (shared with the review keys), wrapping at either end. */
export function useThreadNavigation(threads: CommentThread[], onScrollToThread: (threadId: string, filePath: string) => void) {
  const currentId = useCurrentThread((state) => state.id);
  const [last, setLast] = useState(-1);

  const unresolvedThreads = useMemo(() => getUnresolvedFileThreads(threads), [threads]);
  const count = unresolvedThreads.length;
  const currentIndex = currentId ? unresolvedThreads.findIndex((thread) => thread.id === currentId) : -1;

  useEffect(() => trackCurrentThread(), []);

  useEffect(() => {
    if (currentIndex >= 0) {
      setLast(currentIndex);
    }
  }, [currentIndex]);

  const step = useCallback((direction: 1 | -1) => {
    const index = stepIndex(count, currentIndex, last, direction);
    const thread = unresolvedThreads[index];
    if (!thread) {
      return;
    }
    setLast(index);
    setCurrentThread(thread.id);
    onScrollToThread(thread.id, thread.filePath);
  }, [count, currentIndex, last, unresolvedThreads, onScrollToThread]);

  const goToPrevious = useCallback(() => step(-1), [step]);
  const goToNext = useCallback(() => step(1), [step]);

  return {
    currentIndex,
    count,
    goToPrevious,
    goToNext,
  };
}
