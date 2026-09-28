import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import type { NewThread, Severity, Thread, ThreadStatus } from '@/lib/types';

const EMPTY: Thread[] = [];

export function useThreads(sessionId: string | null): Thread[] {
  const query = useQuery({
    queryKey: queryKeys.threads(sessionId ?? ''),
    queryFn: () => api.listThreads(sessionId ?? ''),
    enabled: sessionId !== null,
  });
  return query.data ?? EMPTY;
}

export function useThreadsChangedListener() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    api
      .onThreadsChanged((payload) => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.threads(payload.sessionId) });
        void queryClient.invalidateQueries({ queryKey: ['github', 'pushable'] });
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
}

function onError(error: unknown) {
  toast.error(api.errorMessage(error));
}

export function useCommentActions(sessionId: string | null) {
  const invalidate = () => {
    if (!sessionId) {
      return;
    }
    return queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId) });
  };

  const create = useMutation({
    mutationFn: (input: Omit<NewThread, 'sessionId'>) => {
      if (!sessionId) {
        throw new Error('No review session yet');
      }
      return api.createThread({ ...input, sessionId });
    },
    onSuccess: invalidate,
    onError,
  });
  const reply = useMutation({
    mutationFn: (input: { threadId: string; body: string }) => api.addReply(input.threadId, input.body),
    onSuccess: invalidate,
    onError,
  });
  const edit = useMutation({
    mutationFn: (input: { commentId: string; body: string }) => api.editComment(input.commentId, input.body),
    onSuccess: invalidate,
    onError,
  });
  const removeComment = useMutation({
    mutationFn: (commentId: string) => api.deleteComment(commentId),
    onSuccess: invalidate,
    onError,
  });
  const removeThread = useMutation({
    mutationFn: (threadId: string) => api.deleteThread(threadId),
    onSuccess: invalidate,
    onError,
  });
  const setStatus = useMutation({
    mutationFn: (input: { threadId: string; status: ThreadStatus }) => api.setThreadStatus(input.threadId, input.status),
    onSuccess: invalidate,
    onError,
  });
  const removeAll = useMutation({
    mutationFn: () => api.deleteAllThreads(sessionId ?? ''),
    onSuccess: invalidate,
    onError,
  });

  return { create, reply, edit, removeComment, removeThread, setStatus, removeAll };
}

export type CommentActions = ReturnType<typeof useCommentActions>;

export interface CreateThreadInput {
  filePath: string;
  side: 'old' | 'new';
  startLine: number;
  endLine: number;
  body: string;
  severity: Severity | null;
  anchorContent: string | null;
}
