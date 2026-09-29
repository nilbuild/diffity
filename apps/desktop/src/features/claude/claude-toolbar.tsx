import { useCallback, useEffect, useRef, useState } from 'react';
import { SparkleIcon } from '../../components/icons/sparkle-icon';
import { StopIcon } from '../../components/icons/stop-icon';
import { ChevronDownIcon } from '../../components/icons/chevron-down-icon';
import { CommentIcon } from '../../components/icons/comment-icon';
import { menuItemClass } from '../../components/layout/options-menu';
import { useDismiss } from '../../hooks/use-dismiss';
import { getRepoPath } from '../../lib/api';
import { TREE_REF } from '../../lib/types';
import type { CommentThread } from '../../components/comments/types';
import { enqueueClaude, openRunResult, runLabel, runViewLabel, stopClaude, useActiveRun, useQueuedCount } from './claude-runner';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { buttonGroup, buttonGroupItem, sectionLabel } from '../../components/ui/button-styles';
import { useReviewState } from '../review/review-state';

export const REVIEW_FOCUSES = [
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'naming', label: 'Naming' },
  { value: 'errors', label: 'Error handling' },
  { value: 'types', label: 'Types' },
  { value: 'logic', label: 'Logic' },
] as const;

interface ClaudeToolbarProps {
  diffRef: string | null;
  sessionId: string | null;
  threads: CommentThread[];
  hasChanges?: boolean;
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function ClaudeStatus() {
  const run = useActiveRun();
  const queued = useQueuedCount();
  const now = useNow(run !== null);
  const currentRef = useCurrentViewRef();

  if (!run) {
    return null;
  }

  const elsewhere = !!run.ref && run.ref !== currentRef;
  const where = run.ref ? runViewLabel(run.context.repoPath, run.ref) : null;
  const showCount = run.action.kind === 'review' || run.commentsAdded > 0;
  const countLabel = `${run.commentsAdded} comment${run.commentsAdded === 1 ? '' : 's'}`;
  const canOpen = !!run.ref && (run.commentsAdded > 0 || elsewhere);

  return (
    <div className="flex items-stretch h-7 bg-accent/10 rounded-md overflow-hidden text-xs min-w-0">
      <span
        className="flex items-center gap-1.5 px-2 text-accent font-medium whitespace-nowrap min-w-0"
        title={where ? `Working on ${where}` : undefined}
      >
        <span className="inline-block w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin shrink-0" />
        {runLabel(run.action)}
        {elsewhere && where && (
          <span className="font-normal truncate max-w-[180px]">on {where}</span>
        )}
        {showCount && (
          canOpen ? (
            <button
              onClick={() => openRunResult(run)}
              className="font-medium underline decoration-dotted underline-offset-2 hover:decoration-solid cursor-pointer"
              title={where ? `Show Claude's comments on ${where}` : "Show Claude's comments"}
            >
              · {countLabel}
            </button>
          ) : (
            <span>· {countLabel}</span>
          )
        )}
        {run.startedAt && <span>· {formatElapsed(now - run.startedAt)}</span>}
        {queued > 0 && <span className="text-text-muted font-normal">+{queued} queued</span>}
      </span>
      <button
        onClick={() => void stopClaude()}
        className="flex items-center gap-1 px-2 text-accent hover:bg-accent/15 transition-colors cursor-pointer"
        title="Stop Claude"
      >
        <StopIcon className="w-3 h-3" />
        Stop
      </button>
    </div>
  );
}

export function ClaudeToolbar(props: ClaudeToolbarProps) {
  const { diffRef, sessionId, threads, hasChanges = true } = props;
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(menuRef, open, close);
  const run = useActiveRun();
  const { prMode } = useReviewState();

  const openThreads = threads.filter((thread) => thread.status === 'open' && !thread.pending);
  const reviewRef = diffRef && diffRef !== TREE_REF && hasChanges ? diffRef : null;

  const review = (focus?: string) => {
    if (!reviewRef) {
      return;
    }
    close();
    enqueueClaude({ kind: 'review', ref: reviewRef, focus }, { repoPath: getRepoPath(), sessionId });
  };

  const resolveAll = () => {
    close();
    enqueueClaude({ kind: 'resolve' }, { repoPath: getRepoPath(), sessionId });
  };

  if (run) {
    return <ClaudeStatus />;
  }
  if (!reviewRef && !prMode) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <div className={buttonGroup}>
        {reviewRef ? (
          <button
            onClick={() => review()}
            className={buttonGroupItem}
            title="Ask Claude Code to review these changes"
          >
            <SparkleIcon className="w-3.5 h-3.5 text-accent" />
            Review<span className="hidden min-[1360px]:inline -ml-[3px]">with Claude</span>
          </button>
        ) : (
          <button
            onClick={resolveAll}
            disabled={openThreads.length === 0}
            className={buttonGroupItem}
          >
            <SparkleIcon className="w-3.5 h-3.5 text-accent" />
            Resolve with Claude
          </button>
        )}
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center px-1.5 border-l border-control-border text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer"
          title="More Claude actions"
        >
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-60 p-1 bg-overlay rounded-lg ring-1 ring-overlay-border z-50">
          {reviewRef && (
            <>
              <div className={sectionLabel}>Review with a focus</div>
              {REVIEW_FOCUSES.map((focus) => (
                <button key={focus.value} className={menuItemClass} onClick={() => review(focus.value)}>
                  <SparkleIcon className="w-3.5 h-3.5" />
                  {focus.label}
                </button>
              ))}
              {prMode && <div className="border-t border-overlay-border my-1 -mx-1" />}
            </>
          )}
          {prMode && (
            <button
              className={`${menuItemClass} disabled:opacity-50 disabled:cursor-default`}
              disabled={openThreads.length === 0}
              onClick={resolveAll}
            >
              <CommentIcon className="w-3.5 h-3.5" />
              Resolve open comments
              <span className="ml-auto text-text-muted">{openThreads.length}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
