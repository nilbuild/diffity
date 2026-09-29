import { useEffect, useState } from 'react';
import type { CommentThread as CommentThreadType } from './types';
import { isThreadResolved } from './types';
import { CommentIcon } from '../icons/comment-icon';
import { ChevronIcon } from '../icons/chevron-icon';
import { ThreadBadge } from '../ui/thread-badge';
import { ThreadCard } from './thread-card';

interface OrphanedThreadsProps {
  threads: CommentThreadType[];
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onDeleteThread: (threadId: string) => void;
}

export function OrphanedThreads(props: OrphanedThreadsProps) {
  const { threads, onEditComment, onDeleteComment, onDeleteThread } = props;
  const [isExpanded, setIsExpanded] = useState(() => threads.some(thread => !isThreadResolved(thread)));

  useEffect(() => {
    if (threads.some(thread => !isThreadResolved(thread))) {
      setIsExpanded(true);
    }
  }, [threads]);

  if (threads.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-border bg-bg-secondary/50">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      >
        <ChevronIcon expanded={isExpanded} />
        <CommentIcon className="w-3.5 h-3.5" />
        <span>
          {threads.length} outdated comment{threads.length !== 1 ? 's' : ''}
        </span>
        <ThreadBadge variant="outdated" />
      </button>
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {threads.map((thread) => {
            const lineLabel = thread.startLine === thread.endLine
              ? `Line ${thread.startLine}`
              : `Lines ${thread.startLine}–${thread.endLine}`;

            return (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onEditComment={(commentId, body) => onEditComment(commentId, body)}
                onDeleteComment={(commentId) => onDeleteComment(thread.id, commentId)}
                onDeleteThread={() => onDeleteThread(thread.id)}
                className="border border-border max-w-[700px]"
                headerLeft={
                  <>
                    <span className="text-[11px] text-text-muted font-mono">{lineLabel}</span>
                    <ThreadBadge variant="outdated" />
                    {(thread.status === 'resolved' || thread.status === 'dismissed') && (
                      <ThreadBadge variant={thread.status} />
                    )}
                  </>
                }
              >
                {thread.anchorContent && (
                  <pre className="px-3 py-2 text-xs font-mono text-text-muted bg-bg-tertiary/50 border-b border-border overflow-x-auto whitespace-pre max-h-24 overflow-y-auto">{thread.anchorContent}</pre>
                )}
              </ThreadCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
