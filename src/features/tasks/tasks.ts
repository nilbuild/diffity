import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { create } from 'zustand';
import * as tauri from '../../lib/tauri';
import { getRepoPathOrNull } from '../../lib/api';
import { queryClient } from '../../lib/query-client';
import type { Task } from '../../lib/types';
import {
  enqueueClaude,
  onRunEnd,
  onRunStart,
  setTaskLimit,
  setTaskPathCheck,
  useClaude,
  type ClaudePermission,
  type ClaudeRun,
  type RunStart,
} from '../claude/claude-runner';
import { getRunPick, type RunPick } from '../claude/model-setting';

export const TASKS_KEY = ['tasks'];
export const LIMIT_SETTING = 'tasks.parallel';
export const NOTIFY_SETTING = 'tasks.notify';
export const DEFAULT_LIMIT = 4;

/** What a task row shows: the stored state, overridden by what its agent run is doing right now. */
export type TaskStatus = 'settingUp' | 'queued' | 'working' | 'needsYou' | 'ready' | 'idle' | 'failed' | 'missing' | 'shipped' | 'merged';

/** Most urgent first: the order a task list is sorted in. */
export const STATUS_ORDER: TaskStatus[] = ['needsYou', 'ready', 'failed', 'missing', 'working', 'settingUp', 'queued', 'idle', 'shipped', 'merged'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  needsYou: 'Needs you',
  ready: 'Ready for review',
  failed: 'Stopped',
  missing: 'Folder missing',
  working: 'Working',
  settingUp: 'Setting up',
  queued: 'Queued',
  idle: 'Reviewed',
  shipped: 'PR open',
  merged: 'Merged',
};

export function statusLabel(task: Task, status: TaskStatus): string {
  if (status === 'shipped' && task.prNumber) {
    return `PR #${task.prNumber}`;
  }
  return STATUS_LABEL[status];
}

export function isBusy(status: TaskStatus | null | undefined): boolean {
  return status === 'working' || status === 'queued' || status === 'needsYou' || status === 'settingUp';
}

interface SetupLogState {
  /** The last output line of each task's running setup command. */
  lines: Record<string, string>;
}

export const useSetupLog = create<SetupLogState>(() => ({ lines: {} }));

export function useAllTasks(): Task[] {
  const { data } = useQuery({ queryKey: TASKS_KEY, queryFn: () => tauri.listTasks(null), staleTime: 30_000 });
  return data ?? [];
}

function cachedTasks(): Task[] {
  return queryClient.getQueryData<Task[]>(TASKS_KEY) ?? [];
}

export function taskForPath(tasks: Task[], path: string): Task | null {
  return tasks.find((task) => task.path === path) ?? null;
}

export function useTaskForPath(path: string): Task | null {
  return taskForPath(useAllTasks(), path);
}

/** The main checkout a path belongs to: the task's repository inside a task folder, the path itself otherwise. */
export function useParentPath(path: string): string {
  return useTaskForPath(path)?.repoPath ?? path;
}

export function parentPathOf(tasks: Task[], path: string): string {
  return taskForPath(tasks, path)?.repoPath ?? path;
}

export function useRepoTasks(repoPath: string): Task[] {
  const tasks = useAllTasks();
  const parent = parentPathOf(tasks, repoPath);
  return tasks.filter((task) => task.repoPath === parent);
}

export function statusOf(task: Task, runs: ClaudeRun[], permissions: ClaudePermission[]): TaskStatus {
  if (task.missing) {
    return 'missing';
  }
  if (permissions.some((permission) => permission.repoPath === task.path)) {
    return 'needsYou';
  }
  const own = runs.filter((run) => run.context.repoPath === task.path);
  if (own.some((run) => run.state === 'running')) {
    return 'working';
  }
  if (own.length > 0) {
    return 'queued';
  }
  if (task.state === 'settingUp' || task.state === 'failed' || task.state === 'ready') {
    return task.state;
  }
  if (task.mergedAt) {
    return 'merged';
  }
  if (task.prNumber) {
    return 'shipped';
  }
  return 'idle';
}

