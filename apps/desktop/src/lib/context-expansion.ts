import type { DiffHunk, DiffLine } from '@diffity/parser';

const EXPAND_CHUNK_SIZE = 20;

export interface ExpandableGap {
  id: string;
  position: 'top' | 'between' | 'bottom';
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  totalLines: number;
}

export function computeGaps(hunks: DiffHunk[], fileLineCount: number | null): ExpandableGap[] {
  if (hunks.length === 0) {
    return [];
  }

  const gaps: ExpandableGap[] = [];

  const firstHunk = hunks[0];
  if (firstHunk.oldStart > 1) {
    const hiddenLines = firstHunk.oldStart - 1;
    gaps.push({
      id: 'top',
      position: 'top',
      oldStart: 1,
      oldEnd: firstHunk.oldStart - 1,
      newStart: 1,
      newEnd: firstHunk.newStart - 1,
      totalLines: hiddenLines,
    });
  }

  for (let i = 0; i < hunks.length - 1; i++) {
    const current = hunks[i];
    const next = hunks[i + 1];
    const currentEnd = current.oldStart + current.oldCount;
    const nextStart = next.oldStart;
    const hiddenLines = nextStart - currentEnd;

    if (hiddenLines > 0) {
      const currentNewEnd = current.newStart + current.newCount;
      gaps.push({
        id: `between-${i}`,
        position: 'between',
        oldStart: currentEnd,
        oldEnd: nextStart - 1,
        newStart: currentNewEnd,
        newEnd: next.newStart - 1,
        totalLines: hiddenLines,
      });
    }
  }

  const lastHunk = hunks[hunks.length - 1];
  const lastOldEnd = lastHunk.oldStart + lastHunk.oldCount;
  const lastNewEnd = lastHunk.newStart + lastHunk.newCount;

  if (fileLineCount !== null) {
    const remaining = fileLineCount - lastOldEnd + 1;

    if (remaining > 0) {
      gaps.push({
        id: 'bottom',
        position: 'bottom',
        oldStart: lastOldEnd,
        oldEnd: fileLineCount,
        newStart: lastNewEnd,
        newEnd: lastNewEnd + remaining - 1,
        totalLines: remaining,
      });
    }
  }

  return gaps;
}

export function createContextLines(
  fileLines: string[],
  oldStart: number,
  oldEnd: number,
  newOffset: number
): DiffLine[] {
  const lines: DiffLine[] = [];
  for (let i = oldStart; i <= oldEnd; i++) {
    const content = fileLines[i - 1] ?? '';
    lines.push({
      type: 'context',
      content,
      oldLineNumber: i,
      newLineNumber: i + newOffset,
    });
  }
  return lines;
}

export function getExpandRange(
  gap: ExpandableGap,
  direction: 'up' | 'down' | 'all',
  alreadyExpanded: { fromTop: number; fromBottom: number }
): { oldStart: number; oldEnd: number } | null {
  const remainingStart = gap.oldStart + alreadyExpanded.fromTop;
  const remainingEnd = gap.oldEnd - alreadyExpanded.fromBottom;

  if (remainingStart > remainingEnd) {
    return null;
  }

  const remaining = remainingEnd - remainingStart + 1;

  if (direction === 'all' || remaining <= EXPAND_CHUNK_SIZE) {
    return { oldStart: remainingStart, oldEnd: remainingEnd };
  }

  if (direction === 'down') {
    return { oldStart: remainingStart, oldEnd: Math.min(remainingStart + EXPAND_CHUNK_SIZE - 1, remainingEnd) };
  }

  return { oldStart: Math.max(remainingEnd - EXPAND_CHUNK_SIZE + 1, remainingStart), oldEnd: remainingEnd };
}
