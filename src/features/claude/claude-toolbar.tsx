import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { TREE_REF } from '../../lib/types';
import { runLabel, runViewLabel, stopClaude, useActiveRun, useCanEditRef, useQueuedCount } from './claude-runner';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { useRepoPath } from '../../hooks/use-repo';
import { buttonClaude, buttonOutline } from '../../components/ui/button-styles';
import { AskClaudePanel, useAskClaudeRequest, type Task } from './ask-claude-review';
import { SendCommentsPanel, useSendCandidates, useSendRequest } from './send-comments';
import { SegmentedToggle } from '../../components/ui/segmented-toggle';
import { plural } from '../review/review-candidates';
import { useOwnPr } from '../../hooks/use-repo-state';
import type { CommentThread } from '../../components/comments/types';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';
import { useReviewState } from '../review/review-state';
import { ChevronDownIcon, CopyIcon, PlusIcon, SparkleIcon, StopIcon } from '../../components/ui/icon';
import { Popover } from '../../components/ui/popover';
import { Spinner } from '../../components/icons/spinner';
import { useRunPick } from './model-setting';
import { ActivityPeek, formatElapsed, useNow } from './activity-panel';
import { toggleActivity, useRunActivity } from './run-activity';
import { agentMeta } from './agents';
import { showApprovals, useWaitingApprovals } from './claude-approval-modal';

interface ClaudeToolbarProps {
  diffRef: string | null;
  sessionId: string | null;
  hasChanges?: boolean;
  focusedFile?: string | null;
  threads?: CommentThread[];
  formatForCopy?: () => string;
}

interface QueueButton {
  open: boolean;
  onToggle: () => void;
  anchorRef: RefObject<HTMLButtonElement | null>;
}

/** While a run goes: what it does, Stop, a way back to an approval put aside, and (with `queue`) a menu to queue more. */
export function ClaudeStatus(props: { queue?: QueueButton }) {
  const { queue } = props;
  const repoPath = useRepoPath();
  const waiting = useWaitingApprovals(repoPath);
  const run = useActiveRun(repoPath);
  const queued = useQueuedCount(repoPath);
  const now = useNow(run !== null);
  const currentRef = useCurrentViewRef();
  const activityOpen = useRunActivity((state) => state.open);
  const pillRef = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
  }, []);

  if (!run) {
    return null;
  }

  const hover = (open: boolean) => {
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setPeek(open && !useRunActivity.getState().open), open ? 300 : 150);
  };
  const name = run.agentId ? agentMeta(run.agentId).short : 'Agent';
  const elsewhere = !!run.ref && run.ref !== currentRef;
  const where = run.ref ? runViewLabel(run.context.repoPath, run.ref) : null;

  return (
    <div ref={pillRef} className="flex items-stretch h-7 rounded-md border border-control-border bg-raised overflow-hidden text-xs min-w-0">
      <button
        onClick={() => {
          setPeek(false);
          toggleActivity();
        }}
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
        aria-pressed={activityOpen}
        className={cn(
          'flex items-center gap-2 pl-2.5 pr-2 whitespace-nowrap min-w-0 overflow-hidden transition-colors cursor-pointer',
          activityOpen ? 'bg-claude/12 text-claude' : 'text-text hover:bg-control-hover',
        )}
        title={where && elsewhere ? `Working on ${where} · click to see what ${name} is doing` : `See what ${name} is doing`}
      >
        <Spinner className="text-claude" />
        <span className="font-medium truncate @max-4xl/titlebar:hidden">{runLabel(run.action, name)}</span>
        {elsewhere && where && (
          <span className="text-text-secondary truncate max-w-[180px] @max-4xl/titlebar:hidden">on {where}</span>
        )}
        {run.startedAt && <span className="text-text-muted tabular-nums">{formatElapsed(now - run.startedAt)}</span>}
        {queued > 0 && <span className="text-text-muted @max-3xl/titlebar:hidden">+{queued} queued</span>}
      </button>
      {waiting > 0 && (
        <button
          onClick={() => showApprovals(repoPath)}
          className="flex items-center gap-1.5 px-2 shrink-0 border-l border-control-border bg-claude/12 text-claude font-medium hover:bg-claude/16 transition-colors cursor-pointer"
          title={`${name} is waiting for your approval`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-claude" />
          Approve
        </button>
      )}
      {queue && (
        <button
          ref={queue.anchorRef}
          onClick={queue.onToggle}
          aria-expanded={queue.open}
          className={cn(
            'flex items-center gap-1 px-2 shrink-0 border-l border-control-border text-text-secondary hover:text-text hover:bg-control-hover transition-colors cursor-pointer',
            queue.open && 'bg-control-hover text-text',
          )}
          title="Queue another job for after this one"
        >
          <PlusIcon size="xs" />
          <span className="@max-3xl/titlebar:hidden">Queue</span>
        </button>
      )}
      <button
        onClick={() => void stopClaude(repoPath)}
        className="flex items-center gap-1 px-2 shrink-0 border-l border-control-border text-text-secondary hover:text-text hover:bg-control-hover transition-colors cursor-pointer"
        title={`Stop ${name}`}
      >
        <StopIcon size="xs" />
        Stop
      </button>
      <Popover open={peek} onClose={() => setPeek(false)} anchorRef={pillRef} align="end" width={340} className="p-0">
        <div onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
          <ActivityPeek onOpen={() => setPeek(false)} />
        </div>
      </Popover>
    </div>
  );
}

