import { describe, expect, it } from 'vitest';
import { SPLIT_MIN_CHARS, SPLIT_RESUME_CHARS, splitCharsPerSide, splitFits } from '../src/lib/split-room';

describe('splitCharsPerSide', () => {
  it('counts the code characters left on each side', () => {
    expect(splitCharsPerSide(1160, 13, 7.8)).toBe(62);
    expect(splitCharsPerSide(750, 13, 7.8)).toBe(35);
  });

  it('never goes below zero', () => {
    expect(splitCharsPerSide(100, 13, 7.8)).toBe(0);
  });
});

describe('splitFits', () => {
  it('decides the first measure on the lower bound', () => {
    expect(splitFits(null, SPLIT_MIN_CHARS)).toBe(true);
    expect(splitFits(null, SPLIT_MIN_CHARS - 1)).toBe(false);
  });

  it('keeps the current layout between the two bounds', () => {
    const between = SPLIT_MIN_CHARS + 2;
    expect(between).toBeLessThan(SPLIT_RESUME_CHARS);
    expect(splitFits(true, between)).toBe(true);
    expect(splitFits(false, between)).toBe(false);
  });

  it('switches at the bounds', () => {
    expect(splitFits(true, SPLIT_MIN_CHARS - 1)).toBe(false);
    expect(splitFits(false, SPLIT_RESUME_CHARS)).toBe(true);
  });
});
