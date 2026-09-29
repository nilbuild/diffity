import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { create } from 'zustand';
import { useRepoPath } from '../../hooks/use-repo';
import { useRepoThreads } from '../../hooks/use-repo-threads';
import { closeComments, useUi } from '../../lib/ui-store';
import { threadPath } from '../../lib/thread-location';
import { groupThreads } from '../../lib/repo-thread-groups';
import { TREE_REF, type RepoThread } from '../../lib/types';
import { cn } from '../../lib/cn';
import { CommentIcon } from '../../components/icons/comment-icon';
import { SparkleIcon } from '../../components/icons/sparkle-icon';
import { XIcon } from '../../components/icons/x-icon';
import { GitCommitIcon } from '../../components/icons/git-commit-icon';
import { GitCompareIcon } from '../../components/icons/git-compare-icon';
import { PencilIcon } from '../../components/icons/pencil-icon';
import { FileIcon } from '../../components/icons/file-icon';
import { ThreadBadge } from '../../components/ui/thread-badge';
import { SegmentedToggle } from '../../components/ui/segmented-toggle';
import { formatRelativeTime } from '../../components/comments/comment-bubble';
import { GENERAL_THREAD_FILE_PATH } from '../../components/comments/types';

type StatusFilter = 'open' | 'resolved' | 'all';
type AuthorFilter = 'all' | 'agent' | 'user';

interface PanelFilters {
  status: StatusFilter;
  author: AuthorFilter;
}

const useFilters = create<PanelFilters>(() => ({ status: 'open', author: 'all' }));

const PATH_PREFIX = '__path__:';

function matchesStatus(thread: RepoThread, status: StatusFilter): boolean {
  if (status === 'all') {
    return true;
  }
  if (status === 'open') {
    return thread.status === 'open';
  }
  return thread.status !== 'open';
}

function matchesAuthor(thread: RepoThread, author: AuthorFilter): boolean {
  if (author === 'all') {
    return true;
  }
  if (author === 'agent') {
    return thread.authorType === 'agent';
  }
  return thread.authorType !== 'agent';
}

function fileLabel(filePath: string): string {
  if (filePath === GENERAL_THREAD_FILE_PATH) {
    return 'General comments';
  }
  if (!filePath.startsWith(PATH_PREFIX)) {
    return filePath;
  }
  const path = filePath.slice(PATH_PREFIX.length);
  return path === '__root__' ? 'Repository root' : `${path}/`;
}

function lineLabel(thread: RepoThread): string | null {
  if (thread.filePath === GENERAL_THREAD_FILE_PATH || thread.startLine === 0) {
    return null;
  }
  const range = thread.startLine === thread.endLine ? `L${thread.startLine}` : `L${thread.startLine}–${thread.endLine}`;
  return thread.side === 'old' ? `${range} (old)` : range;
}

export function anchorNote(thread: RepoThread): string | null {
  switch (thread.anchor) {
    case 'current':
      return null;
    case 'outdated':
      return 'Code changed since — lines are no longer in this view';
    case 'fileGone':
      return 'File no longer changed in this view';
    case 'viewEmpty':
      return thread.movedTo ? 'Changes were committed' : 'This view has no changes any more';
    case 'unknown':
      return 'This view no longer exists';
  }
}

function ViewIcon(props: { viewRef: string }) {
  const { viewRef } = props;
  const className = 'w-3.5 h-3.5 shrink-0 text-text-muted';

  if (viewRef === TREE_REF) {
    return <FileIcon className={className} />;
  }
  if (/^[0-9a-f]{7,40}~1\.\./i.test(viewRef)) {
    return <GitCommitIcon className={className} />;
  }
  if (viewRef.includes('..')) {
    return <GitCompareIcon className={className} />;
  }
  return <PencilIcon className={className} />;
}

const severityLabels: Record<string, string> = {
  'must-fix': 'Must fix',
  suggestion: 'Suggestion',
  nit: 'Nit',
  question: 'Question',
};