export function useTaskStatuses(tasks: Task[]): Map<string, TaskStatus> {
  const runs = useClaude((state) => state.runs);
  const permissions = useClaude((state) => state.permissions);
  return new Map(tasks.map((task) => [task.id, statusOf(task, runs, permissions)]));
}

export function useTaskStatus(task: Task | null): TaskStatus | null {
  const runs = useClaude((state) => state.runs);
  const permissions = useClaude((state) => state.permissions);
  return task ? statusOf(task, runs, permissions) : null;
}

export function sortTasks(tasks: Task[], statuses: Map<string, TaskStatus>): Task[] {
  const rank = (task: Task) => STATUS_ORDER.indexOf(statuses.get(task.id) ?? 'idle');
  return [...tasks].sort((left, right) => rank(left) - rank(right) || right.createdAt.localeCompare(left.createdAt));
}

/** The first line of a prompt, cut at a word near 60 characters. */
export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split('\n')[0]?.trim() ?? '';
  if (line.length <= 60) {
    return line.replace(/[.:]$/, '');
  }
  const cut = line.slice(0, 60);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 30 ? space : 60).trim()}…`;
}

export function branchFromTitle(title: string): string {
  const slug = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6).join('-');
  return `diffity/${slug || 'task'}`;
}

function taskPrompt(task: Task): string {
  return `${task.prompt.trim()}\n\nYou are working in a git worktree created for this task, on branch \`${task.branch}\` (from \`${task.baseRef}\`). Make the changes here. Diffity commits your work when you finish, so don't commit, push or switch branches yourself.`;
}

function conflictPrompt(task: Task, files: string[]): string {
  const list = files.map((file) => `- \`${file}\``).join('\n');
  return `Diffity merged \`${task.baseRef}\` into this task's branch and these files have conflicts:\n\n${list}\n\nResolve every conflict marker, keeping both the task's changes and what \`${task.baseRef}\` added, and make sure the code still builds. Don't run \`git merge --continue\` or commit; Diffity concludes the merge when you finish.`;
}

/** Starts (or continues) the task's agent in its folder; the run shows in that folder's activity like any other. */
export async function runTask(task: Task, pick?: RunPick, text?: string) {
  const session = await tauri.getSession(task.path, task.baseRef);
  const chosen = pick ?? (await getRunPick('fix', task.repoPath));
  enqueueClaude({ kind: 'chat' }, { repoPath: task.path, sessionId: session.id, ref: task.baseRef, pick: chosen, text: text ?? taskPrompt(task) });
}

function invalidateTasks() {
  void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
}

/** Runs the setup command, then the agent. A failed setup leaves the task Stopped with the log in a toast. */
export async function setUpAndRun(task: Task, setup: string | null, pick?: RunPick) {
  if (setup?.trim()) {
    try {
      await tauri.runTaskSetup(task.id, setup, (line) => {
        useSetupLog.setState((state) => ({ lines: { ...state.lines, [task.id]: line } }));
      });
    } catch (error) {
      toast.error(`Setup failed for ${task.title}`, {
        description: tauri.errorMessage(error).split('\n').slice(-4).join('\n'),
        duration: 20_000,
        action: { label: 'Retry', onClick: () => void setUpAndRun(task, setup, pick) },
      });
      return;
    } finally {
      useSetupLog.setState((state) => {
        const lines = { ...state.lines };
        delete lines[task.id];
        return { lines };
      });
      invalidateTasks();
    }
  }
  await runTask(task, pick);
}

export async function startTask(input: { repoPath: string; prompt: string; title: string; baseRef: string; branch: string; pick: RunPick; setup: string | null }): Promise<Task> {
  const task = await tauri.createTask({
    repoPath: input.repoPath,
    title: input.title,
    prompt: input.prompt,
    agentId: input.pick.agent,
    baseRef: input.baseRef,
    branch: input.branch,
  });
  queryClient.setQueryData<Task[]>(TASKS_KEY, (tasks) => [task, ...(tasks ?? []).filter((item) => item.id !== task.id)]);
  void setUpAndRun(task, input.setup, input.pick).catch((error) => {
    toast.error(`Could not start ${task.title}`, { description: tauri.errorMessage(error) });
  });
  return task;
}

