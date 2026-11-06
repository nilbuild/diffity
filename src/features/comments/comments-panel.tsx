import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { create } from 'zustand';
import { useRepoPath } from '../../hooks/use-repo';
import { inView, useRepoThreads } from '../../hooks/use-repo-threads';
import { closeComments, useUi } from '../../lib/ui-store';
import { threadPath } from '../../lib/thread-location';
import { groupThreads, isCurrentGroup } from '../../lib/repo-thread-groups';
import { TREE_REF, type RepoThread } from '../../lib/types';
import { cn } from '../../lib/cn';
import { ThreadBadge } from '../../components/ui/thread-badge';
import { SegmentedToggle } from '../../components/ui/segmented-toggle';
import { formatRelativeTime } from '../../components/comments/comment-bubble';
import { GENERAL_THREAD_FILE_PATH, SEVERITY_LABELS } from '../../components/comments/types';
import { InlineMarkdown } from '../../components/comments/inline-markdown';
import { AddressedBadge } from '../../components/comments/addressed-badge';
import { CheckIcon, ChevronIcon, CommentIcon, FileIcon, GitCommitIcon, GitCompareIcon, PencilIcon, SparkleIcon, TrashIcon, UndoIcon, XIcon } from '../../components/ui/icon';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteThread, errorMessage, keepThreadOnBranch } from '../../lib/api';
import type { ThreadSnapshot } from '../../lib/types';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Skeleton, useRevealClass } from '../../components/ui/skeleton';
import { changeThreadStatus, deletedToast, deleteThreadWithUndo } from '../../hooks/use-comment-actions';
import { enqueueClaude, useThreadActivity, useThreadRunAgent } from '../claude/claude-runner';
import { agentByName, agentMeta } from '../claude/agents';
import { useRunPick } from '../claude/model-setting';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { MarkdownContent } from '../../components/layout/markdown-content';

type StatusFilter = 'open' | 'resolved' | 'all';
type AuthorFilter = 'all' | 'user' | 'github' | 'agent';
type ScopeFilter = 'view' | 'all';

interface PanelFilters {
  status: StatusFilter;
  author: AuthorFilter;
  scope: ScopeFilter;
}

const useFilters = create<PanelFilters>(() => ({ status: 'open', author: 'all', scope: 'view' }));

const PATH_PREFIX = '__path__:';
const GROUPS_KEY = 'diffity-comment-groups';

function readGroupState(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeGroupState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(GROUPS_KEY, JSON.stringify(state));
  } catch {
    return;
  }
}

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
  return thread.authorType === author;
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
  const className = 'w-3.5 h-3.5 text-text-muted';

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

