import { useRepoPath } from '../../hooks/use-repo';
import type { Task } from '../../lib/types';
import { useTaskForPath } from './tasks';

export interface RoundViews {
  task: Task;
  sinceRef: string;
  onSince: boolean;
}

function roundViews(task: Task | null, diffRef: string): RoundViews | null {
  if (!task || !task.reviewedSha || task.reviewedRound === 0 || task.reviewedRound >= task.rounds) {
    return null;
  }
  if (diffRef !== task.reviewedSha && diffRef !== task.baseRef) {
    return null;
  }
  return { task, sinceRef: task.reviewedSha, onSince: diffRef === task.reviewedSha };
}

/** Inside a task with a round you haven't reviewed: the two views worth switching between, or null. */
export function useRoundViews(diffRef: string): RoundViews | null {
  return roundViews(useTaskForPath(useRepoPath()), diffRef);
}

/** Whether the round line replaces the diff's context line for this view. */
export function useShowsRoundBar(diffRef: string): boolean {
  return useRoundViews(diffRef) !== null;
}

/** The line over a task's diff saying which round you're looking at. */
export function TaskRoundBar(props: { diffRef: string }) {
  const { diffRef } = props;
  const views = useRoundViews(diffRef);

  if (!views) {
    return null;
  }
  const { task, onSince } = views;
  return (
    <div className="flex items-center min-w-0 min-h-7 text-xs text-text-secondary">
      <span className="truncate">
        <span className="font-medium text-text">Round {task.rounds}</span>
        {onSince ? ` · what changed since you reviewed round ${task.reviewedRound}` : ` · everything since ${task.baseRef}`}
      </span>
    </div>
  );
}