/** A ready round you've now looked at. Stopped tasks stay put: they still need Run again or Archive. */
export function markTaskSeen(task: Task) {
  if (task.state !== 'ready') {
    return;
  }
  tauri.setTaskState(task.id, 'idle').catch(() => undefined);
}

/** The repository's archive command from .diffity/workspace.json, which archiving runs in the task folder first. */
export function useArchiveCommand(repoPath: string | null): string | null {
  const { data } = useQuery({
    queryKey: ['task-config', repoPath],
    queryFn: () => tauri.taskConfig(repoPath!),
    enabled: !!repoPath,
    staleTime: 60_000,
  });
  return data?.fromFile && data.archive?.trim() ? data.archive.trim() : null;
}

/** What archiving does to this task, for its confirm dialog. */
export function archiveMessage(task: Task, folder: string, archiveCommand: string | null = null): string {
  if (!task.owned) {
    return `Stops tracking ${folder} as a task. Diffity didn't create this worktree, so the folder and the branch ${task.branch} stay as they are.`;
  }
  const command = archiveCommand ? ` First runs \`${archiveCommand}\` in the folder, as this repository's .diffity/workspace.json asks.` : '';
  return `Removes the folder ${folder}. Anything not yet in a round is saved as one first, and the branch ${task.branch}, its rounds and comments are kept.${command}`;
}

export async function archiveTask(task: Task): Promise<boolean> {
  try {
    await tauri.archiveTask(task.id);
    queryClient.setQueryData<Task[]>(TASKS_KEY, (tasks) => (tasks ?? []).filter((item) => item.id !== task.id));
    void queryClient.invalidateQueries({ queryKey: ['archived-tasks'] });
    return true;
  } catch (error) {
    toast.error(`Could not archive ${task.title}`, { description: tauri.errorMessage(error) });
    return false;
  }
}

export async function restoreTask(task: Task): Promise<boolean> {
  try {
    await tauri.restoreTask(task.id);
    invalidateTasks();
    void queryClient.invalidateQueries({ queryKey: ['archived-tasks'] });
    toast.success(`Restored ${task.title}`);
    return true;
  } catch (error) {
    toast.error(`Could not restore ${task.title}`, { description: tauri.errorMessage(error) });
    return false;
  }
}

export async function cleanUpMerged(tasks: Task[]) {
  const merged = tasks.filter((task) => task.mergedAt);
  let done = 0;
  for (const task of merged) {
    if (await archiveTask(task)) {
      done += 1;
    }
  }
  if (done > 0) {
    toast.success(`Archived ${done} merged task${done === 1 ? '' : 's'}`);
  }
}

/** Merges the base into the task; conflicts go to the agent, and its round concludes the merge. */
export async function updateFromBase(task: Task) {
  try {
    const update = await tauri.updateTaskFromBase(task.id);
    void queryClient.invalidateQueries({ queryKey: ['task-base', task.id] });
    if (update.conflicts.length === 0) {
      toast.success(`Updated ${task.title} from ${task.baseRef}`);
      return;
    }
    toast.info(`${update.conflicts.length} conflict${update.conflicts.length === 1 ? '' : 's'} sent to the agent`, {
      description: update.conflicts.slice(0, 3).join(', '),
    });
    await runTask(task, undefined, conflictPrompt(task, update.conflicts));
  } catch (error) {
    toast.error(`Could not update ${task.title}`, { description: tauri.errorMessage(error) });
  }
}

export function useTaskBase(task: Task | null) {
  return useQuery({
    queryKey: ['task-base', task?.id],
    queryFn: () => tauri.taskBaseStatus(task!.id),
    enabled: !!task,
    staleTime: 30_000,
    retry: false,
  });
}

async function readLimit(): Promise<number> {
  const value = await tauri.getSetting(LIMIT_SETTING).catch(() => null);
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_LIMIT;
}

async function notificationsOn(): Promise<boolean> {
  const value = await tauri.getSetting(NOTIFY_SETTING).catch(() => null);
  return value !== '0';
}

/** Runs that edit the task and so make a round; a review or a guide inside a task leaves its rounds alone. */
const EDITING_RUNS = new Set<RunStart['actionKind']>(['chat', 'resolve', 'thread', 'reviewFeedback']);

/** Whether you're looking at this task right now: the app has focus and shows its folder. */
function onScreen(task: Task): boolean {
  return document.hasFocus() && getRepoPathOrNull() === task.path;
}

