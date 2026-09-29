import { useCallback, useEffect, useRef, useState } from 'react';
import { getRepoPath } from '../../lib/api';
import { TREE_REF } from '../../lib/types';
import type { CommentThread } from '../../components/comments/types';
import { enqueueClaude, openRunResult, runLabel, runViewLabel, stopClaude, useActiveRun, useQueuedCount } from './claude-runner';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { buttonClaude } from '../../components/ui/button-styles';
import { AskClaudePopover, useAskClaudeRequest } from './ask-claude-review';
import { cn } from '../../lib/cn';
import { useReviewState } from '../review/review-state';
import { SparkleIcon, StopIcon } from '../../components/ui/icon';

interface ClaudeToolbarProps {
  diffRef: string | null;
  sessionId: string | null;
  threads: CommentThread[];
  hasChanges?: boolean;
  focusedFile?: string | null;
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
  const showCount = run.commentsAdded > 0;
  const countLabel = `${run.commentsAdded} comment${run.commentsAdded === 1 ? '' : 's'}`;
  const canOpen = !!run.ref && (run.commentsAdded > 0 || elsewhere);

  return (
    <div className="flex items-stretch h-7 rounded-md border border-control-border bg-raised overflow-hidden text-xs min-w-0">
      <span
        className="flex items-center gap-2 pl-2.5 pr-2 text-text whitespace-nowrap min-w-0"
        title={where ? `Working on ${where}` : undefined}
      >
        <span className="inline-block w-3 h-3 border-[1.5px] border-claude/25 border-t-claude rounded-full animate-spin shrink-0" />
        <span className="font-medium">{runLabel(run.action)}</span>
        {elsewhere && where && (
          <span className="text-text-secondary truncate max-w-[180px]">on {where}</span>
        )}
        {showCount && (
          canOpen ? (
            <button
              onClick={() => openRunResult(run)}
              className="text-text-secondary underline decoration-text-muted/50 underline-offset-2 hover:text-text cursor-pointer"
              title={where ? `Show Claude's comments on ${where}` : "Show Claude's comments"}
            >
              {countLabel}
            </button>
          ) : (
            <span className="text-text-secondary">{countLabel}</span>
          )
        )}
        {run.startedAt && <span className="text-text-muted tabular-nums">{formatElapsed(now - run.startedAt)}</span>}
        {queued > 0 && <span className="text-text-muted">+{queued} queued</span>}
      </span>
      <button
        onClick={() => void stopClaude()}
        className="flex items-center gap-1 px-2 border-l border-control-border text-text-secondary hover:text-text hover:bg-control-hover transition-colors cursor-pointer"
        title="Stop Claude"
      >
        <StopIcon size="xs" />
        Stop
      </button>
    </div>
  );
}

export function ClaudeToolbar(props: ClaudeToolbarProps) {
  const { diffRef, sessionId, threads, hasChanges = true, focusedFile } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const run = useActiveRun();
  const { prMode } = useReviewState();
  const requested = useAskClaudeRequest((state) => state.ref);

  const openThreads = threads.filter((thread) => thread.status === 'open' && !thread.pending);
  const reviewRef = diffRef && diffRef !== TREE_REF && hasChanges ? diffRef : null;

  useEffect(() => {
    if (!requested || requested !== reviewRef) {
      return;
    }
    useAskClaudeRequest.setState({ ref: null });
    setOpen(true);
  }, [requested, reviewRef]);

  const resolveAll = () => {
    enqueueClaude({ kind: 'resolve' }, { repoPath: getRepoPath(), sessionId });
  };

  if (run) {
    return <ClaudeStatus />;
  }
  if (!reviewRef && !prMode) {
    return null;
  }
  if (!reviewRef) {
    return (
      <button
        onClick={resolveAll}
        disabled={openThreads.length === 0}
        className={buttonClaude}
        title={openThreads.length === 0 ? 'No open comments to resolve' : 'Claude works through the open comments and asks before each edit'}
      >
        <SparkleIcon size="md" />
        Resolve with Claude
      </button>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => setOpen(!open)}
        className={cn(buttonClaude, open && 'bg-claude/16')}
        title={prMode ? 'Claude reviews this pull request and leaves its comments in Diffity only (marked Claude). Use “Add to my review” on any you want to post to GitHub.' : 'Claude reviews these changes and leaves comments on the diff. Tell it what to focus on first.'}
        aria-expanded={open}
      >
        <SparkleIcon size="md" />
        Ask Claude<span className="hidden min-[1360px]:inline -ml-[3px]">to review</span>
      </button>
      <AskClaudePopover open={open} onClose={close} anchorRef={anchorRef} diffRef={reviewRef} sessionId={sessionId} focusedFile={focusedFile} />
    </>
  );
}
