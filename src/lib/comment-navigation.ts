import type { CommentThread } from '../components/comments/types';
import { GENERAL_THREAD_FILE_PATH, isThreadResolved } from '../components/comments/types';
import type { DiffFile } from './diff-parser/types';
import { getFilePath } from './diff-utils';

export function getUnresolvedFileThreads(threads: CommentThread[]): CommentThread[] {
  return threads.filter(
    thread => !isThreadResolved(thread) && thread.filePath !== GENERAL_THREAD_FILE_PATH,
  );
}

export function getThreadLineLabel(thread: CommentThread): string {
  return thread.startLine === thread.endLine
    ? `L${thread.startLine}`
    : `L${thread.startLine}-${thread.endLine}`;
}

/** A thread's place, worded the same in the diff and the Comments panel: "General", "Whole file", "Lines 26–27". */
export function threadLocation(thread: Pick<CommentThread, 'filePath' | 'side' | 'startLine' | 'endLine'>): string | null {
  if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
    return 'General';
  }
  if (thread.filePath.startsWith('__path__:')) {
    return null;
  }
  if (thread.startLine === 0) {
    return 'Whole file';
  }
  const range = thread.startLine === thread.endLine ? `Line ${thread.startLine}` : `Lines ${thread.startLine}–${thread.endLine}`;
  return thread.side === 'old' ? `${range} (old)` : range;
}

export function getThreadPreview(thread: CommentThread, maxLength = 84): string {
  const normalized = (thread.comments.at(-1)?.body ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) {
    return 'Comment';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  const truncated = normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd();
  const lastSpace = truncated.lastIndexOf(' ');
  const cleanCut = lastSpace > Math.floor(maxLength / 2)
    ? truncated.slice(0, lastSpace)
    : truncated;

  return `${cleanCut}...`;
}

export function buildThreadCountsByFile(threads: CommentThread[]): Map<string, number> {
  const counts = new Map<string, number>();

  for (const thread of getUnresolvedFileThreads(threads)) {
    counts.set(thread.filePath, (counts.get(thread.filePath) ?? 0) + 1);
  }

  return counts;
}

function sortThreadsForNavigation(
  threads: CommentThread[],
  fileOrder: string[],
): CommentThread[] {
  const orderIndex = new Map(fileOrder.map((path, index) => [path, index]));

  return [...getUnresolvedFileThreads(threads)].sort((a, b) => {
    const aOrder = orderIndex.get(a.filePath) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = orderIndex.get(b.filePath) ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    if (a.filePath !== b.filePath) {
      return a.filePath.localeCompare(b.filePath);
    }
    if (a.startLine !== b.startLine) {
      return a.startLine - b.startLine;
    }
    if (a.endLine !== b.endLine) {
      return a.endLine - b.endLine;
    }

    return a.id.localeCompare(b.id);
  });
}

export function buildFirstOpenThreadByFile(
  threads: CommentThread[],
  fileOrder: string[],
): Map<string, string> {
  const firstThreadByFile = new Map<string, string>();

  for (const thread of sortThreadsForNavigation(threads, fileOrder)) {
    if (!firstThreadByFile.has(thread.filePath)) {
      firstThreadByFile.set(thread.filePath, thread.id);
    }
  }

  return firstThreadByFile;
}

/** Whether a thread's lines are drawn in this file's hunks (a whole-file thread always is). */
export function isThreadInFile(thread: CommentThread, file: DiffFile): boolean {
  if (thread.startLine === 0) {
    return true;
  }
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const number = thread.side === 'old' ? line.oldLineNumber : line.newLineNumber;
      if (number !== null && number >= thread.startLine && number <= thread.endLine) {
        return true;
      }
    }
  }
  return false;
}

export interface NavigableThread {
  thread: CommentThread;
  /** Shown in the view; otherwise (outdated, or its file isn't in the view) it can only be read in the Comments panel. */
  placed: boolean;
}

/**
 * Every open thread of a view, in reading order: general comments, then the files' threads in the view's file order
 * by line, then the rest (outdated ones, files no longer changed). Without `files` every thread counts as placed.
 */
export function openThreadsInOrder(threads: CommentThread[], files?: DiffFile[]): NavigableThread[] {
  const open = threads.filter((thread) => !isThreadResolved(thread));
  const general = open.filter((thread) => thread.filePath === GENERAL_THREAD_FILE_PATH).map((thread) => ({ thread, placed: true }));
  const rest = open.filter((thread) => thread.filePath !== GENERAL_THREAD_FILE_PATH);
  if (!files) {
    return [...general, ...rest.map((thread) => ({ thread, placed: true }))];
  }
  const byPath = new Map(files.map((file) => [getFilePath(file), file]));
  const sorted = sortThreadsForNavigation(rest, files.map(getFilePath));
  const placed: NavigableThread[] = [];
  const unplaced: NavigableThread[] = [];
  for (const thread of sorted) {
    const file = byPath.get(thread.filePath);
    if (file && isThreadInFile(thread, file)) {
      placed.push({ thread, placed: true });
      continue;
    }
    unplaced.push({ thread, placed: false });
  }
  return [...general, ...placed, ...unplaced];
}
