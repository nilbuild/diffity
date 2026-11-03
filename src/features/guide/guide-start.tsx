import { useState } from 'react';
import { buttonClaudeSolid } from '../../components/ui/button-styles';
import { BookIcon, SparkleIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { getRepoPath } from '../../lib/api';
import { useUi } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { agentMeta } from '../claude/agents';
import { cancelQueuedRun, stopClaude, useActiveRun } from '../claude/claude-runner';
import { ModelPicker } from '../claude/model-picker';
import { useRunPick, writeRepoPick, type RunPick } from '../claude/model-setting';
import { formatElapsed, useNow } from '../claude/activity-panel';
import { currentFile, openActivity, useRunActivity } from '../claude/run-activity';
import { startGuide, useGuideRun, type GuidePullRequest } from './use-guide';
import { isGuideWorthy } from './guide-model';

interface GuideStartProps {
  diffRef: string;
  sessionId: string | null;
  fileCount: number;
  changedLines: number;
  pr: GuidePullRequest | null;
}

/** Shown in the guide until one exists: one line on what it is, and the button that writes it. */
export function GuideStart(props: GuideStartProps) {
  const { diffRef, sessionId, fileCount, changedLines, pr } = props;
  const repoPath = getRepoPath();
  const fallbackPick = useRunPick('review', repoPath);
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? fallbackPick;
  const agent = agentMeta(pick.agent);
  const run = useGuideRun(repoPath, diffRef);

  const start = () => {
    if (picked) {
      writeRepoPick('review', repoPath, picked);
    }
    startGuide(repoPath, diffRef, sessionId, pick, pr);
  };

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-[14vh] pb-10 overflow-y-auto font-sans">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <span className="flex items-center justify-center w-10 h-10 rounded-full bg-fill text-text-secondary shrink-0">
          <BookIcon size={18} />
        </span>
        <h2 className="mt-3 text-[15px] font-semibold text-text">Read it chapter by chapter</h2>
        <p className="mt-1 text-[13px] text-text-secondary leading-relaxed">
          {isGuideWorthy(fileCount, changedLines)
            ? `${agent.short} groups the ${fileCount} files by idea, explains each part and puts the core change first.`
            : `This change is small, so the diff may be all you need. ${agent.short} can still explain why it was made and what to check.`}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2 min-h-8 max-w-full">
          {run ? <GuideProgress diffRef={diffRef} /> : (
            <>
              <ModelPicker value={pick} onChange={setPicked} align="end" />
              <button onClick={start} className={buttonClaudeSolid}>
                <SparkleIcon size="sm" />
                Write guide
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const linkButton = 'text-text-muted hover:text-text underline decoration-text-muted/40 underline-offset-2 cursor-pointer shrink-0';

/** The guide run for this view, as one quiet line: queued behind another run, or writing. */
export function GuideProgress(props: { diffRef: string; className?: string }) {
  const { diffRef, className } = props;
  const repoPath = getRepoPath();
  const run = useGuideRun(repoPath, diffRef);
  const active = useActiveRun(repoPath);
  const now = useNow(!!run?.startedAt);
  const activity = useRunActivity((state) => state.byRepo[repoPath]);

  if (!run) {
    return null;
  }
  const name = run.agentId ? agentMeta(run.agentId).short : 'The agent';
  const queued = run.state === 'queued';
  const blocker = queued && active?.agentId ? agentMeta(active.agentId).short : null;
  const reading = !queued && activity?.runId === run.id ? currentFile(activity, repoPath) : null;

  return (
    <div className={cn('flex items-center gap-2 min-w-0 text-[13px] text-text-secondary', className)}>
      <Spinner className="text-claude shrink-0" />
      <span className="truncate">
        {queued
          ? `Starts when ${blocker ?? 'the current run'} finishes`
          : reading
            ? <>{name} is reading <span className="font-mono text-xs text-text">{reading.split('/').pop()}</span></>
            : `${name} is reading the change`}
      </span>
      {run.startedAt && <span className="text-text-muted tabular-nums shrink-0">{formatElapsed(now - run.startedAt)}</span>}
      <span className="text-text-muted shrink-0">·</span>
      {!queued && (
        <>
          <button onClick={openActivity} className={linkButton}>Activity</button>
          <span className="text-text-muted shrink-0">·</span>
        </>
      )}
      <button onClick={() => (queued ? cancelQueuedRun(run.id) : void stopClaude(repoPath))} className={linkButton}>
        {queued ? 'Cancel' : 'Stop'}
      </button>
    </div>
  );
}

/** The guide's state in the bar above the code: the run rewriting it, or a quiet "Out of date" with a way to rewrite. */
export function GuideBarStatus(props: { diffRef: string; stale: boolean; onRewrite: (() => void) | null }) {
  const { diffRef, stale, onRewrite } = props;
  const run = useGuideRun(getRepoPath(), diffRef);
  const sidebarCollapsed = useUi((state) => state.sidebarCollapsed);

  // With the sidebar open, its "Rewriting the guide" banner says this already.
  if (run) {
    return sidebarCollapsed ? <GuideProgress diffRef={diffRef} className="text-xs min-w-0" /> : null;
  }
  if (!stale) {
    return null;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs shrink-0" title="The changes moved on after this guide was written, so parts of it may be out of date.">
      <span className="w-1.5 h-1.5 rounded-full bg-modified" />
      <span className="text-text-secondary">Out of date</span>
      {onRewrite && (
        <>
          <span className="text-text-muted">·</span>
          <button onClick={onRewrite} className={linkButton}>Rewrite</button>
        </>
      )}
    </span>
  );
}
