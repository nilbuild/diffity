import { describe, expect, it } from 'vitest';
import { laneOf, startable, type QueueEntry } from '../src/features/claude/run-queue';

function entry(id: string, patch: Partial<QueueEntry> = {}): QueueEntry {
  return { id, state: 'queued', repoPath: '/a', lane: 'edit', onCheckout: true, inTask: false, ...patch };
}

const review = (id: string, patch: Partial<QueueEntry> = {}) => entry(id, { lane: 'read', ...patch });
const prReview = (id: string, patch: Partial<QueueEntry> = {}) => review(id, { onCheckout: false, ...patch });

describe('laneOf', () => {
  it('lets reviews and guides read, and treats the rest as edits', () => {
    expect(laneOf('review')).toBe('read');
    expect(laneOf('guide')).toBe('read');
    for (const kind of ['chat', 'resolve', 'thread', 'reviewFeedback']) {
      expect(laneOf(kind)).toBe('edit');
    }
  });
});

describe('startable', () => {
  it('runs one edit at a time per project, in order', () => {
    expect(startable([entry('e1'), entry('e2')], 4)).toEqual(['e1']);
    expect(startable([entry('e1', { state: 'running' }), entry('e2')], 4)).toEqual([]);
    expect(startable([entry('e1'), entry('b1', { repoPath: '/b' })], 4)).toEqual(['e1', 'b1']);
  });

  it('keeps edits and reviews of the checked-out code apart', () => {
    expect(startable([review('r1', { state: 'running' }), entry('e1')], 4)).toEqual([]);
    expect(startable([entry('e1', { state: 'running' }), review('r1')], 4)).toEqual([]);
    expect(startable([review('r1'), review('r2'), entry('e1')], 4)).toEqual(['r1', 'r2']);
  });

  it('runs reviews of code that isn’t checked out beside anything', () => {
    const entries = [entry('e1', { state: 'running' }), prReview('p1'), prReview('p2'), entry('e2')];
    expect(startable(entries, 4)).toEqual(['p1', 'p2']);
    expect(startable([prReview('p1', { state: 'running' }), entry('e1')], 4)).toEqual(['e1']);
  });

  it('holds later checkout reviews behind a waiting edit, so it isn’t starved', () => {
    const entries = [review('r1', { state: 'running' }), entry('e1'), review('r2'), prReview('p1')];
    expect(startable(entries, 4)).toEqual(['p1']);
  });

  it('keeps task folders within the parallel limit', () => {
    const tasks = [
      entry('t1', { repoPath: '/t1', inTask: true, state: 'running' }),
      entry('t2', { repoPath: '/t2', inTask: true }),
      entry('t3', { repoPath: '/t3', inTask: true }),
      entry('p1'),
    ];
    expect(startable(tasks, 2)).toEqual(['t2', 'p1']);
  });
});
