import { useState } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { ChevronRightIcon, PencilIcon, SparklesIcon, TrashIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { dayjs } from '@/lib/time';
import type { Comment, Thread } from '@/lib/types';
import { agentBus } from '@/features/workspace/agent-bus';
import { CommentForm } from './CommentForm';
import { AuthorBadge, SeverityBadge, StatusBadge } from './badges';
import { useCommentDraft } from './draft-store';
import { lineLabel } from './thread-utils';
import type { CommentActions } from './use-threads';

export interface ThreadCardProps {
  thread: Thread;
  actions: CommentActions;
  showLocation?: boolean;
  onLocate?: () => void;
}

export function ThreadCard(props: ThreadCardProps) {
  const { thread, actions, showLocation, onLocate } = props;
  const [replying, setReplying] = useState(false);
  const [expanded, setExpanded] = useState(thread.status === 'open');
  const active = useCommentDraft((s) => s.activeThreadId === thread.id);
  const open = thread.status === 'open';

  const deleteThread = async () => {
    const ok = await confirmDialog({
      title: 'Delete thread?',
      message: 'This removes the thread and all of its replies.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) {
      return;
    }
    actions.removeThread.mutate(thread.id);
  };

  return (
    <div
      data-thread-id={thread.id}
      className={cn(
        'overflow-hidden rounded-lg border bg-bg-elevated font-sans text-[13px] shadow-sm',
        active ? 'border-accent ring-2 ring-ring' : 'border-border',
        !open && 'opacity-80',
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5">
        <button
          type="button"
          className="flex min-w-0 cursor-default items-center gap-1.5 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRightIcon size={12} className={cn('shrink-0 text-fg-subtle transition-transform', expanded && 'rotate-90')} />
          {expanded ? (
            <span className="text-xs font-medium text-fg-muted">
              {lineLabel(thread)}
              {thread.comments.length > 1 && <span className="font-normal text-fg-subtle"> · {thread.comments.length} comments</span>}
            </span>
          ) : (
            <>
              <AuthorBadge authorType={thread.comments[0]?.authorType ?? 'user'} authorName={thread.comments[0]?.authorName ?? ''} />
              <span className="truncate text-xs text-fg-muted">{thread.comments[0]?.body}</span>
            </>
          )}
        </button>
        {thread.severity && <SeverityBadge severity={thread.severity} />}
        <StatusBadge status={thread.status} />
        {showLocation && (
          <button type="button" onClick={onLocate} className="cursor-default truncate text-xs text-accent hover:underline">
            {thread.filePath === '__general__' ? 'General' : `${thread.filePath} ${lineLabel(thread)}`}
          </button>
        )}
        <div className="ml-auto flex items-center gap-0.5">
          {open && (
            <IconButton size="sm" label="Resolve with AI" onClick={() => agentBus.runAction({ kind: 'resolve', threadId: thread.id })}>
              <SparklesIcon size={13} />
            </IconButton>
          )}
          <IconButton size="sm" label="Delete thread" onClick={() => void deleteThread()}>
            <TrashIcon size={13} />
          </IconButton>
        </div>
      </div>
      {expanded && (
        <>
          <div className="divide-y divide-border">
            {thread.comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} actions={actions} />
            ))}
          </div>
          <div className="border-t border-border px-3 py-2">
            {replying ? (
              <CommentForm
                placeholder="Reply…"
                submitLabel="Reply"
                onSubmit={(body) =>
                  actions.reply.mutateAsync({ threadId: thread.id, body }).then(() => setReplying(false))
                }
                onCancel={() => setReplying(false)}
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => setReplying(true)}>
                  Reply
                </Button>
                {open ? (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => actions.setStatus.mutate({ threadId: thread.id, status: 'resolved' })}>
                      Resolve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => actions.setStatus.mutate({ threadId: thread.id, status: 'dismissed' })}>
                      Dismiss
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => actions.setStatus.mutate({ threadId: thread.id, status: 'open' })}>
                    Reopen
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CommentItem(props: { comment: Comment; actions: CommentActions }) {
  const { comment, actions } = props;
  const [editing, setEditing] = useState(false);

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Delete comment?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) {
      return;
    }
    actions.removeComment.mutate(comment.id);
  };

  return (
    <div className="group px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <AuthorBadge authorType={comment.authorType} authorName={comment.authorName} />
        <span className="text-[11px] text-fg-subtle" title={comment.createdAt}>
          {dayjs(comment.createdAt).fromNow()}
        </span>
        {!editing && comment.authorType === 'user' && (
          <div className="ml-auto flex opacity-0 group-hover:opacity-100">
            <IconButton size="sm" label="Edit comment" onClick={() => setEditing(true)}>
              <PencilIcon size={12} />
            </IconButton>
            <IconButton size="sm" label="Delete comment" onClick={() => void remove()}>
              <TrashIcon size={12} />
            </IconButton>
          </div>
        )}
      </div>
      {editing ? (
        <CommentForm
          initialBody={comment.body}
          submitLabel="Save"
          onSubmit={(body) => actions.edit.mutateAsync({ commentId: comment.id, body }).then(() => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <Markdown compact>{comment.body}</Markdown>
      )}
    </div>
  );
}