/** Full conversation of a thread whose code is no longer in its view, so it can't be read in the diff. */
function OutdatedThreadBody(props: { thread: RepoThread }) {
  const { thread } = props;
  const { data, isLoading } = useReviewThreads(thread.sessionId);
  const full = data?.find((item) => item.id === thread.id);

  if (isLoading) {
    return <div className="mt-2 text-xs text-text-muted">Loading…</div>;
  }
  if (!full) {
    return null;
  }
  return (
    <div className="mt-2 rounded-md border border-border-muted bg-bg-secondary/50 overflow-hidden cursor-auto" onClick={(event) => event.stopPropagation()}>
      {full.anchorContent && (
        <pre className="px-2.5 py-1.5 text-[11px] font-mono text-text-muted border-b border-border-muted overflow-x-auto whitespace-pre max-h-24 overflow-y-auto">{full.anchorContent}</pre>
      )}
      {full.comments.map((comment) => (
        <div key={comment.id} className="px-2.5 py-2 border-t border-border-muted first:border-t-0">
          <div className="flex items-center gap-1.5 text-xs">
            {comment.author.type === 'agent' && <SparkleIcon className="w-3 h-3 text-claude" />}
            <span className="font-medium text-text">{comment.author.name}</span>
            <span className="text-text-muted">{formatRelativeTime(comment.createdAt)}</span>
          </div>
          <div className="mt-0.5 text-[13px] leading-5 text-text-secondary select-text">
            <MarkdownContent content={comment.body} />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ThreadRowProps {
  thread: RepoThread;
  onOpen: (thread: RepoThread) => void;
  onOpenCommit: (thread: RepoThread) => void;
}

function ThreadRow(props: ThreadRowProps) {
  const { thread, onOpen, onOpenCommit } = props;
  const queryClient = useQueryClient();
  const line = lineLabel(thread);
  const note = anchorNote(thread);
  const outdated = !thread.unassigned && thread.anchor !== 'current' && thread.anchor !== 'unknown';
  const openable = thread.unassigned || thread.anchor === 'current' || outdated;
  const [expanded, setExpanded] = useState(false);
  const isAgent = thread.authorType === 'agent';
  const isOpen = thread.status === 'open';
  const activity = useThreadActivity(thread.id);
  const repoPath = useRepoPath();
  const fixPick = useRunPick('fix', repoPath);
  const repoAgent = agentMeta(fixPick.agent);
  const runAgentId = useThreadRunAgent(thread.id);
  const runAgentName = runAgentId ? agentMeta(runAgentId).short : null;
  const canAskClaude = isOpen && !thread.unassigned && !thread.pending && thread.anchor !== 'current' && thread.anchor !== 'unknown' && activity === 'idle';
  const open = () => {
    if (thread.anchor === 'current' && !thread.unassigned) {
      onOpen(thread);
      return;
    }
    setExpanded(!expanded);
  };
  const addressedBy = isOpen && thread.addressedBy ? agentByName(thread.addressedBy)?.short ?? thread.addressedBy : null;
  const [keeping, setKeeping] = useState(false);
  const keep = () => {
    setKeeping(true);
    keepThreadOnBranch(thread.id)
      .then(
        () => toast.success('Kept on this branch'),
        (error) => toast.error('Could not move the comment', { description: errorMessage(error) }),
      )
      .finally(() => {
        setKeeping(false);
        queryClient.invalidateQueries({ queryKey: ['repo-threads'] });
        queryClient.invalidateQueries({ queryKey: ['threads'] });
      });
  };
  const toggleStatus = () => {
    void changeThreadStatus(thread.id, isOpen ? 'resolved' : 'open');
  };

  return (
    <div
      role="button"
      tabIndex={openable ? 0 : -1}
      onClick={() => {
        if (openable) {
          open();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && openable) {
          open();
        }
      }}
      className={cn(
        'group flex gap-2.5 px-3 py-2.5 rounded-lg bg-bg border border-border transition-colors outline-none focus-visible:border-focus',
        openable ? 'hover:border-control-border hover:bg-bg-secondary cursor-pointer' : 'cursor-default',
      )}
      title={openable ? (thread.anchor === 'current' && !thread.unassigned ? 'Open this comment' : expanded ? 'Hide the conversation' : 'Show the whole conversation') : undefined}
    >
      <span
        className={cn(
          'mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold',
          isAgent ? 'bg-claude/12 text-claude' : 'bg-fill text-text-secondary',
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
              {SEVERITY_LABELS[thread.severity] ?? thread.severity}
            </span>
          )}
          {thread.pending && <ThreadBadge variant="pending" />}
          {addressedBy && <AddressedBadge agent={addressedBy} />}
          {thread.status !== 'open' && <ThreadBadge variant={thread.status} />}
          {thread.anchor !== 'current' && !thread.unassigned && <ThreadBadge variant="outdated" />}
          <span className="ml-auto text-xs text-text-muted shrink-0 group-hover:hidden group-focus-within:hidden">{formatRelativeTime(thread.updatedAt)}</span>
          {canAskClaude && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath, sessionId: thread.sessionId, ref: thread.ref, pick: fixPick });
              }}
              className="ml-auto hidden group-hover:inline-flex group-focus-within:inline-flex items-center gap-1 h-5 -my-0.5 px-1.5 rounded text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer shrink-0"
              title={`${repoAgent.short} answers or makes the change for this comment`}
            >
              <SparkleIcon className="w-3 h-3 text-claude" />
              Ask {repoAgent.short}
            </button>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleStatus();
            }}
            className={cn(
              'hidden group-hover:inline-flex group-focus-within:inline-flex items-center gap-1 h-5 -my-0.5 px-1.5 rounded text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer shrink-0',
              !canAskClaude && 'ml-auto',
            )}
          >
            {isOpen ? <CheckIcon size="xs" /> : <UndoIcon size="xs" />}
            {isOpen ? 'Resolve' : 'Reopen'}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void deleteThreadWithUndo(thread.id);
            }}
            className="hidden group-hover:inline-flex group-focus-within:inline-flex items-center justify-center w-5 h-5 -my-0.5 rounded text-text-muted hover:text-deleted hover:bg-hover cursor-pointer shrink-0"
            title="Delete this comment and its replies"
            aria-label="Delete comment"
          >
            <TrashIcon size="xs" />
          </button>
        </div>
        {!expanded && <InlineMarkdown text={thread.excerpt || 'Comment'} className="text-[13px] leading-5 text-text line-clamp-2 mt-0.5" />}
        {expanded && <OutdatedThreadBody thread={thread} />}
        {activity !== 'idle' && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-text-muted">
            <SparkleIcon className="w-3 h-3 text-claude" />
            {activity === 'working' ? `${runAgentName ?? 'Agent'} is working…` : runAgentName ? `Queued for ${runAgentName}` : 'Queued'}
          </div>
        )}
        {thread.unassigned && <UnassignedHint thread={thread} keeping={keeping} onKeep={keep} />}
        {(thread.replyCount > 0 || (note && !thread.unassigned)) && (
          <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-xs text-text-secondary">
            {thread.replyCount > 0 && !expanded && (
              <span>{thread.replyCount} repl{thread.replyCount === 1 ? 'y' : 'ies'}</span>
            )}
            {note && !thread.unassigned && <span className="text-text-secondary">{note}</span>}
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

function ThreadRowSkeleton() {
  return (
    <div className="flex gap-2.5 px-3 py-2.5 rounded-lg bg-bg border border-border" aria-hidden>
      <Skeleton circle className="mt-0.5 w-5 h-5" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3 w-24 mt-1" />
        <Skeleton className="h-3 w-4/5 mt-2.5" />
      </div>
    </div>
  );
}

/** Which branch an unassigned comment likely belongs to (its lines are in this branch's changes), and the way to keep it. */
function UnassignedHint(props: { thread: RepoThread; keeping: boolean; onKeep: () => void }) {
  const { thread, keeping, onKeep } = props;
  const matches = thread.anchor === 'current' || !!thread.movedTo;

  return (
    <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1.5 text-xs text-text-secondary">
      <span>{matches ? 'Probably this branch: its lines are in these changes' : 'Its lines aren’t in this branch’s changes'}</span>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onKeep();
        }}
        disabled={keeping}
        className="inline-flex items-center gap-1 h-5 px-1.5 rounded text-xs font-medium text-text bg-fill hover:bg-hover cursor-pointer disabled:opacity-60 disabled:cursor-default"
        title="Show it with this branch’s uncommitted changes"
      >
        {keeping ? 'Moving…' : 'Keep on this branch'}
      </button>
    </div>
  );
}

