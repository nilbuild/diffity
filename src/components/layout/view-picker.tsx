import { useRepoNav } from '../../hooks/use-repo';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { useRoundViews } from '../../features/tasks/round-bar';
import { ChangesModeSwitch } from './diff-context-bar';
import { RefMenu } from './ref-menu';

/** What the diff shows: the ref picker, plus the quick switch that fits the view (rounds in a task, uncommitted on a branch). */
export function ViewPicker(props: { diffRef: string; branch: string | null }) {
  const { diffRef, branch } = props;
  const nav = useRepoNav();
  const rounds = useRoundViews(diffRef);

  if (rounds) {
    const { task, sinceRef, onSince } = rounds;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <SegmentedToggle
          value={onSince ? 'since' : 'all'}
          onChange={(value) => nav.toDiff(value === 'since' ? sinceRef : task.baseRef)}
          labelClassName="text-xs"
          options={[
            { value: 'since', label: `Since round ${task.reviewedRound}`, title: `Round ${task.rounds}: what changed since you reviewed round ${task.reviewedRound}` },
            { value: 'all', label: `All vs ${task.baseRef}`, title: `Everything the task changed since ${task.baseRef}` },
          ]}
        />
        <RefMenu diffRef={diffRef} branch={branch} compact />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <RefMenu diffRef={diffRef} branch={branch} />
      <ChangesModeSwitch diffRef={diffRef} />
    </div>
  );
}

/** The view picker on its own row, for screens without the diff toolbar (an empty diff, the guide's start). */
export function ViewBar(props: { diffRef: string; branch: string | null }) {
  const { diffRef, branch } = props;

  return (
    <div className="@container/diffbar flex items-center gap-2 h-10 shrink-0 px-5 border-b border-border-muted bg-bg">
      <ViewPicker diffRef={diffRef} branch={branch} />
    </div>
  );
}
