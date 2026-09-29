import { useState } from 'react';
import { ChevronIcon } from '../icons/chevron-icon';
import { GENERAL_THREAD_FILE_PATH, isThreadResolved, DEFAULT_AUTHOR } from './types';
import type { CommentThread as CommentThreadType } from './types';
import type { CommentActions } from '../../hooks/use-comment-actions';
import { CommentForm } from './comment-form';
import { CommentIcon } from '../icons/comment-icon';
import { ThreadBadge } from '../ui/thread-badge';
import { ThreadCard } from './thread-card';

interface GeneralCommentsProps {
  threads: CommentThreadType[];
  commentActions: CommentActions;
}

export function GeneralComments(props: GeneralCommentsProps) {
  const { threads: allThreads, commentActions } = props;

  const threads = allThreads.filter(t => t.filePath === GENERAL_THREAD_FILE_PATH);
  const [isExpanded, setIsExpanded] = useState(threads.length > 0);
  const [showForm, setShowForm] = useState(false);

  return (
    <div className={`rounded-md mx-3 mt-2 overflow-hidden border ${threads.length > 0 ? 'border-accent/30 bg-accent/5' : 'border-border border-dashed'}`}>
      <div className="flex items-center gap-1.5 h-8 pl-1.5 pr-3 text-xs select-none">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-hover cursor-pointer"
        >
          <ChevronIcon expanded={isExpanded} />
        </button>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 cursor-pointer"
        >
          <CommentIcon className="w-3.5 h-3.5 text-text-muted" />
          <span className="text-text-secondary">General comments</span>
          {threads.length > 0 && (
            <span className="text-[11px] leading-4 font-medium bg-accent/15 text-accent px-1.5 rounded-full">{threads.length}</span>
          )}
        </button>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(true);
            setShowForm(true);
          }}
          className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
        >
          Add comment
        </button>
      </div>
      {isExpanded && (
        <div className="bg-bg border-t border-border">
          {showForm && (
            <div className="p-3">
              <CommentForm
                onSubmit={(body) => {
                  commentActions.addThread(GENERAL_THREAD_FILE_PATH, 'new', 0, 0, body, DEFAULT_AUTHOR);
                  setShowForm(false);
                }}
                onCancel={() => setShowForm(false)}
                placeholder="Leave a general comment..."
                submitLabel="Comment"
              />
            </div>
          )}
          {threads.length > 0 ? (
            <div className="p-3 space-y-3">
              {threads.map((thread, index) => (
                <ThreadCard
                  key={thread.id}
                  thread={thread}
                  onReply={(body, options) => commentActions.addReply(thread.id, body, DEFAULT_AUTHOR, options)}
                  onResolve={() => commentActions.resolveThread(thread.id)}
                  onUnresolve={() => commentActions.unresolveThread(thread.id)}
                  onEditComment={(commentId, body) => commentActions.editComment(commentId, body)}
                  onDeleteComment={(commentId) => commentActions.deleteComment(thread.id, commentId)}
                  onDeleteThread={() => commentActions.deleteThread(thread.id)}
                  className="bg-bg-secondary"
                  headerLeft={
                    <>
                      <span className="text-[11px] text-text-muted font-mono">Thread #{index + 1}</span>
                      {isThreadResolved(thread) && <ThreadBadge variant="resolved" />}
                    </>
                  }
                />
              ))}
            </div>
          ) : !showForm && (
            <div className="px-3 py-4 text-center text-xs text-text-muted">
              No general comments yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}
