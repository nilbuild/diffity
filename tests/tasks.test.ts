import { describe, it, expect } from 'vitest';
import { branchFromTitle, isBusy, isReadyToShip, isRoundView, roundFooterCopy, sortTasks, statusLabel, statusOf, titleFromPrompt } from '../src/features/tasks/tasks';
import type { ClaudePermission, ClaudeRun } from '../src/features/claude/claude-runner';
import type { Task } from '../src/lib/types';

const task = (patch: Partial<Task> = {}): Task => ({
  id: 't1',
  repoPath: '/r',
  path: '/w/r/one',
  branch: 'diffity/one',
  baseRef: 'main',
  baseSha: 'abc',
  title: 'One',
  prompt: 'Do one',
  agentId: 'claude',
  state: 'idle',
  owned: true,
  prNumber: null,
  prUrl: null,
  mergedAt: null,
  rounds: 1,
  lastRoundSha: 'def',
  reviewedRound: 0,
  reviewedSha: null,
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-01T00:00:00Z',
  archivedAt: null,
  missing: false,
  ...patch,
});

const run = (repoPath: string, state: 'queued' | 'running') => ({ context: { repoPath }, state }) as unknown as ClaudeRun;
const permission = (repoPath: string) => ({ repoPath, requestId: 'p' }) as unknown as ClaudePermission;

describe('statusOf', () => {
  it('puts what the agent is doing ahead of the stored state', () => {
    const t = task({ state: 'ready' });
    expect(statusOf(t, [run(t.path, 'running')], [permission(t.path)])).toBe('needsYou');
    expect(statusOf(t, [run(t.path, 'running')], [])).toBe('working');
    expect(statusOf(t, [run(t.path, 'queued')], [])).toBe('queued');
    expect(statusOf(t, [run('/elsewhere', 'running')], [])).toBe('ready');
  });

  it('shows shipping once nothing newer needs you', () => {
    expect(statusOf(task({ prNumber: 4 }), [], [])).toBe('shipped');
    expect(statusOf(task({ prNumber: 4, mergedAt: 'x' }), [], [])).toBe('merged');
    expect(statusOf(task({ prNumber: 4, state: 'ready' }), [], [])).toBe('ready');
    expect(statusOf(task({ state: 'working', reviewedRound: 1 }), [], [])).toBe('idle');
    expect(statusOf(task({ state: 'settingUp' }), [], [])).toBe('settingUp');
  });

  it('keeps a round you only looked at in review until you mark it reviewed', () => {
    expect(statusOf(task({ rounds: 2, reviewedRound: 1 }), [], [])).toBe('ready');
    expect(statusOf(task({ rounds: 2, reviewedRound: 2 }), [], [])).toBe('idle');
    expect(statusOf(task({ rounds: 0, reviewedRound: 0 }), [], [])).toBe('idle');
  });

  it('flags a deleted folder before anything else', () => {
    expect(statusOf(task({ missing: true, state: 'ready', prNumber: 4 }), [], [])).toBe('missing');
    expect(isBusy('missing')).toBe(false);
  });

  it('labels a pull request by number and knows busy states', () => {
    expect(statusLabel(task({ prNumber: 42 }), 'shipped')).toBe('PR #42');
    expect(isBusy('settingUp')).toBe(true);
    expect(isBusy('ready')).toBe(false);
  });
});

describe('sortTasks', () => {
  it('orders by urgency, newest first within a status', () => {
    const ready = task({ id: 'a' });
    const waiting = task({ id: 'b' });
    const older = task({ id: 'c', createdAt: '2026-10-01T00:00:00Z' });
    const newer = task({ id: 'd', createdAt: '2026-11-05T00:00:00Z' });
    const statuses = new Map([['a', 'ready'], ['b', 'needsYou'], ['c', 'idle'], ['d', 'idle']] as const);
    expect(sortTasks([older, ready, newer, waiting], new Map(statuses)).map((t) => t.id)).toEqual(['b', 'a', 'd', 'c']);
  });
});

describe('titles and branches', () => {
  it('takes the first line of the prompt', () => {
    expect(titleFromPrompt('Add a reset() to the store.\nMore detail')).toBe('Add a reset() to the store');
    expect(titleFromPrompt('word '.repeat(30)).length).toBeLessThanOrEqual(61);
  });

  it('makes a diffity/ branch from the title', () => {
    expect(branchFromTitle('Add a reset() to the vanilla store please')).toBe('diffity/add-a-reset-to-the-vanilla');
    expect(branchFromTitle('!!!')).toBe('diffity/task');
  });
});

describe('round footer', () => {
  it('shows on the task views that hold its rounds', () => {
    const t = task({ reviewedSha: 'r1' });
    expect(isRoundView(t, 'main')).toBe(true);
    expect(isRoundView(t, 'r1')).toBe(true);
    expect(isRoundView(t, 'work')).toBe(false);
    expect(isRoundView(task({ reviewedSha: null }), 'r1')).toBe(false);
  });

  it('offers the next round or shipping', () => {
    const open = task({ rounds: 2, reviewedRound: 1 });
    expect(roundFooterCopy(open, 0, 'Claude')).toEqual({
      title: 'Done with round 2?',
      detail: 'Mark it reviewed, or add comments on lines and send them to Claude to start round 3.',
    });
    expect(roundFooterCopy(open, 1, 'Claude').detail).toBe('Send your 1 comment to Claude to start round 3, or mark this round reviewed.');
    expect(roundFooterCopy(open, 3, 'Codex').detail).toBe('Send your 3 comments to Codex to start round 3, or mark this round reviewed.');
    const reviewed = task({ rounds: 2, reviewedRound: 2 });
    expect(roundFooterCopy(reviewed, 0, 'Claude')).toEqual({ title: 'Round 2 reviewed', detail: 'Ship it as a pull request or merge it into main.' });
  });

  it('is ready to ship once reviewed and not yet shipped', () => {
    expect(isReadyToShip(task({ reviewedRound: 1 }), 'idle')).toBe(true);
    expect(isReadyToShip(task({ reviewedRound: 1, prNumber: 3 }), 'shipped')).toBe(false);
    expect(isReadyToShip(task({ rounds: 0 }), 'idle')).toBe(false);
    expect(isReadyToShip(task(), 'ready')).toBe(false);
  });
});
