import { describe, expect, it } from 'vitest';
import { readsAsChangeRequest } from '../src/features/claude/review-form';

describe('readsAsChangeRequest', () => {
  it('spots instructions that ask for edits', () => {
    expect(readsAsChangeRequest('remove all the code comments from this file')).toBe(true);
    expect(readsAsChangeRequest('Please rename getUser to fetchUser')).toBe(true);
    expect(readsAsChangeRequest('can you fix the typo in the README')).toBe(true);
  });

  it('leaves review guidance alone', () => {
    expect(readsAsChangeRequest('Check error handling in the new API routes')).toBe(false);
    expect(readsAsChangeRequest('This is a perf refactor, look for regressions')).toBe(false);
    expect(readsAsChangeRequest('')).toBe(false);
  });
});
