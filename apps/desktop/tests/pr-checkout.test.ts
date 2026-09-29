import { describe, it, expect } from 'vitest';
import { labelFor, parsePrInput, prRefFor } from '../src/features/pr/pr-checkout';

describe('parsePrInput', () => {
  it('accepts numbers and PR urls', () => {
    expect(parsePrInput('12')).toBe('12');
    expect(parsePrInput(' #12 ')).toBe('12');
    expect(parsePrInput('https://github.com/o/r/pull/7/files')).toBe('https://github.com/o/r/pull/7/files');
  });

  it('rejects search text', () => {
    expect(parsePrInput('fix cache')).toBeNull();
    expect(parsePrInput('12a')).toBeNull();
    expect(parsePrInput('https://github.com/o/r/issues/7')).toBeNull();
  });
});

describe('labels and refs', () => {
  it('labels inputs by number', () => {
    expect(labelFor('12')).toBe('#12');
    expect(labelFor('https://github.com/o/r/pull/7')).toBe('#7');
  });

  it('diffs the PR against its base like GitHub', () => {
    expect(prRefFor({ baseRef: 'main' })).toBe('origin/main...HEAD');
  });
});
