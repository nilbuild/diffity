import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { create } from 'zustand';
import { useRepoNav, useRepoPath } from '../../hooks/use-repo';
import { inView, useRepoThreads } from '../../hooks/use-repo-threads';
import { closeComments, openComments, useUi } from '../../lib/ui-store';
import { threadPath } from '../../lib/thread-location';
import { groupThreads, isCurrentGroup, type ViewGroup } from '../../lib/repo-thread-groups';
import { TREE_REF, type RepoThread } from '../../lib/types';
import { cn } from '../../lib/cn';
import { SeverityChip, ThreadBadge } from '../../components/ui/thread-badge';
import { SegmentedToggle } from '../../components/ui/segmented-toggle';
import { formatRelativeTime } from '../../components/comments/comment-bubble';
import { GENERAL_THREAD_FILE_PATH } from '../../components/comments/types';
import { threadLocation } from '../../lib/comment-navigation';
import { InlineMarkdown } from '../../components/comments/inline-markdown';
import { AddressedBadge } from '../../components/comments/addressed-badge';
import { CheckIcon, ChevronIcon, CommentIcon, EllipsisIcon, FileIcon, GitCommitIcon, GitCompareIcon, PencilIcon, SparkleIcon, TrashIcon, UndoIcon, XIcon } from '../../components/ui/icon';
import { MenuItem, Popover, useMenu } from '../../components/ui/popover';
import { setCurrentThread, useCurrentThread } from '../../lib/current-thread';
import { switchBranch } from '../pr/pr-checkout';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteThread, errorMessage, keepThreadOnBranch } from '../../lib/api';
import type { ThreadSnapshot } from '../../lib/types';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { Skeleton, useRevealClass } from '../../components/ui/skeleton';
import { changeThreadStatus, deletedToast, deleteThreadWithUndo } from '../../hooks/use-comment-actions';
import { enqueueClaude, useThreadActivity, useThreadRunLabel } from '../claude/claude-runner';
import { agentByName, agentMeta } from '../claude/agents';
import { useRunPick } from '../claude/model-setting';
import { useReviewThreads } from '../../hooks/use-review-threads';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { plural } from '../review/review-candidates';
import { SidePanel } from '../../components/layout/side-panel';

type StatusFilter = 'open' | 'resolved' | 'all';
type AuthorFilter = 'all' | 'user' | 'github' | 'agent';

interface PanelFilters {
  status: StatusFilter;
  author: AuthorFilter;
  /** Comments from other views and branches, kept out of the way until asked for. */
  others: boolean;
}

const useFilters = create<PanelFilters>(() => ({ status: 'open', author: 'all', others: false }));

/** Opens the panel on one open thread (one the diff can't show): outlined, scrolled to, and not hidden by a filter. */
export function openCommentsAt(threadId: string) {
  useFilters.setState((filters) => ({ status: filters.status === 'resolved' ? 'open' : filters.status, author: 'all' }));
  setCurrentThread(threadId);
  openComments();
}

