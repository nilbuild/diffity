import { useState, useCallback, useMemo } from 'react';
import type { CommentThread } from '../components/comments/types';
import { getUnresolvedFileThreads } from '../lib/comment-navigation';

export function useThreadNavigation(threads: CommentThread[], onScrollToThread: (threadId: string, filePath: string) => void) {
  const [currentIndex, setCurrentIndex] = useState(-1);

  const unresolvedThreads = useMemo(() => getUnresolvedFileThreads(threads), [threads]);
  const count = unresolvedThreads.length;

  const scrollToThread = useCallback((index: number) => {
    const thread = unresolvedThreads[index];
    if (!thread) {
      return;
    }
    onScrollToThread(thread.id, thread.filePath);
  }, [unresolvedThreads, onScrollToThread]);

  const goToPrevious = useCallback(() => {
    if (count === 0) {
      return;
    }
    const nextIndex = currentIndex <= 0 ? count - 1 : currentIndex - 1;
    setCurrentIndex(nextIndex);
    scrollToThread(nextIndex);
  }, [currentIndex, count, scrollToThread]);

  const goToNext = useCallback(() => {
    if (count === 0) {
      return;
    }
    const nextIndex = currentIndex >= count - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(nextIndex);
    scrollToThread(nextIndex);
  }, [currentIndex, count, scrollToThread]);

  return {
    currentIndex,
    count,
    goToPrevious,
    goToNext,
  };
}
