import type { CommentThread, SubmitOptions } from './types';
import { DEFAULT_AUTHOR, isThreadResolved } from './types';
import type { CommentActions } from '../../hooks/use-comment-actions';
import { CommentForm } from './comment-form';
import { ThreadCard } from './thread-card';
import { ThreadBadge } from '../ui/thread-badge';

interface FileCommentsProps {
  filePath: string;
  /** Threads on the whole file (`startLine` 0). */
  threads: CommentThread[];
  commentActions: CommentActions;
  showForm: boolean;
  onAdd: (body: string, options: SubmitOptions) => void;
  onCloseForm: () => void;
}

export function fileDraftKey(filePath: string) {
  return `file:${filePath}`;
}

/** Comments about a whole file, shown above its diff. */
export function FileComments(props: FileCommentsProps) {
  const { filePath, threads, commentActions, showForm, onAdd, onCloseForm } = props;

  if (threads.length === 0 && !showForm) {
    return null;
  }

  return (
    <div className="p-3 space-y-3 border-b border-border bg-bg-secondary/50">
      {threads.map((thread) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          onReply={(body, options) => commentActions.addReply(thread.id, body, DEFAULT_AUTHOR, options)}
          onResolve={() => commentActions.resolveThread(thread.id)}
          onUnresolve={() => commentActions.unresolveThread(thread.id)}
          onEditComment={(commentId, body) => commentActions.editComment(commentId, body)}
          onDeleteComment={(commentId) => commentActions.deleteComment(thread.id, commentId)}
          onDeleteThread={() => commentActions.deleteThread(thread.id)}
          className="bg-bg max-w-[760px]"
          location="Whole file"
          headerLeft={isThreadResolved(thread) && <ThreadBadge variant="resolved" />}
        />
      ))}
      {showForm && (
        <div className="max-w-[760px]">
          <CommentForm
            onSubmit={(body, options) => {
              onAdd(body, options);
              onCloseForm();
            }}
            onCancel={onCloseForm}
            placeholder={`Comment on ${filePath.split('/').pop()}…`}
            submitLabel="Comment"
            draftKey={fileDraftKey(filePath)}
          />
        </div>
      )}
    </div>
  );
}
