import { useState } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/markdown/Markdown';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { Spinner } from '@/components/ui/Spinner';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import {
  CommentIcon,
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

  const count = thread.comments.length;

  if (!expanded && activity === 'idle') {
    return (
      <div data-thread-id={thread.id} className="flex items-center gap-1 font-sans">
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className={cn(
            'inline-flex h-6 min-w-0 cursor-default items-center gap-1.5 rounded-full bg-muted-soft px-2.5 text-xs text-fg-muted hover:bg-muted hover:text-fg',
            active && 'bg-hover text-fg-muted',
            thread.pending && 'border border-dashed border-warning/60',
          )}
        >
          <CommentIcon size={14} className="shrink-0" />
          {showLocation ? <span className="truncate font-mono">{locationLabel(thread)}</span> : null}
          <span className="shrink-0">
            {count} {count === 1 ? 'comment' : 'comments'}
          </span>
          {thread.severity && <SeverityBadge severity={thread.severity} />}
          {thread.pending ? <PendingBadge /> : <StatusBadge status={thread.status} />}
          {!expanded && first && open && <span className="max-w-[360px] truncate text-fg-muted">{first.body}</span>}
        </button>
      </div>
    );
  }

  return (
    <div
      data-thread-id={thread.id}
      className={cn(
        'overflow-hidden rounded-xl bg-muted-soft font-sans text-sm transition-colors',
        thread.pending ? 'border border-dashed border-warning/60' : 'border border-transparent',
        active && 'border-solid border-accent',
      )}
    >
      <div className="flex min-h-9 items-center gap-2 pt-1.5 pr-1.5 pb-0.5 pl-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {showLocation ? (
            <button
              type="button"
              onClick={onLocate}
              className="cursor-default truncate font-mono text-2xs text-accent hover:underline"
            >
              {locationLabel(thread)}
            </button>
          ) : (
            <span className="shrink-0 text-xs font-medium text-fg-muted">{headerLabel(thread)}</span>
          )}
          {thread.severity && <SeverityBadge severity={thread.severity} />}
          {thread.pending ? <PendingBadge /> : <StatusBadge status={thread.status} />}
          {!thread.pending && pendingComments > 0 && <PendingBadge />}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {open && !thread.pending && (
            <IconButton size="sm" label="Ask Claude" onClick={askClaude}>
              <SparklesIcon size={14} className="text-accent" />
            </IconButton>
          )}
          {!thread.pending && (
            <TextAction onClick={() => setStatus(open ? 'resolved' : 'open')}>{open ? 'Resolve' : 'Reopen'}</TextAction>
          )}
          <TextAction onClick={() => setExpanded(false)}>Collapse</TextAction>
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
      <div className="flex flex-col gap-1 px-1.5 pt-0.5 pb-1.5">
        {thread.comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} actions={actions} threadPending={thread.pending} />
        ))}
        {activity !== 'idle' && <ActivityRow activity={activity} />}
      </div>
      {replying ? (
        <div className="px-1.5 pb-1.5">
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
        </div>
      ) : (
        <div className="px-3 pb-2">
          <button type="button" onClick={() => openReply(thread.id)} className="cursor-default text-xs font-medium text-accent hover:text-accent-hover">
            Reply
          </button>
        </div>
      )}
    </div>
  );
}

function headerLabel(thread: Thread): string {
  if (thread.filePath === GENERAL_FILE_PATH) {
    return 'General';
  }
  if (thread.startLine === 0) {
    return 'File';
  }
  if (thread.startLine === thread.endLine) {
    return `Line ${thread.startLine}`;
  }
  return `Lines ${thread.startLine}–${thread.endLine}`;
}

function TextAction(props: { onClick: () => void; children: string }) {
  const { onClick, children } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-6 cursor-default rounded-full px-2 text-xs text-fg-muted hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

function ActivityRow(props: { activity: 'queued' | 'working' }) {
  const { activity } = props;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2 text-xs">
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
    <div className={cn('group rounded-lg bg-paper px-3 py-2.5', comment.pending && !threadPending && 'border border-dashed border-warning/50')}>
      <div className="flex h-5 items-center gap-2">
        <Avatar authorType={comment.authorType} authorName={comment.authorName} size="sm" />
        <span className="text-xs font-semibold text-fg">{authorLabel(comment.authorType, comment.authorName)}</span>
        {comment.authorType === 'agent' && <span className="rounded-full bg-accent-soft px-1.5 text-2xs leading-4 font-medium text-accent">bot</span>}
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
      <div className="mt-1.5 pl-7">
        {editing ? (
          <CommentComposer
            draftKey={editKey}
            mode="edit"
            sessionId={null}
            initialBody={comment.body}
            onSubmit={(input) => actions.edit.mutateAsync({ commentId: comment.id, body: input.body })}
            onCancel={() => undefined}
          />
        ) : (
          <Markdown compact mentions className="text-fg">
            {comment.body}
          </Markdown>
        )}
      </div>
    </div>
  );
}
