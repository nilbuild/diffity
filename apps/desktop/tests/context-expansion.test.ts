import { describe, it, expect } from 'vitest';
import type { DiffHunk } from '@diffity/parser';
import {
  computeGaps,
  createContextLines,
  getExpandRange,
  type ExpandableGap,
} from '../src/lib/context-expansion';

function makeHunk(oldStart: number, oldCount: number, newStart: number, newCount: number): DiffHunk {
  return {
    oldStart,
    oldCount,
    newStart,
    newCount,
    lines: [],
  };
}

describe('computeGaps', () => {
  it('returns empty for no hunks', () => {
    expect(computeGaps([], null)).toEqual([]);
  });

  it('creates a top gap when first hunk does not start at line 1', () => {
    const hunks = [makeHunk(10, 5, 10, 5)];
    const gaps = computeGaps(hunks, null);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      id: 'top',
      position: 'top',
      oldStart: 1,
      oldEnd: 9,
      totalLines: 9,
    });
  });

  it('does not create a top gap when first hunk starts at line 1', () => {
    const hunks = [makeHunk(1, 5, 1, 5)];
    const gaps = computeGaps(hunks, null);

    expect(gaps).toHaveLength(0);
  });

  it('creates a between gap for non-adjacent hunks', () => {
    const hunks = [makeHunk(1, 10, 1, 10), makeHunk(50, 5, 50, 5)];
    const gaps = computeGaps(hunks, null);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      id: 'between-0',
      position: 'between',
      oldStart: 11,
      oldEnd: 49,
      totalLines: 39,
    });
  });

  it('does not create a between gap for adjacent hunks', () => {
    const hunks = [makeHunk(1, 10, 1, 10), makeHunk(11, 5, 11, 5)];
    const gaps = computeGaps(hunks, null);

    expect(gaps).toHaveLength(0);
  });

  it('creates a bottom gap when file has lines after last hunk', () => {
    const hunks = [makeHunk(1, 10, 1, 10)];
    const gaps = computeGaps(hunks, 50);

    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      id: 'bottom',
      position: 'bottom',
      oldStart: 11,
      oldEnd: 50,
      totalLines: 40,
    });
  });

  it('does not create a bottom gap when fileLineCount is null', () => {
    const hunks = [makeHunk(1, 10, 1, 10)];
    const gaps = computeGaps(hunks, null);

    expect(gaps).toHaveLength(0);
  });

  it('creates top, between, and bottom gaps together', () => {
    const hunks = [makeHunk(20, 5, 20, 5), makeHunk(50, 5, 50, 5)];
    const gaps = computeGaps(hunks, 100);

    expect(gaps).toHaveLength(3);
    expect(gaps[0].position).toBe('top');
    expect(gaps[1].position).toBe('between');
    expect(gaps[2].position).toBe('bottom');
  });

  it('creates multiple between gaps for multiple non-adjacent hunks', () => {
    const hunks = [
      makeHunk(1, 5, 1, 5),
      makeHunk(20, 5, 20, 5),
      makeHunk(50, 5, 50, 5),
    ];
    const gaps = computeGaps(hunks, null);

    expect(gaps).toHaveLength(2);
    expect(gaps[0].id).toBe('between-0');
    expect(gaps[0].oldStart).toBe(6);
    expect(gaps[0].oldEnd).toBe(19);
    expect(gaps[1].id).toBe('between-1');
    expect(gaps[1].oldStart).toBe(25);
    expect(gaps[1].oldEnd).toBe(49);
  });
});

describe('createContextLines', () => {
  const fileLines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);

  it('creates context lines for a given range', () => {
    const lines = createContextLines(fileLines, 5, 8, 0);

    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ type: 'context', content: 'line 5', oldLineNumber: 5, newLineNumber: 5 });
    expect(lines[3]).toMatchObject({ type: 'context', content: 'line 8', oldLineNumber: 8, newLineNumber: 8 });
  });

  it('applies new line number offset', () => {
    const lines = createContextLines(fileLines, 5, 7, 3);

    expect(lines[0]).toMatchObject({ oldLineNumber: 5, newLineNumber: 8 });
    expect(lines[2]).toMatchObject({ oldLineNumber: 7, newLineNumber: 10 });
  });

  it('handles single line range', () => {
    const lines = createContextLines(fileLines, 10, 10, 0);

    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe('line 10');
  });

  it('returns empty string for out-of-bounds lines', () => {
    const lines = createContextLines(['a', 'b'], 3, 3, 0);

    expect(lines).toHaveLength(1);
    expect(lines[0].content).toBe('');
  });
});

