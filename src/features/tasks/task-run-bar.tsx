import { cn } from '../../lib/cn';
import { useRepoPath } from '../../hooks/use-repo';
import { buttonGhost } from '../../components/ui/button-styles';
import { Spinner } from '../../components/icons/spinner';
import { openActivity, useRunActivity, type ActivityItem } from '../claude/run-activity';
import { useSetupLog, useTaskForPath, useTaskStatus } from './tasks';

function fileName(path: string): string {
  return path.split('/').slice(-2).join('/');
}

/** The agent's latest step, as a short line: what it's editing, running or reading. */
export function latestStep(items: ActivityItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== 'tool') {
      continue;
    }
    const where = item.locations[0] ? fileName(item.locations[0]) : null;
    if (item.toolKind === 'edit' && where) {
      return `Editing ${where}`;
    }
    if (item.toolKind === 'read' && where) {
      return `Reading ${where}`;
    }
    return item.title;
  }
  return null;
}

function editedFiles(items: ActivityItem[]): number {
  const files = new Set<string>();
  for (const item of items) {
    if (item.kind === 'tool' && item.toolKind === 'edit') {
      item.locations.forEach((location) => files.add(location));
    }
  }
  return files.size;
}

/** Over a task's diff while its agent is busy: what it's doing right now. Stop and the timer stay on the Claude button. */
export function TaskRunBar() {
  const repoPath = useRepoPath();
  const task = useTaskForPath(repoPath);
  const status = useTaskStatus(task);
  const activity = useRunActivity((state) => state.byRepo[repoPath] ?? null);
  const setupLine = useSetupLog((state) => (task ? state.lines[task.id] : undefined));

  if (!task || (status !== 'working' && status !== 'queued' && status !== 'settingUp' && status !== 'needsYou')) {
    return null;
  }
  const live = activity && activity.outcome === 'running' ? activity.items : [];
  const step = latestStep(live);
  const edited = editedFiles(live);
  let line: string;
  if (status === 'settingUp') {
    line = setupLine ? `Setting up · ${setupLine}` : 'Setting up the folder';
  } else if (status === 'queued') {
    line = 'Queued until another task finishes';
  } else if (status === 'needsYou') {
    line = 'Waiting for your answer';
  } else {
    line = step ?? 'Working';
  }
  const detail = status === 'working' && edited > 0 ? `${edited} file${edited === 1 ? '' : 's'} edited so far` : '';

  return (
    <div role="status" className="flex items-center gap-2.5 h-9 shrink-0 px-5 border-b border-border-muted bg-bg-secondary text-xs text-text-secondary">
      {status === 'needsYou' ? <span className="w-2 h-2 rounded-full bg-modified shrink-0" aria-hidden /> : <Spinner className={cn('shrink-0', status === 'working' && 'text-claude')} />}
      <span className="truncate font-medium text-text">{line}</span>
      {detail && <span className="shrink-0 text-text-muted">{detail}</span>}
      <span className="flex-1" />
      {status === 'working' && (
        <button onClick={openActivity} className={cn(buttonGhost, 'h-6 px-2 text-xs shrink-0')}>
          Activity
        </button>
      )}
    </div>
  );
}