interface ThreadRowProps {
  thread: RepoThread;
  onOpen: (thread: RepoThread) => void;
  onOpenCommit: (thread: RepoThread) => void;
}

function ThreadRow(props: ThreadRowProps) {
  const { thread, onOpen, onOpenCommit } = props;
  const line = lineLabel(thread);
  const note = anchorNote(thread);
  const openable = thread.anchor !== 'unknown';
  const isAgent = thread.authorType === 'agent';

  return (
    <div
      role="button"
      tabIndex={openable ? 0 : -1}
      onClick={() => {
        if (openable) {
          onOpen(thread);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && openable) {
          onOpen(thread);
        }
      }}
      className={cn(
        'group flex gap-2.5 px-3 py-2.5 rounded-lg bg-bg-secondary border border-border-muted transition-colors outline-none focus-visible:border-border',
        openable ? 'hover:border-border hover:bg-fill cursor-pointer' : 'opacity-70',
      )}
      title={openable ? 'Open this comment' : undefined}
    >
      <span
        className={cn(
          'mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold',
          isAgent ? 'bg-accent/12 text-accent' : 'bg-fill text-text-secondary',
        )}
      >
        {isAgent ? <SparkleIcon className="w-3 h-3" /> : thread.authorName.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {line && <span className="font-mono text-[11px] text-text-secondary shrink-0">{line}</span>}
          <span className="text-xs text-text-secondary truncate">{thread.authorName}</span>
          {thread.severity && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-bg-tertiary text-text-secondary shrink-0">
              {severityLabels[thread.severity] ?? thread.severity}
            </span>
          )}
          {thread.pending && <ThreadBadge variant="pending" />}
          {thread.status !== 'open' && <ThreadBadge variant={thread.status} />}
          {thread.anchor !== 'current' && <ThreadBadge variant="outdated" />}
          <span className="ml-auto text-xs text-text-muted shrink-0">{formatRelativeTime(thread.updatedAt)}</span>
        </div>
        <p className="text-[13px] leading-5 text-text line-clamp-2 mt-0.5 break-words">{thread.excerpt || 'Comment'}</p>
        {(thread.replyCount > 0 || note) && (
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs text-text-secondary">
            {thread.replyCount > 0 && (
              <span>{thread.replyCount} repl{thread.replyCount === 1 ? 'y' : 'ies'}</span>
            )}
            {note && <span className="text-text-secondary">{note}</span>}
            {thread.movedTo && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenCommit(thread);
                }}
                className="text-text-secondary underline decoration-text-muted/40 underline-offset-2 hover:text-text cursor-pointer"
                title={thread.movedTo.subject}
              >
                View in commit {thread.movedTo.shortSha}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function emptyMessage(filters: PanelFilters, total: number): string {
  if (total === 0) {
    return 'No comments in this repository yet. Comments you or Claude leave in any view show up here.';
  }
  if (filters.status === 'open') {
    return 'No open comments. Everything has been resolved.';
  }
  if (filters.status === 'resolved') {
    return 'No resolved comments.';
  }
  return 'No comments match these filters.';
}

export function CommentsPanel() {
  const open = useUi((state) => state.commentsOpen);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeComments();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      panelRef.current?.focus();
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onMouseDown={(event) => {
      if (event.target === event.currentTarget) {
        closeComments();
      }
    }}>
      <div
        ref={panelRef}
        tabIndex={-1}
        className="h-full w-[460px] max-w-[92vw] bg-bg border-l border-border flex flex-col outline-none animate-slide-in-right"
      >
        <CommentsPanelBody />
      </div>
    </div>
  );
}

function CommentsPanelBody() {
  const repoPath = useRepoPath();
  const navigate = useNavigate();
  const currentRef = useCurrentViewRef();
  const { data, isLoading, error } = useRepoThreads();
  const filters = useFilters();
  const threads = useMemo(() => data ?? [], [data]);

  const counts = useMemo(() => {
    const byAuthor = threads.filter((thread) => matchesAuthor(thread, filters.author));
    return {
      open: byAuthor.filter((thread) => thread.status === 'open').length,
      resolved: byAuthor.filter((thread) => thread.status !== 'open').length,
      all: byAuthor.length,
    };
  }, [threads, filters.author]);

  const groups = useMemo(() => {
    const visible = threads.filter(
      (thread) => matchesStatus(thread, filters.status) && matchesAuthor(thread, filters.author),
    );
    return groupThreads(visible, currentRef);
  }, [threads, filters, currentRef]);

  const openThread = (thread: RepoThread) => {
    closeComments();
    navigate(threadPath(repoPath, { ref: thread.ref, threadId: thread.id }));
  };

  const openCommit = (thread: RepoThread) => {
    if (!thread.movedTo) {
      return;
    }
    closeComments();
    const params = new URLSearchParams({ ref: thread.movedTo.ref, file: thread.filePath });
    navigate(`/r/${encodeURIComponent(repoPath)}/diff?${params.toString()}`);
  };

  const openView = (ref: string) => {
    closeComments();
    navigate(threadPath(repoPath, { ref }));
  };

  return (
    <>
      <div className="flex items-center justify-between h-12 px-4" data-tauri-drag-region>
        <div className="flex items-center gap-2">
          <CommentIcon className="w-4 h-4 text-text-muted" />
          <h2 className="text-sm font-semibold text-text">Comments</h2>
          <span className="text-xs text-text-secondary">in every view of this repository</span>
        </div>
        <button
          onClick={closeComments}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
          title="Close (Esc)"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3 border-b border-border-muted">
        <SegmentedToggle<StatusFilter>
          value={filters.status}
          onChange={(status) => useFilters.setState({ status })}
          options={[
            { value: 'open', label: `Open ${counts.open}` },
            { value: 'resolved', label: `Resolved ${counts.resolved}` },
            { value: 'all', label: `All ${counts.all}` },
          ]}
        />
        <div className="ml-auto">
          <SegmentedToggle<AuthorFilter>
            value={filters.author}
            onChange={(author) => useFilters.setState({ author })}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'agent', label: 'Claude' },
              { value: 'user', label: 'You' },
            ]}
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && <div className="px-4 py-6 text-xs text-text-muted">Loading comments…</div>}
        {error && <div className="px-4 py-6 text-xs text-deleted">Could not load comments: {String((error as { message?: string }).message ?? error)}</div>}
        {!isLoading && !error && groups.length === 0 && (
          <div className="px-6 py-10 text-center text-xs text-text-muted leading-relaxed">{emptyMessage(filters, threads.length)}</div>
        )}
        {groups.map((group) => (
          <section key={group.ref} className="mb-4">
            <div className="sticky top-0 z-10 flex items-center gap-2 px-4 h-9 bg-bg">
              <ViewIcon viewRef={group.ref} />
              <span className="text-xs font-medium text-text truncate" title={group.ref}>{group.label}</span>
              {group.ref === currentRef && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-fill text-text-secondary shrink-0">This view</span>
              )}
              <span className="text-xs text-text-muted shrink-0">{group.count}</span>
              {group.ref !== currentRef && (
                <button
                  onClick={() => openView(group.ref)}
                  className="ml-auto h-6 px-2 -mr-1 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer shrink-0"
                >
                  Open view
                </button>
              )}
            </div>
            {group.files.map((file) => (
              <div key={file.path} className="px-3">
                <div className="px-1 pt-2 pb-1.5 font-mono text-[11px] text-text-secondary truncate" title={file.path}>
                  {fileLabel(file.path)}
                </div>
                <div className="flex flex-col gap-2">
                  {file.threads.map((thread) => (
                    <ThreadRow key={thread.id} thread={thread} onOpen={openThread} onOpenCommit={openCommit} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="px-4 h-9 flex items-center gap-1 border-t border-border-muted text-xs text-text-muted">
        Press <kbd className="px-1 py-0.5 bg-bg-secondary border border-border rounded font-mono">C</kbd> to toggle this panel
      </div>
    </>
  );
}
