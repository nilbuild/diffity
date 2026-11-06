import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CommentAuthor, CommentSide, CommentThread, SubmitOptions } from '../components/comments/types';
import * as api from '../lib/api';
import { isAppError } from '../lib/tauri';
import { queryClient } from '../lib/query-client';
import type { ThreadSnapshot } from '../lib/types';
import { enqueueClaude } from '../features/claude/claude-runner';
import { mentionsAgent } from '../lib/mentions';

function reportError(error: unknown) {
  toast.error(api.errorMessage(error));
}

function refreshThreads() {
  queryClient.invalidateQueries({ queryKey: ['threads'] });
  queryClient.invalidateQueries({ queryKey: ['repo-threads'] });
  queryClient.invalidateQueries({ queryKey: ['reviews'] });
}

const UNDO_DURATION = 8000;

/**
 * Resolves or reopens a thread (on GitHub too when it is synced there). Resolving offers Undo. When GitHub refuses,
 * nothing changes and the toast says so.
 */
export function changeThreadStatus(threadId: string, status: 'open' | 'resolved', undoable = true): Promise<boolean> {
  return api.updateThreadStatus(threadId, status).then(
    () => {
      refreshThreads();
      if (status === 'resolved' && undoable) {
        toast('Comment resolved', {
          id: `resolved-${threadId}`,
          duration: UNDO_DURATION,
          action: { label: 'Undo', onClick: () => void changeThreadStatus(threadId, 'open', false) },
        });
      }
      return true;
    },
    (error) => {
      refreshThreads();
      if (isAppError(error) && error.code === 'github_sync') {
        toast.error(status === 'resolved' ? 'Could not resolve it on GitHub' : 'Could not reopen it on GitHub', {
          description: `${error.message} The comment is unchanged.`,
          action: { label: 'Retry', onClick: () => void changeThreadStatus(threadId, status, undoable) },
        });
        return false;
      }
      reportError(error);
      return false;
    },
  );
}

/** Puts deleted threads back (Undo). */
export function restoreThreads(snapshots: ThreadSnapshot[]): Promise<void> {
  return Promise.allSettled(snapshots.map((snapshot) => api.restoreThread(snapshot))).then((results) => {
    refreshThreads();
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      toast.error('Could not restore every comment', { description: api.errorMessage(failed.reason) });
    }
  });
}

/** "Deleted" toast with Undo for threads that were just deleted. */
export function deletedToast(snapshots: ThreadSnapshot[]) {
  if (snapshots.length === 0) {
    return;
  }
  const onGitHub = snapshots.some((snapshot) => snapshot.thread.githubThreadId);
  const title = snapshots.length === 1 ? 'Comment deleted' : `Deleted ${snapshots.length} comments`;
  toast(title, {
    id: snapshots.length === 1 ? `deleted-${snapshots[0].thread.id}` : undefined,
    description: onGitHub ? 'Removed from Diffity only. It stays on GitHub and won’t sync back.' : undefined,
    duration: UNDO_DURATION,
    action: { label: 'Undo', onClick: () => void restoreThreads(snapshots) },
  });
}

/** Deletes a thread with an Undo toast. */
export function deleteThreadWithUndo(threadId: string): Promise<void> {
  return api.deleteThread(threadId).then(
    (snapshot) => {
      refreshThreads();
      deletedToast([snapshot]);
    },
    reportError,
  );
}

function mentionFollowUp(thread: CommentThread, askClaude = false) {
  const newest = thread.comments[thread.comments.length - 1];
  if (!newest || newest.pending || !(newest.mentionsAgent || askClaude)) {
    return;
  }
  enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath: api.getRepoPath(), sessionId: thread.sessionId ?? null });
}

