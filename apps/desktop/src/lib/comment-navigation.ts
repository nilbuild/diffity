import type { CommentThread } from '../components/comments/types';
import { GENERAL_THREAD_FILE_PATH, isThreadResolved } from '../components/comments/types';

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