type Tab = 'fix' | Task;

const TAB_LABELS: Record<Tab, string> = { fix: 'Fix comments', review: 'Review', change: 'Make changes' };

/** Shown where the agent can't edit: the view isn't the checked-out code. */
function NotCheckedOut(props: { agent: string; onCopy?: () => void; onReview?: () => void }) {
  const { agent, onCopy, onReview } = props;

  return (
    <div className="px-4 py-3.5">
      <p className="text-xs leading-5 text-text-secondary">
        <span className="font-medium text-text">{agent} can only edit your current code.</span> These changes aren’t checked out, so {agent} can review them but not change them.
      </p>
      {(onCopy || onReview) && (
        <div className="flex gap-1.5 mt-2.5">
          {onCopy && <button type="button" onClick={onCopy} className={cn(buttonOutline, 'h-6 px-2 text-xs')}><CopyIcon size="xs" />Copy comments</button>}
          {onReview && <button type="button" onClick={onReview} className={cn(buttonOutline, 'h-6 px-2 text-xs')}>Review instead</button>}
        </div>
      )}
    </div>
  );
}

function NoComments(props: { agent: string; onReview?: () => void }) {
  const { agent, onReview } = props;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <p className="min-w-0 flex-1 text-xs text-text-secondary">
        <span className="text-text">No comments to fix.</span> Add one on a line{onReview ? ', or' : '.'}
      </p>
      {onReview && (
        <button type="button" onClick={onReview} className={cn(buttonOutline, 'shrink-0 h-6 px-2 text-xs')}>Review with {agent}</button>
      )}
    </div>
  );
}

