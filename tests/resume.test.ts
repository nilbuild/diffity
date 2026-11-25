import { describe, expect, it } from 'vitest';
import { RECENT_MS, diffRefOf, shouldRestore } from '../src/features/welcome/resume';
import { repoBase } from '../src/hooks/use-repo';

const now = 10 * RECENT_MS;
const base = { now, empty: false, inProgress: false };

describe('shouldRestore', () => {
  it('always reopens a view you left recently', () => {
    expect(shouldRestore({ ...base, visitedAt: now - RECENT_MS / 2 })).toBe(true);
  });

  it('goes home from a stale view with nothing unfinished', () => {
    expect(shouldRestore({ ...base, visitedAt: now - RECENT_MS * 2 })).toBe(false);
    expect(shouldRestore({ ...base, visitedAt: null })).toBe(false);
  });

  it('reopens a stale view that still has work in progress', () => {
    expect(shouldRestore({ ...base, visitedAt: now - RECENT_MS * 2, inProgress: true })).toBe(true);
  });

  it('never reopens a view that has nothing left to show', () => {
    expect(shouldRestore({ ...base, visitedAt: now - 1000, empty: true, inProgress: true })).toBe(false);
  });
});

describe('diffRefOf', () => {
  it('reads the view of a diff location and ignores other pages', () => {
    const repo = '/Users/me/app';
    expect(diffRefOf(repo, `${repoBase(repo)}/diff?ref=main...HEAD&file=a.ts`)).toBe('main...HEAD');
    expect(diffRefOf(repo, `${repoBase(repo)}/diff`)).toBe('work');
    expect(diffRefOf(repo, `${repoBase(repo)}/tree?file=a.ts`)).toBeNull();
    expect(diffRefOf(repo, `${repoBase(repo)}/overview`)).toBeNull();
  });
});
