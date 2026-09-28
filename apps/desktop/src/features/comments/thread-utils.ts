import { GENERAL_FILE_PATH, type Thread } from '@/lib/types';

export const isOpen = (thread: Thread) => thread.status === 'open';
export const isGeneral = (thread: Thread) => thread.filePath === GENERAL_FILE_PATH;
export const isFileLevel = (thread: Thread) => !isGeneral(thread) && thread.startLine === 0 && thread.endLine === 0;

export function lineLabel(thread: Thread): string {
  if (isGeneral(thread)) {
    return 'General';
  }
  if (isFileLevel(thread)) {
    return 'File';
  }
  const prefix = thread.side === 'old' ? 'L-' : 'L';
  if (thread.startLine === thread.endLine) {
    return `${prefix}${thread.startLine}`;
  }
  return `${prefix}${thread.startLine}–${thread.endLine}`;
}

export function countOpenByFile(threads: Thread[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const thread of threads) {
    if (!isOpen(thread) || isGeneral(thread)) {
      continue;
    }
    counts.set(thread.filePath, (counts.get(thread.filePath) ?? 0) + 1);
  }
  return counts;
}

export function sortThreads(threads: Thread[], fileOrder: string[]): Thread[] {
  const order = new Map(fileOrder.map((path, index) => [path, index]));
  return [...threads].sort((a, b) => {
    const fa = isGeneral(a) ? -1 : (order.get(a.filePath) ?? Number.MAX_SAFE_INTEGER);
    const fb = isGeneral(b) ? -1 : (order.get(b.filePath) ?? Number.MAX_SAFE_INTEGER);
    if (fa !== fb) {
      return fa - fb;
    }
    return a.endLine - b.endLine;
  });
}

export function threadsAsPrompt(threads: Thread[]): string {
  const open = threads.filter(isOpen);
  if (open.length === 0) {
    return '';
  }
  const blocks = open.map((thread, index) => {
    const location = isGeneral(thread)
      ? 'General'
      : isFileLevel(thread)
        ? thread.filePath
        : `${thread.filePath}:${thread.startLine === thread.endLine ? thread.startLine : `${thread.startLine}-${thread.endLine}`}${thread.side === 'old' ? ' (old side)' : ''}`;
    const severity = thread.severity ? ` [${thread.severity}]` : '';
    const comments = thread.comments.map((c) => `   - ${c.authorName}: ${c.body.replace(/\n/g, '\n     ')}`).join('\n');
    return `${index + 1}. ${location}${severity}\n${comments}`;
  });
  return `Please address the following unresolved review comments:\n\n${blocks.join('\n\n')}\n`;
}
