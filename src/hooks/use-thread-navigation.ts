import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CommentThread } from '../components/comments/types';
import { GENERAL_THREAD_FILE_PATH } from '../components/comments/types';
import type { DiffFile } from '../lib/diff-parser/types';
import { openThreadsInOrder } from '../lib/comment-navigation';
import { setCurrentThread, stepIndex, trackCurrentThread, useCurrentThread } from '../lib/current-thread';
import { setFocusThread } from '../lib/ui-store';
import { openCommentsAt } from '../features/comments/comments-panel';

function isOnScreen(threadId: string): boolean {
  return !!document.querySelector(`[data-thread-id="${CSS.escape(threadId)}"]`);
}

/**
 * Steps through every open thread of the view from the current one (shared with the review keys), wrapping at either
 * end. General comments are opened in place; threads the view can't show (outdated, or on files no longer changed)
 * are opened in the Comments panel. `files` is the view's diff; without it every thread is taken to be on screen.
 */
export function useThreadNavigation(threads: CommentThread[], onScrollToThread: (threadId: string, filePath: string) => void, files?: DiffFile[]) {
  const currentId = useCurrentThread((state) => state.id);
  const [last, setLast] = useState(-1);

  const ordered = useMemo(() => openThreadsInOrder(threads, files), [threads, files]);
  const count = ordered.length;
  const currentIndex = currentId ? ordered.findIndex((entry) => entry.thread.id === currentId) : -1;

  useEffect(() => trackCurrentThread(), []);

  useEffect(() => {
    if (currentIndex >= 0) {
      setLast(currentIndex);
    }
  }, [currentIndex]);

  const step = useCallback((direction: 1 | -1) => {
    const index = stepIndex(count, currentIndex, last, direction);
    const entry = ordered[index];
    if (!entry) {
      return;
    }
    const { thread, placed } = entry;
    setLast(index);
    setCurrentThread(thread.id);
    if (!placed && !isOnScreen(thread.id)) {
      openCommentsAt(thread.id);
      return;
    }
    if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
      setFocusThread(thread.id);
    }
    onScrollToThread(thread.id, thread.filePath);
  }, [count, currentIndex, last, ordered, onScrollToThread]);

  const goToPrevious = useCallback(() => step(-1), [step]);
  const goToNext = useCallback(() => step(1), [step]);

  return {
    currentIndex,
    count,
    goToPrevious,
    goToNext,
  };
}
