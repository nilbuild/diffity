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

/** Word diffs are skipped for longer lines (minified code): tokenising and LCS on them costs seconds. */
export const WORD_DIFF_MAX_LINE_LENGTH = 1000;

/** Pairs below this share of common tokens are different lines, not edits of each other. */
export const WORD_DIFF_MIN_SIMILARITY = 0.4;

/** Blocks with more delete × add combinations than this fall back to pairing by position. */
const MAX_PAIRING_CELLS = 40_000;

const SIMILARITY_TOKEN_RE = /\w+|[^\s\w]/g;

function tokenCounts(content: string): Map<string, number> | null {
  if (content.length > WORD_DIFF_MAX_LINE_LENGTH) {
    return null;
  }
  const tokens = content.match(SIMILARITY_TOKEN_RE);
  if (!tokens) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + token.length);
  }
  return counts;
}

function countTotal(counts: Map<string, number>): number {
  let total = 0;
  for (const count of counts.values()) {
    total += count;
  }
  return total;
}

/** Dice coefficient over the two lines' tokens, weighted by length: 1 for the same tokens, 0 for none in common. */
export function lineSimilarity(a: string, b: string): number {
  const countsA = tokenCounts(a);
  const countsB = tokenCounts(b);
  if (!countsA || !countsB) {
    return 0;
  }
  return bagSimilarity(countsA, countTotal(countsA), countsB, countTotal(countsB));
}

function bagSimilarity(a: Map<string, number>, totalA: number, b: Map<string, number>, totalB: number): number {
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [token, count] of small) {
    const other = large.get(token);
    if (other) {
      shared += Math.min(count, other);
    }
  }
  return (2 * shared) / (totalA + totalB);
}

/**
 * Pairs removed lines with added lines by similarity, keeping both in order (a pair never crosses another).
 * Maximises the summed similarity; pairs below WORD_DIFF_MIN_SIMILARITY are never made.
 * Returns [deleteIndex, addIndex] pairs.
 */
export function pairChangedLines(deleted: string[], added: string[]): Array<[number, number]> {
  const m = deleted.length;
  const n = added.length;
  if (m === 0 || n === 0) {
    return [];
  }

  const delBags = deleted.map(tokenCounts);
  const addBags = added.map(tokenCounts);
  const delTotals = delBags.map(bag => (bag ? countTotal(bag) : 0));
  const addTotals = addBags.map(bag => (bag ? countTotal(bag) : 0));
  const score = (i: number, j: number): number => {
    const a = delBags[i];
    const b = addBags[j];
    if (!a || !b) {
      return 0;
    }
    return bagSimilarity(a, delTotals[i], b, addTotals[j]);
  };

  if (m * n > MAX_PAIRING_CELLS) {
    const pairs: Array<[number, number]> = [];
    for (let p = 0; p < Math.min(m, n); p++) {
      if (score(p, p) >= WORD_DIFF_MIN_SIMILARITY) {
        pairs.push([p, p]);
      }
    }
    return pairs;
  }

  const sim: Float64Array[] = [];
  for (let i = 0; i < m; i++) {
    const row = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      row[j] = score(i, j);
    }
    sim.push(row);
  }

  const best: Float64Array[] = Array.from({ length: m + 1 }, () => new Float64Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      let value = Math.max(best[i - 1][j], best[i][j - 1]);
      const s = sim[i - 1][j - 1];
      if (s >= WORD_DIFF_MIN_SIMILARITY) {
        value = Math.max(value, best[i - 1][j - 1] + s);
      }
      best[i][j] = value;
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    const s = sim[i - 1][j - 1];
    if (s >= WORD_DIFF_MIN_SIMILARITY && best[i][j] === best[i - 1][j - 1] + s) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
      continue;
    }
    if (best[i][j] === best[i - 1][j]) {
      i--;
      continue;
    }
    j--;
  }
  return pairs.reverse();
}

function attachWordDiffs(hunk: DiffHunk): void {
  const lines = hunk.lines;
  let i = 0;

  while (i < lines.length) {
    if (lines[i].type !== 'delete') {
      i++;
      continue;
    }
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

    if (addEnd === addStart) {
      continue;
    }

    const deleted = lines.slice(deleteStart, deleteEnd);
    const added = lines.slice(addStart, addEnd);
    const pairs = pairChangedLines(deleted.map(l => l.content), added.map(l => l.content));
    for (const [d, a] of pairs) {
      const segments = computeWordDiff(deleted[d].content, added[a].content);
      deleted[d].wordDiff = segments;
      added[a].wordDiff = segments;
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
