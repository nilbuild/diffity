import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CommentAuthor, CommentSide, CommentThread, SubmitOptions } from '../components/comments/types';
import * as api from '../lib/api';
import { enqueueClaude } from '../features/claude/claude-runner';

function reportError(error: unknown) {
  toast.error(api.errorMessage(error));
}

function mentionFollowUp(thread: CommentThread) {
  const newest = thread.comments[thread.comments.length - 1];
  if (!newest?.mentionsAgent || newest.pending) {
    return;
  }
  enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath: api.getRepoPath(), sessionId: thread.sessionId ?? null });
}

export function useCommentActions(sessionId: string | null, enabled: boolean) {
  const queryClient = useQueryClient();

  const invalidateThreads = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['threads', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['reviews', sessionId] });
  }, [queryClient, sessionId]);

  const addThread = useCallback((filePath: string, side: CommentSide, startLine: number, endLine: number, body: string, author: CommentAuthor, anchorContent?: string, options?: SubmitOptions) => {
    if (!enabled || !sessionId) {
      return;
    }
    api.createThread({ sessionId, filePath, side, startLine, endLine, body, author, anchorContent, options }).then((thread) => {
      invalidateThreads();
      mentionFollowUp(thread);
    }, reportError);
  }, [enabled, sessionId, invalidateThreads]);

  const addReply = useCallback((threadId: string, body: string, author: CommentAuthor, options?: SubmitOptions) => {
    if (!enabled) {
      return;
    }
    api.replyToThread(threadId, body, author, options).then((thread) => {
      invalidateThreads();
      mentionFollowUp(thread);
    }, reportError);
  }, [enabled, invalidateThreads]);

  const resolveThread = useCallback((threadId: string) => {
    if (!enabled) {
      return;
    }
    api.updateThreadStatus(threadId, 'resolved').then(invalidateThreads, reportError);
  }, [enabled, invalidateThreads]);

  const unresolveThread = useCallback((threadId: string) => {
    if (!enabled) {
      return;
    }
    api.updateThreadStatus(threadId, 'open').then(invalidateThreads, reportError);
  }, [enabled, invalidateThreads]);

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
    api.editComment(commentId, body).then(invalidateThreads, reportError);
  }, [enabled, invalidateThreads]);

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
    api.deleteThread(threadId).then(invalidateThreads, reportError);
  }, [enabled, invalidateThreads]);

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
