import { useState, useEffect } from 'react';
import type { CommentThread as CommentThreadType } from './types';
import { isThreadResolved, DEFAULT_AUTHOR } from './types';
import type { CommentActions } from '../../hooks/use-comment-actions';
import { CommentForm } from './comment-form';
import { CommentIcon } from '../icons/comment-icon';
import { ThreadBadge } from '../ui/thread-badge';
import { ThreadCard } from './thread-card';

interface PathCommentsProps {
  pathKey: string;
  threads: CommentThreadType[];
  commentActions: CommentActions;
  label: string;
  children?: React.ReactNode;
  focusedThreadId?: string | null;
}

export function PathComments(props: PathCommentsProps) {
  const { pathKey, threads, commentActions, label, children, focusedThreadId } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!focusedThreadId) {
      return;
    }
    const hasThread = threads.some(t => t.id === focusedThreadId);
    if (hasThread) {
      setIsExpanded(true);
    }
  }, [focusedThreadId, threads]);

  const handleToggle = () => {
    if (isExpanded) {
      setIsExpanded(false);
      setShowForm(false);
    } else {
      setIsExpanded(true);
      if (threads.length === 0) {
        setShowForm(true);
      }
    }
  };

  const handleSubmit = (body: string) => {
    commentActions.addThread(`__path__:${pathKey}`, 'new', 0, 0, body, DEFAULT_AUTHOR);
    setShowForm(false);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1 min-h-8 text-[13px]">
        {children}
        <div className="flex-1" />
        <button
          onClick={handleToggle}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
          title={`Comment on ${label}`}
        >
          <CommentIcon className="w-3.5 h-3.5" />
          <span className="text-[13px]">
            {threads.length > 0
              ? `${threads.length} comment${threads.length !== 1 ? 's' : ''}`
              : 'Add comment'}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className={`mt-3 rounded-lg overflow-hidden ${threads.length > 0 ? 'bg-accent/5' : 'bg-bg-secondary'}`}>
          <div className="flex items-center gap-2 px-3 py-2 text-sm">
            <CommentIcon className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-text-secondary text-xs">Comments on {label}</span>
            {threads.length > 0 && (
              <span className="text-xs font-medium bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">{threads.length}</span>
            )}
            <div className="flex-1" />
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer"
              >
                Add comment
              </button>
            )}
          </div>
          <div className="bg-bg rounded-md mx-1.5 mb-1.5">
            {showForm && (
              <div className="p-3">
                <CommentForm
                  onSubmit={handleSubmit}
                  onCancel={() => {
                    setShowForm(false);
                    if (threads.length === 0) {
                      setIsExpanded(false);
                    }
                  }}
                  placeholder={`Comment on ${label}...`}
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
                No comments yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
