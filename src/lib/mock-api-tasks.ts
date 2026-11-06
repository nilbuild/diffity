import { emit } from '@tauri-apps/api/event';
import type { NewTask, Task, TaskState } from './types';

type Args = Record<string, unknown>;

const WORKTREES = '/Users/demo/.diffity/worktrees';

function slugify(title: string): string {
  const slug = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6).join('-');
  return slug || 'task';
}

export function createTaskMockHandlers(repoPath: string, now: () => string, newId: () => string): Record<string, (args: Args) => unknown> {
  const repoName = repoPath.split('/').filter(Boolean).pop() ?? 'repo';
  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const seed = (title: string, state: TaskState, rounds: number, minutes: number): Task => {
    const slug = slugify(title);
    return {
      id: newId(),
      repoPath,
      path: `${WORKTREES}/${repoName}/${slug}`,
      branch: `diffity/${slug}`,
      baseRef: 'main',
      baseSha: 'a1b2c3d4e5f6',
      title,
      prompt: title,
      agentId: 'claude',
      state,
      owned: true,
      prNumber: null,
      prUrl: null,
      mergedAt: null,
      rounds,
      lastRoundSha: rounds > 0 ? 'f00dbabe1234' : null,
      reviewedRound: rounds > 1 ? rounds - 1 : 0,
      reviewedSha: rounds > 1 ? 'a1b2c3d4' : null,
      createdAt: minutesAgo(minutes),
      updatedAt: minutesAgo(Math.max(1, minutes - 10)),
      archivedAt: null,
      missing: false,
    };
  };
  const tasks: Task[] = [
    seed('Add a health check endpoint', 'ready', 2, 40),
    seed('Retry failed static file reads', 'idle', 1, 90),
    seed('Cache headers for SVG files', 'failed', 0, 15),
    { ...seed('Dark mode tokens for the docs', 'idle', 3, 600), prNumber: 42, prUrl: 'https://github.com/demo/tiny-serve/pull/42' },
    { ...seed('Fix persist hydration', 'idle', 1, 1500), mergedAt: minutesAgo(200) },
  ];
  const changed = (path: string) => void emit('tasks-changed', { repoPath: path });
  const find = (id: unknown) => {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
      throw { code: 'not_found', message: `task ${String(id)} not found` };
    }
    return task;
  };
  const active = () => tasks.filter((task) => !task.archivedAt);

  const handlers: Record<string, (args: Args) => unknown> = {
    list_tasks: (args) => active().filter((task) => !args.repoPath || task.repoPath === args.repoPath),
    main_checkout: (args) => active().find((task) => task.path === args.path)?.repoPath ?? args.path,
    create_task: (args) => {
      const input = args.input as NewTask;
      const slug = slugify(input.title);
      const taken = new Set(tasks.map((task) => task.branch));
      let branch = input.branch?.trim() || `diffity/${slug}`;
      for (let n = 2; taken.has(branch); n++) {
        branch = `${input.branch?.trim() || `diffity/${slug}`}-${n}`;
      }
      const task: Task = {
        ...seed(input.title, 'working', 0, 0),
        prompt: input.prompt,
        agentId: input.agentId,
        baseRef: input.baseRef,
        branch,
        path: `${WORKTREES}/${repoName}/${branch.replace(/^diffity\//, '')}`,
        createdAt: now(),
        updatedAt: now(),
      };
      tasks.unshift(task);
      changed(task.repoPath);
      return task;
    },
    set_task_state: (args) => {
      const task = find(args.taskId);
      task.state = args.taskState as TaskState;
      task.updatedAt = now();
      changed(task.repoPath);
      return task;
    },
    rename_task: (args) => {
      const task = find(args.taskId);
      task.title = String(args.title);
      changed(task.repoPath);
      return task;
    },
    finish_task_run: (args) => {
      const task = find(args.taskId);
      task.updatedAt = now();
      if (args.failed) {
        task.state = 'failed';
        changed(task.repoPath);
        return null;
      }
      task.rounds += 1;
      task.lastRoundSha = newId().slice(0, 12);
      task.state = 'ready';
      changed(task.repoPath);
      return { round: task.rounds, commitSha: task.lastRoundSha };
    },
    mark_task_reviewed: (args) => {
      const task = find(args.taskId);
      task.reviewedRound = task.rounds;
      task.reviewedSha = task.lastRoundSha;
      return null;
    },
    notify_task: (args) => {
      console.info('[mock-api] notification', args.title, args.body);
      return null;
    },
    set_task_badge: () => null,
    task_config: () => ({ copy: [], setup: null, archive: null, suggestedSetup: 'pnpm install', fromFile: false }),
    run_task_setup: async (args) => {
      const task = find(args.taskId);
      task.state = 'settingUp';
      changed(task.repoPath);
      const channel = args.onOutput as { onmessage?: (line: string) => void } | undefined;
      for (const line of ['Lockfile is up to date', 'Packages: +214', 'Done in 1.4s']) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        channel?.onmessage?.(line);
      }
      task.state = 'working';
      changed(task.repoPath);
      return null;
    },
    task_base_status: () => ({ ahead: 2, behind: 3, dirty: false, merging: false }),
    update_task_from_base: () => ({ conflicts: [] }),
    ship_task_pr: (args) => {
      const task = find(args.taskId);
      task.prNumber = 57;
      task.prUrl = 'https://github.com/demo/tiny-serve/pull/57';
      changed(task.repoPath);
      return { number: 57, url: task.prUrl };
    },
    merge_task_locally: (args) => {
      const task = find(args.taskId);
      task.mergedAt = now();
      changed(task.repoPath);
      return task;
    },
    restore_task: (args) => {
      const task = find(args.taskId);
      task.archivedAt = null;
      task.missing = false;
      task.state = 'idle';
      changed(task.repoPath);
      return task;
    },
    list_archived_tasks: (args) => tasks.filter((task) => task.archivedAt && task.repoPath === args.repoPath),
    task_storage: () => ({ root: WORKTREES, tasks: active().map((task, index) => ({ taskId: task.id, bytes: (index + 1) * 180_000_000 })) }),
    adopt_worktree: (args) => {
      const task: Task = { ...seed(String(args.path).split('/').pop() ?? 'worktree', 'idle', 0, 0), path: String(args.path), owned: false };
      tasks.unshift(task);
      changed(task.repoPath);
      return task;
    },
    refresh_task_prs: (args) => active().filter((task) => task.repoPath === args.repoPath),
    archive_task: (args) => {
      const task = find(args.taskId);
      task.archivedAt = now();
      changed(task.repoPath);
      return task;
    },
  };
  // Tauri serializes every reply; copying keeps the mock from handing out the objects it mutates later.
  return Object.fromEntries(
    Object.entries(handlers).map(([name, handler]) => [name, async (args: Args) => structuredClone(await handler(args))]),
  );
}