/** One button for everything an agent can do here: fix open comments, review, or make a change. */
export function ClaudeToolbar(props: ClaudeToolbarProps) {
  const { diffRef, sessionId, hasChanges = true, focusedFile, threads = [], formatForCopy } = props;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('review');
  const anchorRef = useRef<HTMLButtonElement>(null);
  const queueRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const repoPath = useRepoPath();
  const run = useActiveRun(repoPath);
  const { enabled: commentsEnabled, prMode } = useReviewState();
  const ownPr = useOwnPr();
  const candidates = useSendCandidates(threads, ownPr);
  const editable = useCanEditRef(repoPath, diffRef);
  const requested = useAskClaudeRequest((state) => state.ref);
  const sendRequest = useSendRequest((state) => state.open);
  const seenSendRequest = useRef(sendRequest);

  const reviewRef = diffRef && diffRef !== TREE_REF && hasChanges ? diffRef : null;
  const count = commentsEnabled ? candidates.count : 0;
  const tabs: Tab[] = [...(commentsEnabled ? ['fix' as const] : []), ...(reviewRef ? ['review' as const, 'change' as const] : [])];
  const defaultTab: Tab = count > 0 || !reviewRef ? 'fix' : 'review';
  const agent = agentMeta(useRunPick(defaultTab === 'fix' ? 'fix' : 'review', repoPath).agent);

  const openAt = useCallback((next: Tab) => {
    setTab(next);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!requested || requested !== reviewRef) {
      return;
    }
    useAskClaudeRequest.setState({ ref: null });
    openAt('review');
  }, [requested, reviewRef, openAt]);

  useEffect(() => {
    if (sendRequest === seenSendRequest.current) {
      return;
    }
    seenSendRequest.current = sendRequest;
    if (!commentsEnabled) {
      return;
    }
    openAt('fix');
  }, [sendRequest, commentsEnabled, openAt]);

  const usable = tabs.length > 0 && (!!reviewRef || count > 0);
  if (!usable) {
    return run ? <ClaudeStatus /> : null;
  }

  const copyComments = formatForCopy && count > 0
    ? () => {
      const text = formatForCopy();
      if (!text) {
        toast.info('No open comments to copy');
        return;
      }
      void navigator.clipboard.writeText(text).then(() => toast.success('Copied open comments'));
    }
    : undefined;
  const toReview = reviewRef ? () => setTab('review') : undefined;

  const body = () => {
    if (tab === 'fix') {
      if (!editable) {
        return <NotCheckedOut agent={agent.short} onCopy={copyComments} onReview={toReview} />;
      }
      if (count === 0) {
        return <NoComments agent={agent.short} onReview={toReview} />;
      }
      return <SendCommentsPanel candidates={candidates} diffRef={diffRef} onClose={close} />;
    }
    if (!reviewRef) {
      return null;
    }
    if (tab === 'change' && !editable) {
      return <NotCheckedOut agent={agent.short} onReview={toReview} />;
    }
    return <AskClaudePanel diffRef={reviewRef} sessionId={sessionId} focusedFile={focusedFile} task={tab} onTaskChange={setTab} onClose={close} />;
  };

  const title = count > 0
    ? `${plural(count, 'open comment')} ${agent.short} can work on. Or ask ${agent.short} to review or make a change.`
    : prMode
      ? `${agent.short} reviews this pull request and leaves its comments in Diffity only (marked ${agent.short}). Use “Add to my review” on any you want to post to GitHub.`
      : `Ask ${agent.short} to review these changes or to make a change for you.`;

  const popover = (
    <Popover open={open} onClose={close} anchorRef={run ? queueRef : anchorRef} align="end" width={420} className="p-0 overflow-visible">
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <SparkleIcon size="md" className="text-claude" />
        <h3 className="text-[13px] font-semibold text-text">{run ? 'Queue' : agent.short}</h3>
        <span className="flex-1" />
        {tabs.length > 1 && (
          <SegmentedToggle<Tab>
            value={tab}
            onChange={setTab}
            options={tabs.map((value) => ({ value, label: TAB_LABELS[value] }))}
          />
        )}
      </div>
      {run && (
        <p className="px-4 pt-1.5 text-xs text-text-secondary">
          {runLabel(run.action, run.agentId ? agentMeta(run.agentId).short : 'The agent')}. This starts when it finishes.
        </p>
      )}
      {body()}
    </Popover>
  );

  if (run) {
    return (
      <>
        <ClaudeStatus queue={{ open, onToggle: () => (open ? close() : openAt(defaultTab)), anchorRef: queueRef }} />
        {popover}
      </>
    );
  }

  return (
    <>
      <button
        ref={anchorRef}
        onClick={() => (open ? close() : openAt(defaultTab))}
        className={cn(buttonClaude, 'px-2.5', open && 'bg-claude/16')}
        title={title}
        aria-expanded={open}
      >
        <SparkleIcon size="md" />
        <span className="@max-3xl/titlebar:hidden">{agent.short}</span>
        {count > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-claude text-white text-[11px] font-semibold leading-[18px] text-center tabular-nums">{count}</span>
        )}
        <ChevronDownIcon size="xs" className="opacity-70 @max-3xl/titlebar:hidden" />
      </button>
      {popover}
    </>
  );
}
