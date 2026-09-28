import { useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/markdown/Markdown';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { Spinner } from '@/components/ui/Spinner';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CopyIcon,
  DismissIcon,
  LinkIcon,
  MoreIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
  UndoIcon,
} from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { dayjs } from '@/lib/time';
import { GENERAL_FILE_PATH, type Comment, type Thread } from '@/lib/types';
import { agentBus, useAgentThreadActivity } from '@/features/workspace/agent-bus';
import { Avatar, PendingBadge, SeverityBadge, StatusBadge, authorLabel } from './badges';
import { CommentComposer } from './CommentComposer';
import { openReply, useCommentDraft } from './draft-store';
import { lineLabel, threadsAsPrompt } from './thread-utils';
import type { CommentActions } from './use-threads';

export interface ThreadCardProps {
  thread: Thread;
  actions: CommentActions;
  showLocation?: boolean;
  onLocate?: () => void;
}

function locationLabel(thread: Thread): string {
  if (thread.filePath === GENERAL_FILE_PATH) {
    return 'General';
  }
  return `${thread.filePath}:${lineLabel(thread).replace(/^L-?/, '')}`;
}

export function ThreadCard(props: ThreadCardProps) {
  const { thread, actions, showLocation, onLocate } = props;
  const open = thread.status === 'open';
  const [expanded, setExpanded] = useState(open);
  const active = useCommentDraft((s) => s.activeThreadId === thread.id);
  const replyKey = `reply:${thread.id}`;
  const replying = useCommentDraft((s) => replyKey in s.bodies);
  const activity = useAgentThreadActivity(thread.id);
  const first = thread.comments[0];
  const pendingComments = thread.comments.filter((c) => c.pending).length;
  const showBody = expanded || activity !== 'idle';

  const deleteThread = async () => {
    const ok = await confirmDialog({
      title: thread.pending ? 'Delete pending comment?' : 'Delete conversation?',
      message: 'This removes the thread and all of its replies.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) {
      return;
    }
    actions.removeThread.mutate(thread.id);
  };

  const askClaude = () => {
    setExpanded(true);
    openReply(thread.id, '@claude ');
  };

  const setStatus = (status: Thread['status']) => {
    actions.setStatus.mutate({ threadId: thread.id, status });
    setExpanded(status === 'open');
  };

  const menu: MenuEntry[] = [
    {
      label: 'Ask Claude to fix',
      icon: <SparklesIcon size={14} />,
      disabled: thread.pending || !open,
      onSelect: () => agentBus.runAction({ kind: 'resolve', threadId: thread.id }),
    },
    {
      label: 'Copy as prompt',
      icon: <CopyIcon size={14} />,
      onSelect: () => {
        const prompt = threadsAsPrompt([{ ...thread, status: 'open' }]);
        void navigator.clipboard.writeText(prompt).then(() => toast.success('Copied as a prompt'));
      },
    },
    {
      label: 'Copy location',
      icon: <LinkIcon size={14} />,
      onSelect: () => {
        void navigator.clipboard.writeText(locationLabel(thread)).then(() => toast.success('Location copied'));
      },
    },
    'separator',
    open
      ? { label: 'Dismiss', icon: <DismissIcon size={14} />, disabled: thread.pending, onSelect: () => setStatus('dismissed') }
      : { label: 'Reopen', icon: <UndoIcon size={14} />, onSelect: () => setStatus('open') },
    { label: 'Delete conversation…', icon: <TrashIcon size={14} />, danger: true, onSelect: () => void deleteThread() },
  ];

  return (
    <div
      data-thread-id={thread.id}
      className={cn(
        'overflow-hidden rounded-lg border bg-raised font-sans text-sm transition-colors',
        thread.pending ? 'border-dashed border-warning/60' : 'border-border',
        active && 'border-solid border-accent outline outline-1 outline-accent',
      )}
    >
      <div
        className={cn(
          'flex h-9 items-center gap-2 pr-1.5 pl-2',
          showBody && 'border-b border-border',
          active ? 'bg-selected' : thread.pending ? 'bg-warning/8' : 'bg-panel',
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 text-left"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronRightIcon size={12} className={cn('shrink-0 text-fg-subtle transition-transform', expanded && 'rotate-90')} />
          {showLocation ? (
            <span
              role="link"
              tabIndex={-1}
              onClick={(event) => {
                if (!onLocate) {
                  return;
                }
                event.stopPropagation();
                onLocate();
              }}
              className="truncate font-mono text-xs text-accent hover:underline"
            >
              {locationLabel(thread)}
            </span>
          ) : (
            <span className={cn('shrink-0 text-xs font-medium text-fg-muted', thread.filePath !== GENERAL_FILE_PATH && 'font-mono')}>{lineLabel(thread)}</span>
          )}
          {thread.severity && <SeverityBadge severity={thread.severity} />}
          {thread.pending ? <PendingBadge /> : <StatusBadge status={thread.status} />}
          {!thread.pending && pendingComments > 0 && <PendingBadge />}
          {!expanded && first && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Avatar authorType={first.authorType} authorName={first.authorName} size="sm" />
              <span className="truncate text-xs text-fg-muted">{first.body}</span>
            </span>
          )}
          {!expanded && thread.comments.length > 1 && (
            <span className="shrink-0 text-2xs text-fg-subtle">+{thread.comments.length - 1}</span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {open && !thread.pending && (
            <IconButton size="sm" label="Ask Claude" onClick={askClaude}>
              <SparklesIcon size={14} className="text-accent" />
            </IconButton>
          )}
          <Menu
            items={menu}
            trigger={(trigger) => (
              <IconButton ref={trigger.ref} size="sm" label="Conversation actions" active={trigger.open} onClick={trigger.onClick}>
                <MoreIcon size={14} />
              </IconButton>
            )}
          />
        </div>
      </div>
      {showBody && (
        <>
          {expanded && (
            <div className="divide-y divide-border-subtle">
              {thread.comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} actions={actions} threadPending={thread.pending} />
              ))}
            </div>
          )}
          {activity !== 'idle' && <ActivityRow activity={activity} />}
          {expanded && (
            <div className="border-t border-border bg-panel/60 px-3 py-2">
              {replying ? (
                <CommentComposer
                  draftKey={replyKey}
                  mode="reply"
                  sessionId={actions.sessionId}
                  threadPending={thread.pending}
                  onSubmit={(input) =>
                    actions.reply.mutateAsync({ threadId: thread.id, body: input.body, pending: input.pending }).then(() => {
                      if (input.pending) {
                        toast.success('Reply added to your review');
                      }
                    })
                  }
                  onCancel={() => undefined}
                />
              ) : (
                <ReplyFooter
                  open={open}
                  pending={thread.pending}
                  onReply={() => openReply(thread.id)}
                  onResolve={() => setStatus('resolved')}
                  onReopen={() => setStatus('open')}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReplyFooter(props: { open: boolean; pending: boolean; onReply: () => void; onResolve: () => void; onReopen: () => void }) {
  const { open, pending, onReply, onResolve, onReopen } = props;
  return (
    <div className="flex items-center gap-2">
      <Avatar authorType="user" authorName="You" size="sm" />
      <button
        type="button"
        onClick={onReply}
        className="flex h-7 min-w-0 flex-1 cursor-text items-center rounded-md border border-border bg-canvas px-2.5 text-left text-sm text-fg-subtle hover:border-border-strong"
      >
        Reply…
      </button>
      {!pending && open && (
        <Button size="sm" variant="secondary" onClick={onResolve}>
          <CheckCircleIcon size={12} className="text-success" />
          Resolve
        </Button>
      )}
      {!pending && !open && (
        <Button size="sm" variant="secondary" onClick={onReopen}>
          <UndoIcon size={12} />
          Reopen
        </Button>
      )}
    </div>
  );
}

function ActivityRow(props: { activity: 'queued' | 'working' }) {
  const { activity } = props;
  return (
    <div className="flex items-center gap-2 border-t border-border-subtle bg-accent-soft/50 px-3 py-2 text-xs">
      <Avatar authorType="agent" authorName="Claude Code" size="sm" />
      <span className="font-medium text-fg">Claude Code</span>
      <span className="inline-flex items-center gap-1.5 text-fg-muted">
        {activity === 'working' ? <Spinner size={12} className="text-accent" /> : null}
        {activity === 'working' ? 'is working on this…' : 'is queued to respond'}
      </span>
    </div>
  );
}

function CommentItem(props: { comment: Comment; actions: CommentActions; threadPending: boolean }) {
  const { comment, actions, threadPending } = props;
  const editKey = `edit:${comment.id}`;
  const editing = useCommentDraft((s) => editKey in s.bodies);
  const setBody = useCommentDraft((s) => s.setBody);

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Delete comment?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true });
    if (!ok) {
      return;
    }
    actions.removeComment.mutate(comment.id);
  };

  return (
    <div className={cn('group flex gap-2.5 px-3 py-2.5', comment.pending && !threadPending && 'bg-warning/4')}>
      <Avatar authorType={comment.authorType} authorName={comment.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center gap-2">
          <span className={cn('text-xs font-semibold', comment.authorType === 'agent' ? 'text-accent' : 'text-fg')}>
            {authorLabel(comment.authorType, comment.authorName)}
          </span>
          {comment.authorType === 'agent' && <span className="rounded-sm border border-border px-1 text-2xs text-fg-subtle">bot</span>}
          <span className="text-2xs text-fg-subtle" title={new Date(comment.createdAt).toLocaleString()}>
            {dayjs(comment.createdAt).fromNow()}
          </span>
          {comment.pending && !threadPending && <PendingBadge />}
          {!editing && comment.authorType === 'user' && (
            <div className="ml-auto flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <IconButton size="sm" label="Edit comment" onClick={() => setBody(editKey, comment.body)}>
                <PencilIcon size={14} />
              </IconButton>
              <IconButton size="sm" label="Delete comment" onClick={() => void remove()}>
                <TrashIcon size={14} />
              </IconButton>
            </div>
          )}
        </div>
        {editing ? (
          <div className="mt-1">
            <CommentComposer
              draftKey={editKey}
              mode="edit"
              sessionId={null}
              initialBody={comment.body}
              onSubmit={(input) => actions.edit.mutateAsync({ commentId: comment.id, body: input.body })}
              onCancel={() => undefined}
            />
          </div>
        ) : (
          <Markdown compact mentions className="text-fg">
            {comment.body}
          </Markdown>
        )}
      </div>
    </div>
  );
}
