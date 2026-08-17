import { describe, expect, it } from 'vitest';
import type { ParsedDiff } from '@diffity/parser';
import { canRenderTourStepInDiff } from '../src/lib/tour-diff';

const diff: ParsedDiff = {
  files: [
    {
      oldPath: 'src/example.ts',
      newPath: 'src/example.ts',
      status: 'modified',
      additions: 1,
      deletions: 1,
      isBinary: false,
      hunks: [
        {
          header: '@@ -4,2 +4,2 @@',
          oldStart: 4,
          oldCount: 2,
          newStart: 4,
          newCount: 2,
          lines: [
            { type: 'delete', content: 'old', oldLineNumber: 4, newLineNumber: null },
            { type: 'add', content: 'new', oldLineNumber: null, newLineNumber: 4 },
            { type: 'context', content: 'same', oldLineNumber: 5, newLineNumber: 5 },
          ],
        },
      ],
    },
  ],
  stats: { totalAdditions: 1, totalDeletions: 1, filesChanged: 1 },
};

describe('canRenderTourStepInDiff', () => {
  it('renders a new-side line present in the diff', () => {
    expect(canRenderTourStepInDiff(diff, {
      filePath: 'src/example.ts',
      startLine: 4,
      side: 'new',
      viewMode: 'diff',
    })).toBe(true);
  });

  it('renders an old-side deleted line present in the diff', () => {
    expect(canRenderTourStepInDiff(diff, {
      filePath: 'src/example.ts',
      startLine: 4,
      side: 'old',
      viewMode: 'diff',
    })).toBe(true);
  });

  it('falls back when the requested line is outside the diff', () => {
    expect(canRenderTourStepInDiff(diff, {
      filePath: 'src/example.ts',
      startLine: 40,
      side: 'new',
      viewMode: 'diff',
    })).toBe(false);
  });

  it('does not route code-view steps through the diff', () => {
    expect(canRenderTourStepInDiff(diff, {
      filePath: 'src/example.ts',
      startLine: 4,
      side: 'new',
      viewMode: 'code',
    })).toBe(false);
  });
});
