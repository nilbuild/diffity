import { describe, expect, it } from 'vitest';
import { shouldShowStarPrompt } from '../src/features/feedback/star';

describe('shouldShowStarPrompt', () => {
  it('waits for the third launch', () => {
    expect(shouldShowStarPrompt(1, false)).toBe(false);
    expect(shouldShowStarPrompt(2, false)).toBe(false);
    expect(shouldShowStarPrompt(3, false)).toBe(true);
  });

  it('still shows on a later launch when the third one never reached a project', () => {
    expect(shouldShowStarPrompt(5, false)).toBe(true);
  });

  it('never shows twice', () => {
    expect(shouldShowStarPrompt(3, true)).toBe(false);
    expect(shouldShowStarPrompt(9, true)).toBe(false);
  });
});
