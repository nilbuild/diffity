import type { Task } from '../../lib/types';
import { GitBranchIcon } from '../../components/ui/icon';
import { useTaskBase } from './tasks';

/** The status bar's left side inside a task: its branch and where it stands against its base. No branch switching or push here, since the task owns its branch and Ship pushes. */
export function TaskStatusLine(props: { task: Task }) {
  const { task } = props;
  const { data: base } = useTaskBase(task);
  const behind = base?.behind ?? 0;

  return (
    <span className="flex items-center gap-2 h-5 px-1.5 min-w-0">
      <GitBranchIcon className="w-3 h-3 shrink-0 text-text-muted" />
      <span className="truncate font-mono text-[11px] text-text-secondary" title={task.branch}>{task.branch}</span>
      <span className="shrink-0 text-text-muted">
        from {task.baseRef}
        {behind > 0 && ` · ${task.baseRef} has ${behind} new commit${behind === 1 ? '' : 's'}`}
        {base?.merging && ' · merge in progress'}
      </span>
    </span>
  );
}