describe('getExpandRange', () => {
  const gap: ExpandableGap = {
    id: 'between-0',
    position: 'between',
    oldStart: 20,
    oldEnd: 100,
    newStart: 20,
    newEnd: 100,
    totalLines: 81,
  };

  const noExpansion = { fromTop: 0, fromBottom: 0 };

  describe('direction: all', () => {
    it('returns the full remaining range', () => {
      const range = getExpandRange(gap, 'all', noExpansion);

      expect(range).toEqual({ oldStart: 20, oldEnd: 100 });
    });

    it('returns the remaining range after partial expansion', () => {
      const range = getExpandRange(gap, 'all', { fromTop: 10, fromBottom: 5 });

      expect(range).toEqual({ oldStart: 30, oldEnd: 95 });
    });
  });

  describe('direction: down (expand from top of gap)', () => {
    it('returns a chunk from the start of the gap', () => {
      const range = getExpandRange(gap, 'down', noExpansion);

      expect(range).toEqual({ oldStart: 20, oldEnd: 39 });
    });

    it('continues from where previous expansion left off', () => {
      const range = getExpandRange(gap, 'down', { fromTop: 20, fromBottom: 0 });

      expect(range).toEqual({ oldStart: 40, oldEnd: 59 });
    });

    it('clamps to remaining end', () => {
      const range = getExpandRange(gap, 'down', { fromTop: 70, fromBottom: 0 });

      expect(range).toEqual({ oldStart: 90, oldEnd: 100 });
    });
  });

  describe('direction: up (expand from bottom of gap)', () => {
    it('returns a chunk from the end of the gap', () => {
      const range = getExpandRange(gap, 'up', noExpansion);

      expect(range).toEqual({ oldStart: 81, oldEnd: 100 });
    });

    it('continues from where previous expansion left off', () => {
      const range = getExpandRange(gap, 'up', { fromTop: 0, fromBottom: 20 });

      expect(range).toEqual({ oldStart: 61, oldEnd: 80 });
    });

    it('clamps to remaining start', () => {
      const range = getExpandRange(gap, 'up', { fromTop: 0, fromBottom: 70 });

      expect(range).toEqual({ oldStart: 20, oldEnd: 30 });
    });
  });

  describe('edge cases', () => {
    it('returns null when fully expanded', () => {
      const range = getExpandRange(gap, 'down', { fromTop: 81, fromBottom: 0 });

      expect(range).toBeNull();
    });

    it('returns null when top and bottom overlap', () => {
      const range = getExpandRange(gap, 'up', { fromTop: 50, fromBottom: 40 });

      expect(range).toBeNull();
    });

    it('expands all when remaining fits in one chunk', () => {
      const smallGap: ExpandableGap = { ...gap, oldStart: 20, oldEnd: 30, totalLines: 11 };

      const rangeDown = getExpandRange(smallGap, 'down', noExpansion);
      expect(rangeDown).toEqual({ oldStart: 20, oldEnd: 30 });

      const rangeUp = getExpandRange(smallGap, 'up', noExpansion);
      expect(rangeUp).toEqual({ oldStart: 20, oldEnd: 30 });
    });

    it('handles top gap expanding upward', () => {
      const topGap: ExpandableGap = {
        id: 'top',
        position: 'top',
        oldStart: 1,
        oldEnd: 50,
        newStart: 1,
        newEnd: 50,
        totalLines: 50,
      };

      const range = getExpandRange(topGap, 'up', noExpansion);

      expect(range).toEqual({ oldStart: 31, oldEnd: 50 });
    });

    it('handles bottom gap expanding downward', () => {
      const bottomGap: ExpandableGap = {
        id: 'bottom',
        position: 'bottom',
        oldStart: 80,
        oldEnd: 120,
        newStart: 80,
        newEnd: 120,
        totalLines: 41,
      };

      const range = getExpandRange(bottomGap, 'down', noExpansion);

      expect(range).toEqual({ oldStart: 80, oldEnd: 99 });
    });

    it('handles simultaneous expansion from both directions', () => {
      const rangeDown = getExpandRange(gap, 'down', { fromTop: 20, fromBottom: 20 });
      expect(rangeDown).toEqual({ oldStart: 40, oldEnd: 59 });

      const rangeUp = getExpandRange(gap, 'up', { fromTop: 20, fromBottom: 20 });
      expect(rangeUp).toEqual({ oldStart: 61, oldEnd: 80 });
    });
  });
});
