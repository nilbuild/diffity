import type { ParsedDiff } from '@diffity/parser';
import type { TourStep } from './api';
import { getFilePath } from './diff-utils';

export function canRenderTourStepInDiff(
  diff: ParsedDiff,
  step: Pick<TourStep, 'filePath' | 'startLine' | 'side' | 'viewMode'>,
): boolean {
  if (step.viewMode !== 'diff') {
    return false;
  }

  const file = diff.files.find((candidate) => getFilePath(candidate) === step.filePath);
  if (!file || file.isBinary) {
    return false;
  }

  return file.hunks.some((hunk) =>
    hunk.lines.some((line) => {
      const lineNumber = step.side === 'old' ? line.oldLineNumber : line.newLineNumber;
      return lineNumber === step.startLine;
    }),
  );
}
