import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { cn } from '../../lib/cn';
import { modKey } from '../../lib/platform';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { useViewState } from '../../lib/view-state';
import type { Task } from '../../lib/types';
import { buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { ListRow, type RowAction } from '../../components/ui/list-row';
import { Panel } from '../../components/ui/panel';
import { AlertCircleIcon, ExternalLinkIcon, SparkleIcon, PlayIcon, PlusIcon, TrashIcon, UndoIcon } from '../../components/ui/icon';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { formatRelativeTime } from '../../components/comments/comment-bubble';
import { shortPath } from '../welcome/recent-repos';
import { useRunActivity } from '../claude/run-activity';
import { openNewTask } from './new-task-store';
import { TaskStatusIcon } from './task-status';
import { openTask } from './task-menu';
import { latestStep } from './task-run-bar';
import {
  archiveMessage,
  archiveTask,
  cleanUpMerged,
  isBusy,
  restoreTask,
  runTask,
  sortTasks,
  useArchiveCommand,
  statusLabel,
  TASKS_KEY,
  useRepoTasks,
  useSetupLog,
  useTaskStatuses,
  type TaskStatus,
} from './tasks';

const NEEDS_YOU: TaskStatus[] = ['needsYou', 'ready', 'failed', 'missing'];
const RUNNING: TaskStatus[] = ['working', 'settingUp', 'queued'];

function rounds(count: number): string {
  return count > 0 ? `${count} round${count === 1 ? '' : 's'}` : 'no rounds yet';
}

/** Why a task needs you, in the words its row shows. */
function needsReason(task: Task, status: TaskStatus): string {
  if (status === 'ready') {
    return task.reviewedRound > 0 ? `Round ${task.rounds} is ready · new since you reviewed round ${task.reviewedRound}` : `Round ${task.rounds} is ready to review`;
  }
  if (status === 'needsYou') {
    return 'Waiting for your answer';
  }
  if (status === 'missing') {
    return `Its folder was deleted · restore it from ${task.branch}`;
  }
  return task.rounds > 0 ? `Stopped · ${rounds(task.rounds)} kept` : 'Stopped before its first round';
}

function doneMeta(task: Task, status: TaskStatus): string {
  if (status === 'idle') {
    return `Reviewed · ${rounds(task.rounds)}`;
  }
  return `${statusLabel(task, status)} · ${rounds(task.rounds)}`;
}

function RowButton(props: { label: ReactNode; primary?: boolean; onClick: () => void }) {
  const { label, primary = false, onClick } = props;

  return (
    <button
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(primary ? buttonPrimary : buttonOutline, 'h-7 px-2.5 text-xs')}
    >
      {label}
    </button>
  );
}

export function NewTaskButton(props: { repoPath: string; className?: string }) {
  const { repoPath, className } = props;
  const tasks = useRepoTasks(repoPath);
  const parent = tasks[0]?.repoPath ?? repoPath;

  return (
    <button onClick={() => openNewTask(parent)} className={cn(buttonOutline, 'h-7', className)} title={`Run an agent on its own branch (${modKey}N)`}>
      <PlusIcon size="sm" className="text-text-secondary" />
      New task
    </button>
  );
}

function useArchived(repoPath: string): Task[] {
  return useQuery({ queryKey: ['archived-tasks', repoPath], queryFn: () => tauri.listArchivedTasks(repoPath), staleTime: 30_000 }).data ?? [];
}

function ArchivedRows(props: { archived: Task[] }) {
  const { archived } = props;

  return (
    <>
      {archived.map((task) => (
        <ListRow
          key={task.id}
          icon={<TaskStatusIcon status={task.mergedAt ? 'merged' : 'idle'} />}
          title={<span className="text-text-secondary">{task.title}</span>}
          meta={<span className="truncate">Archived {formatRelativeTime(task.archivedAt ?? task.updatedAt)}</span>}
          onClick={() => void restoreTask(task)}
          tooltip="Restore: recreate the folder from its branch"
          stats={<span className="inline-flex items-center gap-1 text-xs text-text-muted"><UndoIcon size="xs" />Restore</span>}
        />
      ))}
    </>
  );
}

