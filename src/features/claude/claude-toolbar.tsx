import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TREE_REF } from '../../lib/types';
import { commentOf, runLabel, runViewLabel, showRun, stopProject, useQueuedCount, useRunningRuns } from './claude-runner';
import { sameView } from './conversation';
import { useCanEditRef } from './edit-target';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { useRepoPath } from '../../hooks/use-repo';
import { buttonClaude, buttonOutline } from '../../components/ui/button-styles';
import { ReviewForm, useAskClaudeRequest } from './review-form';
import { SendCommentsPanel, useSendCandidates, useSendRequest } from './send-comments';
import { plural } from '../review/review-candidates';
import { useOwnPr } from '../../hooks/use-repo-state';
import type { CommentThread } from '../../components/comments/types';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';
import { useReviewState } from '../review/review-state';
import { CopyIcon, SparkleIcon, StopIcon } from '../../components/ui/icon';
import { modKey } from '../../lib/platform';
import { closeClaudeCard, openClaudeCard, publishViewActions, toggleClaudePanel, usePanel } from './panel-store';
import { Popover } from '../../components/ui/popover';
import { Spinner } from '../../components/icons/spinner';
import { useRunPick } from './model-setting';
import { ActivityPeek, RunningList, formatElapsed, useNow } from './run-details';
import { agentMeta } from './agents';
import { useRunActivity } from './run-activity';
import { showApprovals, useWaitingApprovals } from './claude-approval-modal';

interface ClaudeToolbarProps {
  diffRef: string | null;
  sessionId: string | null;
  hasChanges?: boolean;
  focusedFile?: string | null;
  threads?: CommentThread[];
  formatForCopy?: () => string;
}

/**
 * While runs go in the project: what the agent is doing (or how many runs), Stop, and a way back to an approval put
 * aside. Clicking it opens the panel; hovering shows the run, or the list of runs with a way to each.
 */
export function ClaudeStatus() {
  const repoPath = useRepoPath();
  const waiting = useWaitingApprovals(repoPath);
  const runs = useRunningRuns(repoPath);
  const run = runs[0] ?? null;
  const queued = useQueuedCount(repoPath);
  const now = useNow(run !== null);
  const currentRef = useCurrentViewRef();
  const panelOpen = usePanel((state) => state.open);
  const heldBack = useRunActivity((state) => !!run && !!state.byRun[run.id]?.waiting);
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
    timer.current = setTimeout(() => setPeek(open && !usePanel.getState().open), open ? 300 : 150);
  };
  const name = run.agentId ? agentMeta(run.agentId).short : 'Agent';
  const several = runs.length > 1;
  const onComment = !!commentOf(run.action);
  const elsewhere = !several && !!run.ref && !sameView(run.ref, currentRef);
  const where = run.ref ? runViewLabel(run.context.repoPath, run.ref) : null;
  const label = several ? `${name} · ${runs.length} running` : heldBack ? `${name} is waiting for another window` : runLabel(run.action, name, !!run.context.conversation);

  return (
    <div ref={pillRef} className="flex items-stretch h-7 rounded-md border border-control-border bg-raised overflow-hidden text-xs min-w-0">
      <button
        onClick={() => {
          setPeek(false);
          // Outside a view (Home) there's no chat to open here, so go where the run is.
          if (!currentRef || (!several && onComment)) {
            showRun(run);
            return;
          }
          toggleClaudePanel();
        }}
        onMouseEnter={() => hover(true)}
        onMouseLeave={() => hover(false)}
        aria-pressed={panelOpen}
        className={cn(
          'flex items-center gap-2 pl-2.5 pr-2 whitespace-nowrap min-w-0 overflow-hidden transition-colors cursor-pointer',
          panelOpen ? 'bg-claude/12 text-claude' : 'text-text hover:bg-control-hover',
        )}
        title={onComment && !several ? `Go to the comment ${name} is working on` : where && elsewhere ? `Working on ${where} · click to see what ${name} is doing` : `See what ${name} is doing`}
      >
        <Spinner className="text-claude" />
        <span className="font-medium truncate @max-4xl/titlebar:hidden">{label}</span>
        {several && <span className="font-medium tabular-nums @min-4xl/titlebar:hidden">{runs.length}</span>}
        {elsewhere && where && <span className="text-text-secondary truncate max-w-[180px] @max-4xl/titlebar:hidden">on {where}</span>}
        {!several && run.startedAt && <span className="text-text-muted tabular-nums">{formatElapsed(now - run.startedAt)}</span>}
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
      <button
        onClick={() => void stopProject(repoPath)}
        className="flex items-center gap-1 px-2 shrink-0 border-l border-control-border text-text-secondary hover:text-text hover:bg-control-hover transition-colors cursor-pointer"
        title={several ? `Stop every run in this project${queued > 0 ? ' and clear the queue' : ''}` : `Stop ${name}${queued > 0 ? ' and clear the queue' : ''}`}
      >
        <StopIcon size="xs" />
        {several ? 'Stop all' : 'Stop'}
      </button>
      <Popover open={peek} onClose={() => setPeek(false)} anchorRef={pillRef} align="end" width={340} className="p-0">
        <div onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
          {several ? <RunningList repoPath={repoPath} onPick={() => setPeek(false)} /> : <ActivityPeek runId={run.id} onOpen={() => setPeek(false)} />}
        </div>
      </Popover>
    </div>
  );
}

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
        <span className="text-text">No comments to send to {agent}.</span> Add one on a line{onReview ? ', or' : '.'}
      </p>
      {onReview && (
        <button type="button" onClick={onReview} className={cn(buttonOutline, 'shrink-0 h-6 px-2 text-xs')}>Review changes</button>
      )}
    </div>
  );
}