export function useCommentActions(sessionId: string | null, enabled: boolean, viewRef?: string) {
  const queryClient = useQueryClient();

  const invalidateThreads = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['reviews', sessionId] });
  }, [queryClient, sessionId]);

  const addThread = useCallback((filePath: string, side: CommentSide, startLine: number, endLine: number, body: string, author: CommentAuthor, anchorContent?: string, options?: SubmitOptions) => {
    if (!enabled || !sessionId) {
      return;
    }
    api.createThread({ sessionId, filePath, side, startLine, endLine, body, author, anchorContent, options, viewRef }).then((thread) => {
      invalidateThreads();
      mentionFollowUp(thread);
      const prNumber = options?.postToGitHub;
      if (!prNumber) {
        return;
      }
      const id = toast.loading(`Posting to GitHub PR #${prNumber}…`);
      api.pushCommentsToGitHub(sessionId, prNumber, [thread.id]).then((result) => {
        invalidateThreads();
        if (result.failed > 0) {
          toast.error('Saved here, but GitHub did not accept it', { id, description: result.errors[0] });
          return;
        }
        toast.success(`Posted to GitHub PR #${prNumber}`, { id });
      }, (error) => {
        toast.error('Saved here, but could not post to GitHub', { id, description: api.errorMessage(error) });
      });
    }, reportError);
  }, [enabled, sessionId, invalidateThreads]);

  const addReply = useCallback((threadId: string, body: string, author: CommentAuthor, options?: SubmitOptions) => {
    if (!enabled) {
      return;
    }
    api.replyToThread(threadId, body, author, options).then((thread) => {
      invalidateThreads();
      mentionFollowUp(thread, options?.askClaude);
    }, reportError);
  }, [enabled, invalidateThreads]);

  const setLocalStatus = useCallback((threadId: string, status: CommentThread['status']) => {
    queryClient.setQueryData<CommentThread[]>(['threads', sessionId], (threads) => {
      if (!threads) {
        return threads;
      }
      return threads.map((thread) => (thread.id === threadId ? { ...thread, status } : thread));
    });
  }, [queryClient, sessionId]);

  const unresolveThread = useCallback((threadId: string) => {
    if (!enabled) {
      return;
    }
    setLocalStatus(threadId, 'open');
    void changeThreadStatus(threadId, 'open');
  }, [enabled, setLocalStatus]);

  const resolveThread = useCallback((threadId: string) => {
    if (!enabled) {
      return;
    }
    setLocalStatus(threadId, 'resolved');
    void changeThreadStatus(threadId, 'resolved');
  }, [enabled, setLocalStatus]);

  const dismissThread = useCallback((threadId: string) => {
    if (!enabled) {
      return;
    }
    api.updateThreadStatus(threadId, 'dismissed').then(invalidateThreads, reportError);
  }, [enabled, invalidateThreads]);

  const editComment = useCallback((commentId: string, body: string) => {
    if (!enabled) {
      return;
    }
    const thread = queryClient.getQueryData<CommentThread[]>(['threads', sessionId])?.find((item) => item.comments.some((comment) => comment.id === commentId));
    const comment = thread?.comments.find((item) => item.id === commentId);
    const newMention = !!comment && comment.author.type === 'user' && !comment.pending && !mentionsAgent(comment.body) && mentionsAgent(body);
    api.editComment(commentId, body).then(() => {
      invalidateThreads();
      if (thread && newMention) {
        enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath: api.getRepoPath(), sessionId: thread.sessionId ?? null });
      }
    }, reportError);
  }, [enabled, invalidateThreads, queryClient, sessionId]);

  const deleteComment = useCallback((_threadId: string, commentId: string) => {
    if (!enabled) {
      return;
    }
    api.deleteComment(commentId).then(invalidateThreads, reportError);
  }, [enabled, invalidateThreads]);

  const deleteThread = useCallback((threadId: string) => {
    if (!enabled) {
      return;
    }
    void deleteThreadWithUndo(threadId);
  }, [enabled]);

  const deleteAllThreads = useCallback(() => {
    if (!enabled || !sessionId) {
      return;
    }
    api.deleteAllThreads(sessionId).then(invalidateThreads, reportError);
  }, [enabled, sessionId, invalidateThreads]);

  return {
    addThread,
    addReply,
    resolveThread,
    unresolveThread,
    dismissThread,
    editComment,
    deleteComment,
    deleteThread,
    deleteAllThreads,
  };
}

export type CommentActions = ReturnType<typeof useCommentActions>;