/** Every task was archived: keep a way to bring one back. */
function ArchivedOnly(props: { repoPath: string }) {
  const { repoPath } = props;
  const archived = useArchived(repoPath);
  const [open, setOpen] = useState(false);

  if (archived.length === 0) {
    return null;
  }
  return (
    <Panel title="Archived tasks" count={archived.length} collapsible={{ open, onToggle: () => setOpen(!open) }}>
      <ul><ArchivedRows archived={archived} /></ul>
    </Panel>
  );
}

/**
 * Home's task sections, most urgent first: what needs you (with your own checkout's next review folded in), what's
 * running, then everything you're done with behind one line. Shows only archived tasks, or nothing, before the first task.
 */
export function TaskSections(props: { repoPath: string; checkoutRow?: ReactNode }) {
  const { repoPath, checkoutRow } = props;
  const navigate = useNavigate();
  const tasks = useRepoTasks(repoPath);
  const statuses = useTaskStatuses(tasks);
  const setupLines = useSetupLog((state) => state.lines);
  const activity = useRunActivity((state) => state.byRepo);
  const [confirming, setConfirming] = useState<Task | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [doneOpen, setDoneOpen] = useViewState('home:tasks-done-open', false);
  const parent = tasks[0]?.repoPath ?? null;
  const archived = useArchived(parent ?? repoPath);
  const archiveCommand = useArchiveCommand(parent);
  const watchPrs = tasks.some((task) => task.prNumber && !task.mergedAt);

  useEffect(() => {
    if (!parent || !watchPrs) {
      return;
    }
    tauri.refreshTaskPrs(parent).then(() => queryClient.invalidateQueries({ queryKey: TASKS_KEY }), () => undefined);
  }, [parent, watchPrs]);

  if (tasks.length === 0) {
    return <ArchivedOnly repoPath={repoPath} />;
  }
  const statusOf = (task: Task): TaskStatus => statuses.get(task.id) ?? 'idle';
  const sorted = sortTasks(tasks, statuses);
  const needs = sorted.filter((task) => NEEDS_YOU.includes(statusOf(task)));
  const running = sorted.filter((task) => RUNNING.includes(statusOf(task)));
  const done = sorted.filter((task) => !NEEDS_YOU.includes(statusOf(task)) && !RUNNING.includes(statusOf(task)));
  const merged = done.filter((task) => task.mergedAt);
  const prOpen = done.filter((task) => task.prNumber && !task.mergedAt).length;
  const reviewed = done.length - merged.length - prOpen;
  const doneDetail = [
    reviewed > 0 ? `${reviewed} reviewed` : null,
    prOpen > 0 ? `${prOpen} PR${prOpen === 1 ? '' : 's'} open` : null,
    merged.length > 0 ? `${merged.length} merged` : null,
    archived.length > 0 ? `${archived.length} archived` : null,
  ].filter(Boolean).join(' · ');
  const foldCount = done.length + archived.length;
  const hasAbove = needs.length > 0 || !!checkoutRow || running.length > 0;

  const menuFor = (task: Task, status: TaskStatus): RowAction[] => {
    if (isBusy(status)) {
      return [];
    }
    const actions: RowAction[] = [];
    if (task.prUrl) {
      actions.push({ label: `Open pull request #${task.prNumber}`, icon: <ExternalLinkIcon size="sm" />, onSelect: () => void openUrl(task.prUrl!) });
    }
    if (status === 'failed' || status === 'idle') {
      actions.push({ label: 'Run the agent again', icon: <PlayIcon size="sm" />, onSelect: () => void runTask(task) });
    }
    actions.push({ label: 'Archive task…', icon: <TrashIcon size="sm" />, onSelect: () => setConfirming(task) });
    return actions;
  };
  const open = (task: Task) => void openTask(task, navigate);
  const needsButton = (task: Task, status: TaskStatus) => {
    if (status === 'failed') {
      return <RowButton label={<><PlayIcon size="xs" />Run again</>} onClick={() => void runTask(task)} />;
    }
    if (status === 'missing') {
      return <RowButton label="Restore" onClick={() => open(task)} />;
    }
    return <RowButton label={status === 'needsYou' ? 'Answer' : 'Review'} primary={status === 'ready'} onClick={() => open(task)} />;
  };
  const runningMeta = (task: Task, status: TaskStatus): string => {
    if (status === 'settingUp') {
      return setupLines[task.id] ? `Setting up · ${setupLines[task.id]}` : 'Setting up the folder';
    }
    if (status === 'queued') {
      return 'Queued until another task finishes';
    }
    const live = activity[task.path];
    return (live && live.outcome === 'running' ? latestStep(live.items) : null) ?? 'Working';
  };
  const time = (task: Task) => <span className="text-xs text-text-muted tabular-nums whitespace-nowrap">{formatRelativeTime(task.updatedAt)}</span>;

  return (
    <>
      {(needs.length > 0 || checkoutRow) && (
        <Panel title="Needs you" icon={<AlertCircleIcon size="sm" />} count={needs.length + (checkoutRow ? 1 : 0)}>
          <ul>
            {needs.map((task) => {
              const status = statusOf(task);
              return (
                <ListRow
                  key={task.id}
                  icon={<TaskStatusIcon status={status} />}
                  title={task.title}
                  meta={<span className="truncate">{needsReason(task, status)}</span>}
                  stats={<span className="flex items-center gap-3">{time(task)}{needsButton(task, status)}</span>}
                  tooltip={`${task.title}\n${shortPath(task.path)}`}
                  onClick={() => open(task)}
                  actions={menuFor(task, status)}
                />
              );
            })}
            {checkoutRow}
          </ul>
        </Panel>
      )}
      {running.length > 0 && (
        <Panel title="Running" icon={<SparkleIcon size="sm" className="text-claude" />} count={running.length}>
          <ul>
            {running.map((task) => {
              const status = statusOf(task);
              return (
                <ListRow
                  key={task.id}
                  icon={<TaskStatusIcon status={status} />}
                  title={task.title}
                  meta={<span className="truncate">{runningMeta(task, status)}</span>}
                  stats={time(task)}
                  tooltip={`${task.title}\n${shortPath(task.path)}`}
                  onClick={() => open(task)}
                />
              );
            })}
          </ul>
        </Panel>
      )}
      {foldCount > 0 && (
        <Panel
          title={hasAbove ? `${foldCount} more task${foldCount === 1 ? '' : 's'}` : `${foldCount} task${foldCount === 1 ? '' : 's'}`}
          detail={doneDetail}
          collapsible={{ open: doneOpen, onToggle: () => setDoneOpen(!doneOpen) }}
          right={merged.length > 0 && (
            <button onClick={() => setCleaningUp(true)} className={cn(buttonGhost, 'h-6 px-2 text-xs')} title="Archive every merged task">
              Clean up merged
            </button>
          )}
        >
          <ul>
              {done.map((task) => {
                const status = statusOf(task);
                return (
                  <ListRow
                    key={task.id}
                    icon={<TaskStatusIcon status={status} />}
                    title={task.title}
                    meta={<span className="truncate">{doneMeta(task, status)}</span>}
                    stats={time(task)}
                    tooltip={`${task.title}\n${shortPath(task.path)}`}
                    onClick={() => open(task)}
                    actions={menuFor(task, status)}
                  />
                );
              })}
            <ArchivedRows archived={archived} />
          </ul>
        </Panel>
      )}
      {cleaningUp && (
        <ConfirmDialog
          title={`Archive ${merged.length} merged task${merged.length === 1 ? '' : 's'}?`}
          message={`${merged.length === 1 ? 'Removes its folder' : 'Removes their folders'}. Anything not yet in a round is saved as one first, and the ${merged.length === 1 ? 'branch' : 'branches'}, rounds and comments are kept.${archiveCommand ? ` First runs \`${archiveCommand}\` in ${merged.length === 1 ? 'the folder' : 'each folder'}, as this repository's .diffity/workspace.json asks.` : ''}`}
          confirmLabel="Archive"
          onCancel={() => setCleaningUp(false)}
          onConfirm={() => {
            setCleaningUp(false);
            void cleanUpMerged(merged);
          }}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={`Archive “${confirming.title}”?`}
          message={archiveMessage(confirming, shortPath(confirming.path), archiveCommand)}
          confirmLabel="Archive"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            void archiveTask(target);
          }}
        />
      )}
    </>
  );
}