const AUTHOR_LABELS: Record<AuthorFilter, string> = { all: 'Everyone', user: 'You', github: 'Reviewers', agent: 'Agents' };

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
  const line = threadLocation(thread);
  const note = thread.otherBranch ? 'On another branch' : anchorNote(thread);
  const outdated = !thread.unassigned && !thread.otherBranch && thread.anchor !== 'current' && thread.anchor !== 'unknown';
  // Its code is in its view: open it there. Otherwise (outdated, another branch) read it here.
  const inPlace = thread.anchor === 'current' && !thread.unassigned && !thread.otherBranch;
  const openable = inPlace || thread.unassigned || outdated || !!thread.otherBranch;
  const current = useCurrentThread((state) => state.id === thread.id);
  const [expanded, setExpanded] = useState(false);
  const isAgent = thread.authorType === 'agent';
  const isOpen = thread.status === 'open';
  const activity = useThreadActivity(thread.id);
  const repoPath = useRepoPath();
  const fixPick = useRunPick('fix', repoPath);
  const repoAgent = agentMeta(fixPick.agent);
  const runLabel = useThreadRunLabel(thread.id);
  const canAskClaude = isOpen && !thread.unassigned && !thread.otherBranch && !thread.pending && thread.anchor !== 'unknown' && activity === 'idle';
  const open = () => {
    if (inPlace) {
      onOpen(thread);
      return;
    }
    setExpanded(!expanded);
  };
  const addressedBy = isOpen && thread.addressedBy ? agentByName(thread.addressedBy)?.short ?? thread.addressedBy : null;
  const [keeping, setKeeping] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current) {
      rowRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [current]);

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
      ref={rowRef}
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
        'group relative flex gap-2.5 px-3 py-2.5 rounded-lg bg-bg border transition-colors outline-none focus-visible:border-focus',
        current ? 'border-claude/60' : 'border-border',
        openable ? 'hover:border-control-border hover:bg-bg-secondary cursor-pointer' : 'cursor-default',
      )}
      title={openable ? (inPlace ? 'Open this comment' : expanded ? 'Hide the conversation' : 'Show the whole conversation') : undefined}
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
        <div className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0">
          {line && <span className="font-mono text-[11px] text-text-secondary shrink-0">{line}</span>}
          {thread.severity && <SeverityChip severity={thread.severity} />}
          <span className="text-xs text-text-secondary shrink-0">{thread.authorName}</span>
          {thread.pending && <ThreadBadge variant="pending" />}
          {addressedBy && <AddressedBadge agent={addressedBy} />}
          {thread.status !== 'open' && <ThreadBadge variant={thread.status} />}
          {outdated && <ThreadBadge variant="outdated" />}
          <span className="ml-auto text-xs text-text-muted shrink-0 group-hover:invisible group-focus-within:invisible">{formatRelativeTime(thread.updatedAt)}</span>
        </div>
        {/* Takes the timestamp's place on hover, icon-only so it never covers the badges or the author. */}
        <div className="absolute top-2 right-2 z-10 hidden group-hover:flex group-focus-within:flex items-center gap-0.5 p-0.5 rounded-md border border-control-border bg-raised">
          {canAskClaude && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                enqueueClaude({ kind: 'thread', threadId: thread.id }, { repoPath, sessionId: thread.sessionId, ref: thread.ref, pick: fixPick });
              }}
              className="inline-flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
              title={`Send to ${repoAgent.short}: it answers this comment or makes the change it asks for`}
              aria-label={`Send to ${repoAgent.short}`}
            >
              <SparkleIcon className="w-3 h-3 text-claude" />
            </button>
          )}
          <button
            onClick={(event) => {
              event.stopPropagation();
              toggleStatus();
            }}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
            title={isOpen ? 'Resolve' : 'Reopen'}
            aria-label={isOpen ? 'Resolve' : 'Reopen'}
          >
            {isOpen ? <CheckIcon size="xs" /> : <UndoIcon size="xs" />}
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              void deleteThreadWithUndo(thread.id);
            }}
            className="inline-flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-deleted hover:bg-hover cursor-pointer"
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
            {runLabel}
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

function deleteMessage(filters: PanelFilters, count: number): string {
  const status = filters.status === 'open' ? 'open ' : filters.status === 'resolved' ? 'resolved ' : '';
  const author = { all: '', user: ' from you', github: ' from reviewers', agent: ' from agents' }[filters.author];
  const noun = count === 1 ? 'comment' : 'comments';
  return `Delete ${count === 1 ? 'the' : `all ${count}`} ${status}${noun}${author}, across every view in this project? You can undo it right after.`;
}

function emptyMessage(status: StatusFilter, total: number): string {
  if (total === 0) {
    return 'No comments in this project yet. Comments you, an agent or a reviewer leave in any view show up here.';
  }
  if (status === 'open') {
    return 'No open comments. Everything has been resolved.';
  }
  if (status === 'resolved') {
    return 'No resolved comments.';
  }
  return 'No comments match this filter.';
}

/** Docked beside the page like the chat (one of the two at a time): every comment in the project, by view. */
export function CommentsPanel() {
  const open = useUi((state) => state.commentsOpen);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    // Esc closes it only from inside, so Esc in the diff (closing an editor) leaves it open.
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panelRef.current?.contains(document.activeElement)) {
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
    <SidePanel ref={panelRef} label="Comments panel" className="bg-sidebar">
      <CommentsPanelBody />
    </SidePanel>
  );
}

