import type {
  DiffFile,
  DiffHunk,
  DiffLine,
  ParsedDiff,
} from './types.js';
import { computeWordDiff } from './word-diff.js';

const DIFF_HEADER_RE = /^diff --git a\/(.*) b\/(.*)$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;
const OLD_FILE_RE = /^--- (.+)$/;
const NEW_FILE_RE = /^\+\+\+ (.+)$/;
const SIMILARITY_RE = /^similarity index (\d+)%$/;
const RENAME_FROM_RE = /^rename from (.+)$/;
const RENAME_TO_RE = /^rename to (.+)$/;
const COPY_FROM_RE = /^copy from (.+)$/;
const COPY_TO_RE = /^copy to (.+)$/;
const OLD_MODE_RE = /^old mode (\d+)$/;
const NEW_MODE_RE = /^new mode (\d+)$/;
const NEW_FILE_MODE_RE = /^new file mode (\d+)$/;
const DELETED_FILE_MODE_RE = /^deleted file mode (\d+)$/;
const BINARY_RE = /^Binary files (.+) and (.+) differ$/;
const NO_NEWLINE_RE = /^\\ No newline at end of file$/;

function stripPrefix(path: string): string {
  if (path === '/dev/null') {
    return path;
  }
  if (path.startsWith('a/') || path.startsWith('b/')) {
    return path.slice(2);
  }
  return path;
}

function attachWordDiffs(hunk: DiffHunk): void {
  const lines = hunk.lines;
  let i = 0;

  while (i < lines.length) {
    if (lines[i].type === 'delete') {
      const deleteStart = i;
      while (i < lines.length && lines[i].type === 'delete') {
        i++;
      }
      const deleteEnd = i;

      const addStart = i;
      while (i < lines.length && lines[i].type === 'add') {
        i++;
      }
      const addEnd = i;

      const deleteCount = deleteEnd - deleteStart;
      const addCount = addEnd - addStart;

      if (deleteCount > 0 && addCount > 0) {
        const pairCount = Math.min(deleteCount, addCount);
        for (let p = 0; p < pairCount; p++) {
          const delLine = lines[deleteStart + p];
          const addLine = lines[addStart + p];
          const segments = computeWordDiff(delLine.content, addLine.content);
          delLine.wordDiff = segments;
          addLine.wordDiff = segments;
        }
      }
    } else {
      i++;
    }
  }
}

export function parseDiff(raw: string): ParsedDiff {
  const lines = raw.split('\n');
  const files: DiffFile[] = [];
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    const diffMatch = line.match(DIFF_HEADER_RE);
    if (diffMatch) {
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = {
        oldPath: diffMatch[1],
        newPath: diffMatch[2],
        status: 'modified',
        hunks: [],
        additions: 0,
        deletions: 0,
        isBinary: false,
      };
      currentHunk = null;
      i++;
      continue;
    }

    if (!currentFile) {
      i++;
      continue;
    }

    const oldModeMatch = line.match(OLD_MODE_RE);
    if (oldModeMatch) {
      currentFile.oldMode = oldModeMatch[1];
      i++;
      continue;
    }

    const newModeMatch = line.match(NEW_MODE_RE);
    if (newModeMatch) {
      currentFile.newMode = newModeMatch[1];
      i++;
      continue;
    }

    const newFileModeMatch = line.match(NEW_FILE_MODE_RE);
    if (newFileModeMatch) {
      currentFile.newMode = newFileModeMatch[1];
      currentFile.status = 'added';
      i++;
      continue;
    }

    const deletedFileModeMatch = line.match(DELETED_FILE_MODE_RE);
    if (deletedFileModeMatch) {
      currentFile.oldMode = deletedFileModeMatch[1];
      currentFile.status = 'deleted';
      i++;
      continue;
    }

    const similarityMatch = line.match(SIMILARITY_RE);
    if (similarityMatch) {
      currentFile.similarityIndex = parseInt(similarityMatch[1], 10);
      i++;
      continue;
    }

    const renameFromMatch = line.match(RENAME_FROM_RE);
    if (renameFromMatch) {
      currentFile.oldPath = renameFromMatch[1];
      currentFile.status = 'renamed';
      i++;
      continue;
    }

    const renameToMatch = line.match(RENAME_TO_RE);
    if (renameToMatch) {
      currentFile.newPath = renameToMatch[1];
      currentFile.status = 'renamed';
      i++;
      continue;
    }

    const copyFromMatch = line.match(COPY_FROM_RE);
    if (copyFromMatch) {
      currentFile.oldPath = copyFromMatch[1];
      currentFile.status = 'copied';
      i++;
      continue;
    }

    const copyToMatch = line.match(COPY_TO_RE);
    if (copyToMatch) {
      currentFile.newPath = copyToMatch[1];
      currentFile.status = 'copied';
      i++;
      continue;
    }

    const oldFileMatch = line.match(OLD_FILE_RE);
    if (oldFileMatch) {
      const path = stripPrefix(oldFileMatch[1]);
      currentFile.oldPath = path;
      if (path === '/dev/null') {
        currentFile.status = 'added';
      }
      i++;
      continue;
    }

    const newFileMatch = line.match(NEW_FILE_RE);
    if (newFileMatch) {
      const path = stripPrefix(newFileMatch[1]);
      currentFile.newPath = path;
      if (path === '/dev/null') {
        currentFile.status = 'deleted';
      }
      i++;
      continue;
    }

    const binaryMatch = line.match(BINARY_RE);
    if (binaryMatch) {
      currentFile.isBinary = true;
      i++;
      continue;
    }

    const hunkMatch = line.match(HUNK_HEADER_RE);
    if (hunkMatch) {
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        context: hunkMatch[5]?.trim() || undefined,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      oldLineNum = currentHunk.oldStart;
      newLineNum = currentHunk.newStart;
      i++;
      continue;
    }

    if (NO_NEWLINE_RE.test(line)) {
      if (currentHunk && currentHunk.lines.length > 0) {
        currentHunk.lines[currentHunk.lines.length - 1].noNewline = true;
      }
      i++;
      continue;
    }

    if (currentHunk) {
      const prefix = line[0];
      const content = line.slice(1);

      if (prefix === '+') {
        const diffLine: DiffLine = {
          type: 'add',
          content,
          oldLineNumber: null,
          newLineNumber: newLineNum,
        };
        currentHunk.lines.push(diffLine);
        currentFile.additions++;
        newLineNum++;
      } else if (prefix === '-') {
        const diffLine: DiffLine = {
          type: 'delete',
          content,
          oldLineNumber: oldLineNum,
          newLineNumber: null,
        };
        currentHunk.lines.push(diffLine);
        currentFile.deletions++;
        oldLineNum++;
      } else if (prefix === ' ') {
        const diffLine: DiffLine = {
          type: 'context',
          content: content || '',
          oldLineNumber: oldLineNum,
          newLineNumber: newLineNum,
        };
        currentHunk.lines.push(diffLine);
        oldLineNum++;
        newLineNum++;
      }
    }

    i++;
  }

  if (currentFile) {
    files.push(currentFile);
  }

  for (const file of files) {
    for (const hunk of file.hunks) {
      attachWordDiffs(hunk);
    }
  }

  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const file of files) {
    totalAdditions += file.additions;
    totalDeletions += file.deletions;
  }

  return {
    files,
    stats: {
      totalAdditions,
      totalDeletions,
      filesChanged: files.length,
    },
  };
}
