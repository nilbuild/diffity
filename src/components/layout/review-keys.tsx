import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { isThreadResolved, type CommentThread } from '../comments/types';
import { useThreadNavigation } from '../../hooks/use-thread-navigation';
import { useRepoPath } from '../../hooks/use-repo';
import { useCurrentThread } from '../../lib/current-thread';
import { focusThreadElement } from '../../lib/dom-utils';
import { requestOpenReview, reviewKeyAction } from '../../lib/review-keys';
import { useReviewState } from '../../features/review/review-state';
import { enqueueClaude, useClaude } from '../../features/claude/claude-runner';
import { requestSendToClaude } from '../../features/claude/send-comments';

interface ReviewKeysProps {
  threads: CommentThread[];
  onScrollToThread: (threadId: string, filePath: string) => void;
  onResolve: (threadId: string) => void;
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || element.isContentEditable);
}

function threadElement(threadId: string): Element | null {
  return document.querySelector(`[data-thread-id="${CSS.escape(threadId)}"]`);
}

/** Opens the reply box of a thread on screen (expanding it if collapsed), or focuses the one already open. */
function openReply(threadId: string) {
  focusThreadElement(threadId);
  let tries = 10;
  const attempt = () => {
    const element = threadElement(threadId);
    const field = element?.querySelector('textarea');
    if (field) {
      field.focus();
      return;
    }
    const trigger = element?.querySelector<HTMLElement>('[data-reply-trigger]');
    if (trigger) {
      trigger.click();
      return;
    }
    tries -= 1;
    if (tries > 0) {
      setTimeout(attempt, 50);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(attempt));
}

/** Review-loop keys on the current thread (see `lib/current-thread`): ⇧R reply, E resolve, A ask the agent, { } step, ⇧⌘↵ review. */
export function ReviewKeys(props: ReviewKeysProps) {
  const { threads, onScrollToThread, onResolve } = props;
  const repoPath = useRepoPath();
  const review = useReviewState();
  const { goToNext, goToPrevious } = useThreadNavigation(threads, onScrollToThread);
  const latest = useRef({ threads, onResolve, goToNext, goToPrevious, review, repoPath });
  latest.current = { threads, onResolve, goToNext, goToPrevious, review, repoPath };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isTyping(event.target) || document.querySelector('dialog[open]')) {
        return;
      }
      const action = reviewKeyAction(event);
      if (!action) {
        return;
      }
      const state = latest.current;
      if (!state.review.enabled) {
        return;
      }
      event.preventDefault();
      if (action === 'next') {
        state.goToNext();
        return;
      }
      if (action === 'previous') {
        state.goToPrevious();
        return;
      }
      if (action === 'review') {
        if (!requestOpenReview()) {
          requestSendToClaude();
        }
        return;
      }
      const currentId = useCurrentThread.getState().id;
      const thread = currentId ? state.threads.find((item) => item.id === currentId) : undefined;
      if (!thread) {
        toast.info('No comment selected', { description: 'Click one, or step to it with }.' });
        return;
      }
      const resolved = isThreadResolved(thread);
      if (action === 'reply') {
        openReply(thread.id);
        return;
      }
      if (action === 'resolve') {
        if (!resolved) {
          state.onResolve(thread.id);
        }
        return;
      }
      const busy = useClaude.getState().runs.some((run) => run.threadIds.includes(thread.id));
      if (resolved || thread.pending || busy) {
        toast.info(busy ? 'An agent is already on this comment' : resolved ? 'This comment is resolved' : 'Submit the draft first');
        return;
      }
      enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath: state.repoPath, sessionId: thread.sessionId ?? null });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return null;
}