function CommentsPanelBody() {
  const repoPath = useRepoPath();
  const nav = useRepoNav();
  const navigate = useNavigate();
  const currentRef = useCurrentViewRef();
  const { data, isLoading, error } = useRepoThreads();
  const filters = useFilters();
  const all = useMemo(() => data ?? [], [data]);
  const threads = useMemo(() => (filters.others ? all : all.filter((thread) => inView(thread, currentRef))), [all, filters.others, currentRef]);
  const hasReviewers = all.some((thread) => thread.authorType === 'github');
  const author: AuthorFilter = filters.author === 'github' && !hasReviewers ? 'all' : filters.author;
  const reveal = useRevealClass(isLoading);
  const filterMenu = useMenu();
  const moreMenu = useMenu();

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
  const here = useMemo(() => groupThreads(visible.filter((thread) => inView(thread, currentRef)), currentRef), [visible, currentRef]);
  const elsewhere = useMemo(() => groupThreads(visible.filter((thread) => !inView(thread, currentRef)), currentRef), [visible, currentRef]);
  const hidden = useMemo(
    () => all.filter((thread) => !inView(thread, currentRef) && matchesStatus(thread, filters.status) && matchesAuthor(thread, author)),
    [all, currentRef, filters.status, author],
  );
  const hiddenViews = useMemo(() => groupThreads(hidden, currentRef).length, [hidden, currentRef]);
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

  // The panel stays open: the comment opens beside it and is outlined in the list.
  const openThread = (thread: RepoThread) => {
    setCurrentThread(thread.id);
    navigate(threadPath(repoPath, { ref: thread.ref, threadId: thread.id }));
  };

  const openCommit = (thread: RepoThread) => {
    if (!thread.movedTo) {
      return;
    }
    const params = new URLSearchParams({ ref: thread.movedTo.ref, file: thread.filePath });
    navigate(`/r/${encodeURIComponent(repoPath)}/diff?${params.toString()}`);
  };

  const [groupState, setGroupState] = useState(readGroupState);
  // This view (or, away from any view, the first group) starts open; the rest start folded.
  const isGroupOpen = (group: ViewGroup, index: number) => {
    const stored = groupState[`${repoPath}\n${group.key}`];
    if (stored !== undefined) {
      return stored;
    }
    return !currentRef ? index === 0 : isCurrentGroup(group, currentRef) || here.includes(group);
  };
  const toggleGroup = (group: ViewGroup, index: number) => {
    const next = { ...groupState, [`${repoPath}\n${group.key}`]: !isGroupOpen(group, index) };
    setGroupState(next);
    writeGroupState(next);
  };

  // The thread stepped to with ] (one the diff can't show) unfolds its group so it can be seen.
  const currentThreadId = useCurrentThread((state) => state.id);
  const currentGroupKey = [...here, ...elsewhere].find((group) => group.files.some((file) => file.threads.some((thread) => thread.id === currentThreadId)))?.key ?? null;
  useEffect(() => {
    if (!currentGroupKey) {
      return;
    }
    setGroupState((state) => {
      const key = `${repoPath}\n${currentGroupKey}`;
      if (state[key] !== false) {
        return state;
      }
      const next = { ...state, [key]: true };
      writeGroupState(next);
      return next;
    });
  }, [currentGroupKey, currentThreadId, repoPath]);

  const groupAction = (group: ViewGroup) => {
    if (group.otherBranch) {
      const branch = group.otherBranch;
      return { label: 'Check out', title: `Switch to ${branch} to see these comments in place`, run: () => void switchBranch(repoPath, branch, nav) };
    }
    if (group.ref === currentRef || group.unassigned) {
      return null;
    }
    return { label: 'Open', title: group.ref === TREE_REF ? 'Open in Files' : 'Open this view', run: () => navigate(threadPath(repoPath, { ref: group.ref })) };
  };

  const renderGroup = (group: ViewGroup, index: number) => {
          const expanded = isGroupOpen(group, index);
          const action = groupAction(group);
          return (
            <section key={group.key} className="mb-2">
              <div className="sticky top-0 z-10 flex items-center gap-2 pl-2 pr-4 h-9 bg-sidebar">
                <button
                  onClick={() => toggleGroup(group, index)}
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
                {action && (
                  <button
                    onClick={action.run}
                    title={action.title}
                    className="h-6 px-2 -mr-1 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer shrink-0"
                  >
                    {action.label}
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
  };

  return (
    <>
      <div className="flex items-center gap-2 h-12 shrink-0 pl-4 pr-2" data-tauri-drag-region>
        <CommentIcon size="md" className="text-text-secondary" />
        <h2 className="text-[14px] font-semibold text-text">Comments</h2>
        <span className="flex-1" data-tauri-drag-region />
        <button
          ref={moreMenu.anchorRef}
          onClick={moreMenu.toggle}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
          aria-label="More"
          title="More"
        >
          <EllipsisIcon size="sm" />
        </button>
        <Popover open={moreMenu.open} onClose={moreMenu.close} anchorRef={moreMenu.anchorRef} align="end" width={240}>
          <MenuItem
            icon={<TrashIcon size="sm" />}
            label={visible.length > 0 ? `Delete ${visible.length === 1 ? 'this comment' : `these ${visible.length} comments`}…` : 'Nothing to delete'}
            disabled={visible.length === 0}
            onSelect={() => {
              moreMenu.close();
              setConfirmDelete(true);
            }}
          />
        </Popover>
        <button
          onClick={closeComments}
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
          aria-label="Close"
          title="Close (C)"
        >
          <XIcon size="sm" />
        </button>
      </div>
      <div className="flex items-center gap-2 shrink-0 pl-4 pr-2 pb-3 border-b border-border-muted">
        <SegmentedToggle<StatusFilter>
          value={filters.status}
          onChange={(status) => useFilters.setState({ status })}
          options={[
            { value: 'open', label: isLoading ? 'Open' : `Open ${counts.open}` },
            { value: 'resolved', label: isLoading ? 'Resolved' : `Resolved ${counts.resolved}` },
            { value: 'all', label: isLoading ? 'All' : `All ${counts.all}` },
          ]}
        />
        <span className="flex-1" />
        <button
          ref={filterMenu.anchorRef}
          onClick={filterMenu.toggle}
          className={cn('relative inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs cursor-pointer hover:bg-hover', author !== 'all' ? 'text-text' : 'text-text-secondary')}
          title="Show comments from…"
        >
          {author === 'all' ? 'Filter' : AUTHOR_LABELS[author]}
          <ChevronIcon expanded />
        </button>
        <Popover open={filterMenu.open} onClose={filterMenu.close} anchorRef={filterMenu.anchorRef} align="end" width={180}>
          {(['all', 'user', ...(hasReviewers ? ['github' as const] : []), 'agent'] as AuthorFilter[]).map((value) => (
            <MenuItem
              key={value}
              label={value === 'all' ? 'Everyone' : `From ${AUTHOR_LABELS[value].toLowerCase()}`}
              checked={author === value}
              onSelect={() => {
                useFilters.setState({ author: value });
                filterMenu.close();
              }}
            />
          ))}
        </Popover>
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
        {!isLoading && !error && here.length === 0 && (
          <div className="px-6 py-10 text-center text-xs text-text-muted leading-relaxed">
            {hidden.length > 0 && currentRef ? `No ${filters.status === 'all' ? '' : `${filters.status} `}comments in this view.` : emptyMessage(filters.status, all.length)}
          </div>
        )}
        {here.map((group, index) => renderGroup(group, index))}
        {currentRef && hidden.length > 0 && (
          <div className="flex items-center gap-2 px-5 py-2 text-xs text-text-muted">
            <span>
              {plural(hidden.length, 'comment')} in {hiddenViews === 1 ? 'another view' : `${hiddenViews} other views`}
            </span>
            <button
              type="button"
              onClick={() => useFilters.setState({ others: !filters.others })}
              className="text-text-secondary hover:text-text underline decoration-text-muted/40 underline-offset-2 cursor-pointer"
            >
              {filters.others ? 'Hide' : 'Show'}
            </button>
          </div>
        )}
        {filters.others && elsewhere.map((group, index) => renderGroup(group, here.length + index))}
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${visible.length} comment${visible.length === 1 ? '' : 's'}`}
          message={deleteMessage(filters, visible.length)}
          confirmLabel="Delete"
          onConfirm={() => void deleteVisible()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </>
  );
}
