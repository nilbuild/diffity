import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import type { NewThread, Severity, Thread, ThreadStatus } from '@/lib/types';
import { agentBus } from '@/features/workspace/agent-bus';
import { invalidateReviews } from './use-review';

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
        invalidateReviews(payload.sessionId);
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

function askAgentIfMentioned(thread: Thread) {
  const latest = thread.comments[thread.comments.length - 1];
  if (!latest || latest.pending || !latest.mentionsAgent) {
    return;
  }
  agentBus.runAction({ kind: 'thread', threadId: thread.id });
}

export function useCommentActions(sessionId: string | null) {
  const invalidate = () => {
    if (!sessionId) {
      return;
    }
    invalidateReviews(sessionId);
    return queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId) });
  };

  const create = useMutation({
    mutationFn: (input: Omit<NewThread, 'sessionId'>) => {
      if (!sessionId) {
        throw new Error('No review session yet');
      }
      return api.createThread({ ...input, sessionId });
    },
    onSuccess: (thread) => {
      askAgentIfMentioned(thread);
      return invalidate();
    },
    onError,
  });
  const reply = useMutation({
    mutationFn: (input: { threadId: string; body: string; pending?: boolean }) =>
      api.addReply(input.threadId, input.body, null, null, input.pending ?? false),
    onSuccess: (thread) => {
      askAgentIfMentioned(thread);
      return invalidate();
    },
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

  return { sessionId, create, reply, edit, removeComment, removeThread, setStatus, removeAll };
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
