import { useState } from 'react';
import { cn } from '../../lib/cn';
import { useViewState } from '../../lib/view-state';
import { useRepoNav, useRepoPath } from '../../hooks/use-repo';
import { useCurrentViewRef } from '../../hooks/use-current-view';
import { buttonClaude, buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { CheckIcon, GitPullRequestIcon, SparkleIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { agentMeta } from '../claude/agents';
import { useRunPick } from '../claude/model-setting';
import { openClaudePanel, usePanel } from '../claude/panel-store';
import { requestSendToClaude } from '../claude/send-comments';
import { plural } from '../review/review-candidates';
import { requestShipMenu } from './ship-menu';
import { approveRound, isBusy, isRoundView, roundFooterCopy, useTaskForPath, useTaskStatus } from './tasks';

/** The end of a task's diff: "Looks good" or "Send N comments" closes the round you just read. */
export function TaskRoundFooter(props: { diffRef: string }) {
  const { diffRef } = props;
  const repoPath = useRepoPath();
  const task = useTaskForPath(repoPath);
  const status = useTaskStatus(task);
  const viewRef = useCurrentViewRef();
  const comments = usePanel((state) => (state.actions && state.actions.ref === viewRef ? state.actions.fixCount : 0));
  const agent = agentMeta(useRunPick('fix', repoPath).agent).short;
  const [saving, setSaving] = useState(false);
  const nav = useRepoNav();
  // Marking a round reviewed moves the task's "since" commit, so the view you approved on stops being a round view:
  // the footer follows you to the task's whole diff, where it says the round is reviewed.
  const [approvedRound, setApprovedRound] = useViewState(`task-round:approved:${task?.id ?? repoPath}`, 0);

  if (!task || task.rounds === 0 || task.mergedAt || isBusy(status) || !(isRoundView(task, diffRef) || approvedRound === task.rounds)) {
    return null;
  }
  const reviewed = task.reviewedRound >= task.rounds;
  const { title, detail } = roundFooterCopy(task, comments, agent);
  const approve = () => {
    setSaving(true);
    setApprovedRound(task.rounds);
    void approveRound(task).finally(() => {
      setSaving(false);
      if (diffRef !== task.baseRef) {
        nav.toDiff(task.baseRef);
      }
    });
  };

  return (
    <section aria-label={`Round ${task.rounds}`} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 rounded-lg border border-border bg-bg-secondary">
      <div className="flex-1 min-w-[240px]">
        <h3 className="flex items-center gap-1.5 text-[13px] font-medium leading-5 text-text">
          {reviewed && <CheckIcon size="sm" className="text-added" />}
          {title}
        </h3>
        <p className="text-xs leading-4 text-text-secondary">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {reviewed ? (
          <button onClick={() => requestShipMenu(task.id)} className={buttonOutline}>
            <GitPullRequestIcon size="sm" className="text-added" />
            {task.prNumber ? `Pull request #${task.prNumber}…` : 'Ship…'}
          </button>
        ) : (
          <>
            {comments === 0 && (
              <button onClick={openClaudePanel} className={buttonGhost} title={`Tell ${agent} what to change instead of commenting on lines`}>
                <SparkleIcon size="sm" className="text-claude" />
                Chat
              </button>
            )}
            {comments > 0 && (
              <button onClick={requestSendToClaude} className={buttonClaude} title={`Comments ${agent} hasn’t replied to yet. Sending them starts round ${task.rounds + 1}.`}>
                <SparkleIcon size="sm" />
                {`Send ${plural(comments, 'comment')} to ${agent}`}
              </button>
            )}
            <button onClick={approve} disabled={saving} className={cn(comments > 0 ? buttonOutline : buttonPrimary)} title={`Mark round ${task.rounds} reviewed`}>
              {saving ? <Spinner className="w-3.5 h-3.5" /> : <CheckIcon size="sm" />}
              Looks good
            </button>
          </>
        )}
      </div>
    </section>
  );
}
