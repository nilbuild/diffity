import { useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '../../lib/cn';
import { modKey } from '../../lib/platform';
import type { Task } from '../../lib/types';
import { buttonOutline } from '../../components/ui/button-styles';
import { ChevronDownIcon, GitBranchIcon, HomeIcon, PlusIcon, TrashIcon } from '../../components/ui/icon';
import { MenuItem, MenuLabel, MenuSeparator, Popover, useMenu } from '../../components/ui/popover';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { repoBase } from '../../hooks/use-repo';
import { lastLocationFor } from '../../lib/repo-locations';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { guessBaseBranch, useBranches, useGitStatus, useWorktrees } from '../../hooks/use-repo-state';
import { shortPath } from '../welcome/recent-repos';
import { openNewTask } from './new-task-store';
import { TaskStatusIcon } from './task-status';
import { archiveMessage, archiveTask, isBusy, restoreTask, useArchiveCommand, sortTasks, statusLabel, TASKS_KEY, useRepoTasks, useTaskStatuses, type TaskStatus } from './tasks';

/** Where opening a task lands: a fresh round opens on just what changed since your last review. */
export function taskLocation(task: Task): string {
  const base = repoBase(task.path);
  if (task.state === 'ready' && task.reviewedSha && task.reviewedRound > 0 && task.reviewedRound < task.rounds) {
    return `${base}/diff?ref=${encodeURIComponent(task.reviewedSha)}`;
  }
  return lastLocationFor(task.path) ?? `${base}/diff?ref=${encodeURIComponent(task.baseRef)}`;
}

/** Opens a task, first recreating its folder when it was deleted outside Diffity. */
export async function openTask(task: Task, navigate: (to: string) => void) {
  if (task.missing && !(await restoreTask(task))) {
    return;
  }
  navigate(taskLocation(task));
}

/** Status words beside the task's name in the crumb; nothing when there's nothing to say. */
function crumbStatus(task: Task, status: TaskStatus): string | null {
  if (status === 'ready') {
    return `Round ${task.rounds} ready`;
  }
  if (status === 'idle') {
    return null;
  }
  return statusLabel(task, status);
}

function TaskRow(props: { task: Task; status: TaskStatus; current: boolean; onOpen: () => void }) {
  const { task, status, current, onOpen } = props;

  return (
    <button
      role="menuitem"
      onClick={onOpen}
      aria-current={current ? 'true' : undefined}
      className={cn('flex items-center gap-2.5 w-full min-h-10 px-2.5 py-1 rounded-md text-left hover:bg-hover transition-colors cursor-pointer', current && 'bg-selected')}
    >
      <span className="flex w-4 justify-center shrink-0"><TaskStatusIcon status={status} /></span>
      <span className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-[13px] leading-[18px] text-text">{task.title}</span>
        <span className="truncate text-xs leading-4 text-text-muted font-mono">{task.branch}</span>
      </span>
      <span className="shrink-0 text-xs text-text-muted">{task.rounds > 0 && status === 'idle' ? `${task.rounds} round${task.rounds === 1 ? '' : 's'}` : statusLabel(task, status)}</span>
    </button>
  );
}

/** The task crumb: which task (or your own checkout) you're looking at, and a switcher between them. */
export function TaskMenu(props: { repoPath: string; task: Task | null }) {
  const { repoPath, task } = props;
  const navigate = useNavigate();
  const menu = useMenu();
  const tasks = useRepoTasks(repoPath);
  const statuses = useTaskStatuses(tasks);
  const [confirming, setConfirming] = useState<Task | null>(null);
  const parentPath = task?.repoPath ?? repoPath;
  const sorted = sortTasks(tasks, statuses);
  const currentStatus = task ? statuses.get(task.id) ?? 'idle' : null;
  const busy = isBusy(currentStatus);
  const { data: worktrees } = useWorktrees();
  const { data: branches } = useBranches();
  const others = (worktrees ?? []).filter((tree) => !tree.isMain && !tasks.some((item) => item.path === tree.path) && tree.path !== task?.path);
  const adopt = async (path: string) => {
    const guess = branches ? guessBaseBranch(branches, null) : null;
    const local = guess?.replace(/^(origin|upstream)\//, '');
    const base = local && branches?.some((branch) => !branch.isRemote && branch.name === local) ? local : guess ?? 'main';
    try {
      const adopted = await tauri.adoptWorktree(path, base);
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      toast.success(`Tracking ${shortPath(adopted.path)} as a task`, { description: `Compared against ${base}. Diffity won't remove this folder.` });
    } catch (error) {
      toast.error('Could not track the worktree', { description: tauri.errorMessage(error) });
    }
  };
  const parentName = parentPath.split('/').filter(Boolean).pop() ?? parentPath;
  const archiveCommand = useArchiveCommand(parentPath);
  const { data: checkoutStatus } = useGitStatus();
  const crumbNote = task && currentStatus ? crumbStatus(task, currentStatus) : checkoutStatus?.branch ?? null;

  if (!task && tasks.length === 0) {
    return null;
  }

  const run = (action: () => void) => () => {
    menu.close();
    action();
  };

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={task ? `${task.title}\n${task.branch}` : 'Your checkout · switch to a task'}
        className={cn(
          buttonOutline,
          'shrink min-w-[88px] max-w-[440px] @max-4xl/titlebar:max-w-[300px] @max-3xl/titlebar:max-w-[220px] pl-2.5 pr-2 gap-1.5',
          menu.open && 'bg-control-hover',
        )}
      >
        {currentStatus ? <TaskStatusIcon status={currentStatus} /> : <GitBranchIcon size="sm" className="shrink-0 text-text-secondary" />}
        <span className="truncate font-medium">{task ? task.title : 'Your checkout'}</span>
        {crumbNote && <span className="shrink-0 text-xs text-text-muted @max-4xl/titlebar:hidden">{crumbNote}</span>}
        <ChevronDownIcon size="xs" className="shrink-0 text-text-secondary" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} width={400}>
        <MenuItem icon={<PlusIcon size="sm" />} label="New task…" hint={`${modKey}N`} onSelect={run(() => openNewTask(parentPath))} />
        {sorted.length > 0 && <MenuLabel>Tasks</MenuLabel>}
        {sorted.map((item) => (
          <TaskRow
            key={item.id}
            task={item}
            status={statuses.get(item.id) ?? 'idle'}
            current={item.id === task?.id}
            onOpen={run(() => {
              if (item.id !== task?.id) {
                void openTask(item, navigate);
              }
            })}
          />
        ))}
        <MenuLabel>Your checkout</MenuLabel>
        <button
          role="menuitem"
          onClick={run(() => {
            if (task) {
              navigate(lastLocationFor(parentPath) ?? `${repoBase(parentPath)}/overview`);
            }
          })}
          aria-current={!task ? 'true' : undefined}
          className={cn('flex items-center gap-2.5 w-full min-h-10 px-2.5 py-1 rounded-md text-left hover:bg-hover transition-colors cursor-pointer', !task && 'bg-selected')}
        >
          <span className="flex w-4 justify-center shrink-0 text-text-secondary"><GitBranchIcon size="sm" /></span>
          <span className="flex flex-col min-w-0 flex-1">
            <span className="truncate text-[13px] leading-[18px] text-text">{parentName}</span>
            <span className="truncate text-xs leading-4 text-text-muted">{shortPath(parentPath)}</span>
          </span>
        </button>
        {others.length > 0 && <MenuLabel>Other worktrees</MenuLabel>}
        {others.map((tree) => (
          <div key={tree.path} className="flex items-center gap-2.5 w-full min-h-10 px-2.5 py-1 rounded-md">
            <span className="flex w-4 justify-center shrink-0 text-text-secondary"><GitBranchIcon size="sm" /></span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="truncate text-[13px] leading-[18px] text-text">{tree.branch ?? 'Detached'}</span>
              <span className="truncate text-xs leading-4 text-text-muted">{shortPath(tree.path)}</span>
            </span>
            {tree.branch && (
              <button onClick={run(() => void adopt(tree.path))} className="shrink-0 h-6 px-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer">
                Track as task
              </button>
            )}
          </div>
        ))}
        <MenuSeparator />
        <MenuItem icon={<HomeIcon size="sm" />} label="All tasks on Home" onSelect={run(() => navigate(`${repoBase(parentPath)}/overview`))} />
        {task && (
          <MenuItem
            icon={<TrashIcon size="sm" />}
            label={busy ? 'Archive this task… (stop the agent first)' : 'Archive this task…'}
            disabled={busy}
            onSelect={run(() => setConfirming(task))}
          />
        )}
      </Popover>
      {confirming && (
        <ConfirmDialog
          title={`Archive “${confirming.title}”?`}
          message={archiveMessage(confirming, shortPath(confirming.path), archiveCommand)}
          confirmLabel="Archive"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const target = confirming;
            setConfirming(null);
            void archiveTask(target).then((done) => {
              if (done && target.id === task?.id) {
                navigate(`${repoBase(target.repoPath)}/overview`);
              }
            });
          }}
        />
      )}
    </>
  );
}
