import { describe, expect, it } from 'vitest';
import { addressedThreadIds, reviewFixesLabel } from '../src/features/comments/addressed';

describe('addressed threads', () => {
  const threads = [
    { id: 'a', status: 'open' as const, addressedBy: 'Claude Code' },
    { id: 'b', status: 'open' as const, addressedBy: null },
    { id: 'c', status: 'resolved' as const, addressedBy: null },
    { id: 'd', status: 'open' as const, addressedBy: 'Codex' },
  ];

  it('lists the open threads an agent addressed among the ones it worked on', () => {
    expect(addressedThreadIds(threads, ['a', 'b', 'c'])).toEqual(['a']);
    expect(addressedThreadIds(threads, new Set(['a', 'd']))).toEqual(['a', 'd']);
    expect(addressedThreadIds(threads, [])).toEqual([]);
  });

  it('labels the toast action', () => {
    expect(reviewFixesLabel(1)).toBe('Review the fix');
    expect(reviewFixesLabel(3)).toBe('Review 3 fixes');
  });
});