/** The review and fix forms the panel offers render here, inside the page. */
export function ClaudeToolbar(props: ClaudeToolbarProps) {
  const { diffRef, sessionId, hasChanges = true, focusedFile, threads = [], formatForCopy } = props;
  const repoPath = useRepoPath();
  const busy = useRunningRuns(repoPath).length > 0;
  const { enabled: commentsEnabled, prMode } = useReviewState();
  const ownPr = useOwnPr();
  const candidates = useSendCandidates(threads, ownPr);
  const editable = useCanEditRef(repoPath, diffRef);
  const requested = useAskClaudeRequest((state) => state.ref);
  const sendRequest = useSendRequest((state) => state.open);
  const seenSendRequest = useRef(sendRequest);
  const panelOpen = usePanel((state) => state.open);
  const card = usePanel((state) => state.card);
  const slot = usePanel((state) => state.slot);
  const viewRef = useCurrentViewRef();

  const reviewRef = diffRef && diffRef !== TREE_REF && hasChanges ? diffRef : null;
  const count = commentsEnabled ? candidates.count : 0;
  const agent = agentMeta(useRunPick('fix', repoPath).agent);
  const close = closeClaudeCard;

  useEffect(() => {
    publishViewActions({ ref: viewRef, reviewable: !!reviewRef, fixCount: editable ? count : 0 });
  }, [viewRef, reviewRef, editable, count]);

  useEffect(() => () => publishViewActions(null), []);

  useEffect(() => {
    if (!requested || requested !== reviewRef) {
      return;
    }
    useAskClaudeRequest.setState({ ref: null });
    openClaudeCard('review');
  }, [requested, reviewRef]);

  useEffect(() => {
    if (sendRequest === seenSendRequest.current) {
      return;
    }
    seenSendRequest.current = sendRequest;
    if (!commentsEnabled) {
      return;
    }
    openClaudeCard('fix');
  }, [sendRequest, commentsEnabled]);

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
  const toReview = reviewRef ? () => openClaudeCard('review') : undefined;

  const form = () => {
    if (card === 'fix') {
      if (!editable) {
        return <NotCheckedOut agent={agent.short} onCopy={copyComments} onReview={toReview} />;
      }
      if (count === 0) {
        return <NoComments agent={agent.short} onReview={toReview} />;
      }
      return <SendCommentsPanel candidates={candidates} diffRef={diffRef} onClose={close} />;
    }
    if (card === 'review' && reviewRef) {
      return <ReviewForm diffRef={reviewRef} sessionId={sessionId} focusedFile={focusedFile} onClose={close} embedded />;
    }
    return null;
  };
  const cardNode = panelOpen && card && slot ? createPortal(form(), slot) : null;

  const about = diffRef === TREE_REF ? 'this code' : prMode ? 'this pull request' : 'these changes';
  const title = count > 0
    ? `Chat with ${agent.short} about ${about}, or send it ${plural(count, 'open comment')} (${modKey}L)`
    : `Chat with ${agent.short} about ${about} (${modKey}L)`;

  if (busy) {
    return (
      <>
        <ClaudeStatus />
        {cardNode}
      </>
    );
  }

  return (
    <>
      <button
        onClick={toggleClaudePanel}
        className={cn(buttonClaude, 'px-2.5', panelOpen && 'bg-claude/16 border-claude/50')}
        title={title}
        aria-pressed={panelOpen}
      >
        <SparkleIcon size="md" />
        <span className="@max-3xl/titlebar:hidden">Chat</span>
      </button>
      {cardNode}
    </>
  );
}