function deleteMessage(filters: PanelFilters, count: number, viewOnly: boolean): string {
  const status = filters.status === 'open' ? 'open ' : filters.status === 'resolved' ? 'resolved ' : '';
  const author = { all: '', user: ' from you', github: ' from reviewers', agent: ' from agents' }[filters.author];
  const noun = count === 1 ? 'comment' : 'comments';
  return `Delete ${count === 1 ? 'the' : `all ${count}`} ${status}${noun}${author} ${viewOnly ? 'in this view' : 'across every view in this repository'}?`;
}

function emptyMessage(filters: PanelFilters, total: number, viewOnly: boolean): string {
  if (total === 0 && viewOnly) {
    return 'No comments in this view yet. Switch to All views to see comments from other diffs.';
  }
  if (total === 0) {
    return 'No comments in this repository yet. Comments you or an agent leave in any view show up here.';
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
        className="h-full w-[460px] max-w-[92vw] bg-sidebar border-l border-frame-border flex flex-col outline-none animate-slide-in-right"
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
  const scopeRef = filters.scope === 'view' ? currentRef : null;
  const threads = useMemo(() => (data ?? []).filter((thread) => inView(thread, scopeRef)), [data, scopeRef]);
  const hasReviewers = threads.some((thread) => thread.authorType === 'github');
  const author: AuthorFilter = filters.author === 'github' && !hasReviewers ? 'all' : filters.author;
  const reveal = useRevealClass(isLoading);

  const counts = useMemo(() => {
    const byAuthor = threads.filter((thread) => matchesAuthor(thread, author));
    return {
      open: byAuthor.filter((thread) => thread.status === 'open').length,
      resolved: byAuthor.filter((thread) => thread.status !== 'open').length,
      all: byAuthor.length,
    };
  }, [threads, author]);

  const visible = useMemo(
    () => threads.filter((thread) => matchesStatus(thread, filters.status) && matchesAuthor(thread, author)),
    [threads, filters.status, author],
  );
  const groups = useMemo(() => groupThreads(visible, currentRef), [visible, currentRef]);
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteVisible = async () => {
    setConfirmDelete(false);
    const ids = visible.map((thread) => thread.id);
    const results = await Promise.allSettled(ids.map((id) => deleteThread(id)));
    queryClient.invalidateQueries({ queryKey: ['repo-threads'] });
    queryClient.invalidateQueries({ queryKey: ['threads'] });
    queryClient.invalidateQueries({ queryKey: ['reviews'] });
    const snapshots = results.flatMap((result): ThreadSnapshot[] => (result.status === 'fulfilled' ? [result.value] : []));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      toast.error('Some comments could not be deleted', { description: errorMessage(failed.reason) });
    }
    deletedToast(snapshots);
  };

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

  const [groupState, setGroupState] = useState(readGroupState);
  const isGroupOpen = (group: (typeof groups)[number]) => {
    const stored = groupState[`${repoPath}\n${group.key}`];
    if (stored !== undefined) {
      return stored;
    }
    if (isCurrentGroup(group, currentRef) || group.unassigned) {
      return true;
    }
    return group.files.some((file) => file.threads.some((thread) => thread.status === 'open' && thread.authorType === 'agent'));
  };
  const toggleGroup = (group: (typeof groups)[number]) => {
    const next = { ...groupState, [`${repoPath}\n${group.key}`]: !isGroupOpen(group) };
    setGroupState(next);
    writeGroupState(next);
  };

  const openView = (ref: string) => {
    closeComments();
    navigate(threadPath(repoPath, { ref }));
  };

  return (
    <>
      <div className="flex items-center justify-between h-12 px-4" data-tauri-drag-region>
        <div className="flex items-center gap-2">
          <CommentIcon size="md" className="text-text-secondary" />
          <h2 className="text-[15px] font-semibold text-text">Comments</h2>
          {currentRef ? (
            <SegmentedToggle<ScopeFilter>
              value={filters.scope}
              onChange={(scope) => useFilters.setState({ scope })}
              options={[
                { value: 'view', label: 'This view' },
                { value: 'all', label: 'All views' },
              ]}
            />
          ) : (
            <span className="text-xs text-text-secondary">across this repository</span>
          )}
        </div>
        <button
          onClick={closeComments}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
          title="Close (Esc)"
        >
          <XIcon size="md" />
        </button>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3 border-b border-border-muted">
        <SegmentedToggle<StatusFilter>
          value={filters.status}
          onChange={(status) => useFilters.setState({ status })}
          options={[
            { value: 'open', label: isLoading ? 'Open' : `Open ${counts.open}` },
            { value: 'resolved', label: isLoading ? 'Resolved' : `Resolved ${counts.resolved}` },
            { value: 'all', label: isLoading ? 'All' : `All ${counts.all}` },
          ]}
        />
        <div className="ml-auto">
          <SegmentedToggle<AuthorFilter>
            value={author}
            onChange={(next) => useFilters.setState({ author: next })}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'user', label: 'You' },
              ...(hasReviewers ? [{ value: 'github' as const, label: 'Reviewers' }] : []),
              { value: 'agent', label: 'Agents' },
            ]}
          />
        </div>
      </div>
      <div className={cn('flex-1 overflow-y-auto py-2', reveal)}>
        {isLoading && (
          <div className="flex flex-col gap-2 px-3 pt-9">
            <ThreadRowSkeleton />
            <ThreadRowSkeleton />
            <ThreadRowSkeleton />
          </div>
        )}
        {error && <div className="px-4 py-6 text-xs text-deleted">Could not load comments: {String((error as { message?: string }).message ?? error)}</div>}
        {!isLoading && !error && groups.length === 0 && (
          <div className="px-6 py-10 text-center text-xs text-text-muted leading-relaxed">{emptyMessage(filters, threads.length, !!scopeRef)}</div>
        )}
        {groups.map((group) => {
          const expanded = isGroupOpen(group);
          return (
            <section key={group.key} className="mb-2">
              <div className="sticky top-0 z-10 flex items-center gap-2 pl-2 pr-4 h-9 bg-sidebar">
                <button
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expanded}
                  className="flex items-center gap-2 min-w-0 flex-1 h-7 px-2 rounded-md hover:bg-hover cursor-pointer text-left"
                  title={expanded ? 'Collapse' : 'Expand'}
                >
                  <ChevronIcon expanded={expanded} />
                  <ViewIcon viewRef={group.ref} />
                  <span className="text-xs font-medium text-text truncate" title={group.ref}>{group.label}</span>
                  {isCurrentGroup(group, currentRef) && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-fill text-text-secondary shrink-0">This view</span>
                  )}
                  <span className="text-xs text-text-muted shrink-0 tabular-nums">{group.count}</span>
                </button>
                {group.ref !== currentRef && !group.otherBranch && !group.unassigned && (
                  <button
                    onClick={() => openView(group.ref)}
                    className="h-6 px-2 -mr-1 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer shrink-0"
                  >
                    {group.ref === TREE_REF ? 'Open in Files' : 'Open diff'}
                  </button>
                )}
              </div>
              {expanded && group.files.map((file) => (
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
          );
        })}
      </div>
      <div className="px-4 h-9 flex items-center gap-1 border-t border-border-muted text-xs text-text-muted">
        Press <kbd className="px-1 py-0.5 bg-raised border border-control-border rounded font-sans text-[11px]">C</kbd> to toggle this panel
        {visible.length > 0 && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto -mr-2 inline-flex items-center gap-1 h-6 px-2 rounded-md text-text-muted hover:text-deleted hover:bg-hover cursor-pointer"
            title="Delete the comments shown above"
          >
            <TrashIcon size="xs" />
            Delete all
          </button>
        )}
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${visible.length} comment${visible.length === 1 ? '' : 's'}`}
          message={deleteMessage(filters, visible.length, !!scopeRef)}
          confirmLabel="Delete"
          onConfirm={() => void deleteVisible()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
