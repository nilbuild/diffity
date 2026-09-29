import { useEffect, useState, type ReactNode } from 'react';
import type { CommentThread as CommentThreadType, SubmitOptions } from './types';
import { GENERAL_THREAD_FILE_PATH, isThreadResolved } from './types';
import { ThreadBadge } from '../ui/thread-badge';
import { ThreadCard } from './thread-card';
import { useUi } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { ChevronIcon, CommentIcon } from '../ui/icon';

interface OrphanedThreadsProps {
  threads: CommentThreadType[];
  onEditComment: (commentId: string, body: string) => void;
  onDeleteComment: (threadId: string, commentId: string) => void;
  onDeleteThread: (threadId: string) => void;
  onReply?: (threadId: string, body: string, options: SubmitOptions) => void;
  onResolve?: (threadId: string) => void;
  onUnresolve?: (threadId: string) => void;
  title?: ReactNode;
  showFilePath?: boolean;
  renderExtra?: (thread: CommentThreadType) => ReactNode;
  className?: string;
  /** A plain labelled section (used on an empty view) instead of the collapsible strip. */
  section?: boolean;
}

function MiddlePath(props: { path: string }) {
  const { path } = props;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;

  return (
    <span className="flex min-w-0 font-mono text-[11px]" title={path}>
      {dir && <span className="truncate text-text-muted">{dir}</span>}
      <span className="shrink-0 text-text-secondary">{name}</span>
    </span>
  );
}

function lineLabel(thread: CommentThreadType): string {
  if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
    return 'General comment';
  }
  if (thread.startLine === 0) {
    return 'File comment';
  }
  if (thread.startLine === thread.endLine) {
    return `Line ${thread.startLine}`;
  }
  return `Lines ${thread.startLine}–${thread.endLine}`;
}

export function OrphanedThreads(props: OrphanedThreadsProps) {
  const {
    threads,
    onEditComment,
    onDeleteComment,
    onDeleteThread,
    onReply,
    onResolve,
    onUnresolve,
    title,
    showFilePath,
    renderExtra,
    className,
    section = false,
  } = props;
  const focusThreadId = useUi((state) => state.focusThreadId);
  const [isExpanded, setIsExpanded] = useState(() => threads.some(thread => !isThreadResolved(thread)));

  useEffect(() => {
    if (threads.some(thread => !isThreadResolved(thread))) {
      setIsExpanded(true);
    }
  }, [threads]);

  useEffect(() => {
    if (focusThreadId && threads.some(thread => thread.id === focusThreadId)) {
      setIsExpanded(true);
    }
  }, [focusThreadId, threads]);

  if (threads.length === 0) {
    return null;
  }

  const cards = threads.map((thread) => (
    <ThreadCard
      key={thread.id}
      thread={thread}
      compact={section}
      onEditComment={(commentId, body) => onEditComment(commentId, body)}
      onDeleteComment={(commentId) => onDeleteComment(thread.id, commentId)}
      onDeleteThread={() => onDeleteThread(thread.id)}
      onReply={onReply ? (body, options) => onReply(thread.id, body, options) : undefined}
      onResolve={onResolve ? () => onResolve(thread.id) : undefined}
      onUnresolve={onUnresolve ? () => onUnresolve(thread.id) : undefined}
      className="thread-card border border-border bg-bg"
      headerLeft={
        <>
          {showFilePath && thread.filePath !== GENERAL_THREAD_FILE_PATH && <MiddlePath path={thread.filePath} />}
          <span className="shrink-0 text-[11px] text-text-muted font-mono">{lineLabel(thread)}</span>
          {(thread.status === 'resolved' || thread.status === 'dismissed') && <ThreadBadge variant={thread.status} />}
        </>
      }
      headerRight={renderExtra?.(thread)}
    >
      {thread.anchorContent && (
        <pre className="px-3 py-2 text-xs font-mono text-text-muted bg-bg-tertiary/50 border-b border-border overflow-x-auto whitespace-pre max-h-24 overflow-y-auto">{thread.anchorContent}</pre>
      )}
    </ThreadCard>
  ));

  if (section) {
    return (
      <section className={className}>
        <h3 className="mb-2 text-[13px] font-semibold text-text">{title}</h3>
        <div className="space-y-3">{cards}</div>
      </section>
    );
  }

  return (
    <div className={cn('border-b border-border bg-bg-secondary/50', className)}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 w-full h-8 px-3 text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      >
        <ChevronIcon expanded={isExpanded} />
        <CommentIcon className="w-3.5 h-3.5" />
        <span>
          {title ?? `${threads.length} outdated comment${threads.length !== 1 ? 's' : ''}`}
        </span>
        <ThreadBadge variant="outdated" />
      </button>
      {isExpanded && (
        <div className="px-3 pb-2 space-y-2 [&>*]:max-w-[700px]">
          {cards}
        </div>
      )}
    </div>
  );
}