/** In-app toast when the app has focus but shows something else; a macOS notification when it's in the background. */
async function announce(task: Task, title: string, body: string, action?: { label: string; onClick: () => void }, inApp = true) {
  if (onScreen(task)) {
    return;
  }
  if (document.hasFocus()) {
    if (!inApp) {
      return;
    }
    toast.info(title, { description: body, action, duration: 10_000 });
    return;
  }
  if (await notificationsOn()) {
    tauri.notifyTask(title, body).catch(() => undefined);
  }
}

let openTask: (task: Task) => void = () => undefined;

/** How announcements open a task: set by the router-aware host. */
export function setTaskOpener(open: (task: Task) => void) {
  openTask = open;
}

/** Keeps the task list fresh, ties agent runs in task folders to rounds, and announces what needs you. Mounted once. */
export function useTaskEvents() {
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    setTaskPathCheck((path) => !!taskForPath(cachedTasks(), path));
    void readLimit().then(setTaskLimit);
    tauri
      .onTasksChanged(() => {
        invalidateTasks();
      })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      }, () => undefined);
    const stopRunStart = onRunStart((start) => {
      const task = taskForPath(cachedTasks(), start.repoPath);
      if (!task || !EDITING_RUNS.has(start.actionKind)) {
        return;
      }
      tauri.markTaskReviewed(task.id).catch(() => undefined);
      tauri.setTaskState(task.id, 'working').then(invalidateTasks, () => undefined);
    });
    const stopRunEnd = onRunEnd((end) => {
      const task = taskForPath(cachedTasks(), end.repoPath);
      if (!task || !EDITING_RUNS.has(end.actionKind)) {
        return;
      }
      const open = () => openTask(taskForPath(cachedTasks(), task.path) ?? task);
      tauri
        .finishTaskRun(task.id, end.outcome !== 'done')
        .then((round) => {
          invalidateTasks();
          void queryClient.invalidateQueries({ queryKey: ['commits'] });
          void queryClient.invalidateQueries({ queryKey: ['task-base', task.id] });
          if (end.outcome === 'failed') {
            void announce(task, `${task.title} stopped`, 'The agent stopped with an error.', { label: 'Open', onClick: open });
            return;
          }
          if (end.outcome === 'done') {
            const [title, detail] = round ? [`${task.title} is ready`, `Round ${round.round} is ready for review`] : [`${task.title} finished`, 'The agent made no changes'];
            void announce(task, title, detail, { label: round ? 'Review' : 'Open', onClick: open });
          }
        })
        .catch((error) => {
          invalidateTasks();
          void announce(task, `Could not save the round for ${task.title}`, tauri.errorMessage(error), { label: 'Open', onClick: open });
        });
    });
    let known = new Set<string>();
    let badge = 0;
    const recount = () => {
      const tasks = cachedTasks();
      const waiting = useClaude.getState().permissions.filter((permission) => taskForPath(tasks, permission.repoPath));
      const fresh = waiting.filter((permission) => !known.has(permission.requestId));
      known = new Set(waiting.map((permission) => permission.requestId));
      const count = new Set(waiting.map((permission) => permission.repoPath)).size;
      if (count !== badge) {
        badge = count;
        tauri.setTaskBadge(count).catch(() => undefined);
      }
      for (const permission of fresh) {
        const task = taskForPath(tasks, permission.repoPath);
        if (task) {
          void announce(task, `${task.title} needs approval`, permission.title, undefined, false);
        }
      }
    };
    const stopPermissions = useClaude.subscribe((state, previous) => {
      if (state.permissions !== previous.permissions) {
        recount();
      }
    });
    // A request that came in before the task list loaded is counted once the list arrives.
    const stopTaskCache = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.queryKey[0] === TASKS_KEY[0] && event.query.queryKey.length === 1) {
        recount();
      }
    });
    void queryClient.prefetchQuery({ queryKey: TASKS_KEY, queryFn: () => tauri.listTasks(null) });
    return () => {
      disposed = true;
      unlisten?.();
      stopRunStart();
      stopRunEnd();
      stopPermissions();
      stopTaskCache();
    };
  }, []);
}
