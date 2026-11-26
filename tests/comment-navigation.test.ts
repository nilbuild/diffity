import { describe, expect, it } from 'vitest';
import type { CommentThread } from '../src/components/comments/types';
import {
  buildFirstOpenThreadByFile,
  buildThreadCountsByFile,
  getThreadLineLabel,
  getThreadPreview,
  openThreadsInOrder,
  threadLocation,
} from '../src/lib/comment-navigation';

function makeThread(overrides: Partial<CommentThread> = {}): CommentThread {
  return {
    id: 'thread-1',
    filePath: 'src/example.ts',
    side: 'new',
    startLine: 10,
    endLine: 10,
    comments: [
      {
        id: 'comment-1',
        author: { name: 'You', type: 'user' },
        body: 'Please tighten this up a bit.',
        createdAt: '2026-03-17T12:00:00Z',
      },
    ],
    status: 'open',
    ...overrides,
  };
}

describe('buildFirstOpenThreadByFile', () => {
  it('picks the first unresolved thread in diff order and then by line', () => {
    const firstThreads = buildFirstOpenThreadByFile(
      [
        makeThread({ id: 'resolved', filePath: 'src/ignored.ts', status: 'resolved' }),
        makeThread({ id: 'general', filePath: '__general__' }),
        makeThread({ id: 'b-20', filePath: 'src/b.ts', startLine: 20 }),
        makeThread({ id: 'a-12', filePath: 'src/a.ts', startLine: 12, side: 'old' }),
        makeThread({ id: 'a-5', filePath: 'src/a.ts', startLine: 5 }),
      ],
      ['src/b.ts', 'src/a.ts'],
    );

    expect(Array.from(firstThreads.entries())).toEqual([
      ['src/b.ts', 'b-20'],
      ['src/a.ts', 'a-5'],
    ]);
  });
});

describe('buildThreadCountsByFile', () => {
  it('counts unresolved file threads only', () => {
    const counts = buildThreadCountsByFile([
      makeThread({ id: 'one', filePath: 'src/a.ts' }),
      makeThread({ id: 'two', filePath: 'src/a.ts' }),
      makeThread({ id: 'resolved', filePath: 'src/b.ts', status: 'resolved' }),
      makeThread({ id: 'general', filePath: '__general__' }),
    ]);

    expect(Array.from(counts.entries())).toEqual([['src/a.ts', 2]]);
  });
});

describe('thread formatting helpers', () => {
  it('formats single-line and multi-line labels', () => {
    expect(getThreadLineLabel(makeThread({ startLine: 7, endLine: 7 }))).toBe('L7');
    expect(getThreadLineLabel(makeThread({ startLine: 7, endLine: 10 }))).toBe('L7-10');
  });

  it('normalizes whitespace and truncates previews', () => {
    const preview = getThreadPreview(
      makeThread({
        comments: [
          {
            id: 'comment-1',
            author: { name: 'You', type: 'user' },
            body: '  Multi-line\ncomment with   extra spacing and enough text to force truncation in the preview list.  ',
            createdAt: '2026-03-17T12:00:00Z',
          },
        ],
      }),
      48,
    );

    expect(preview).toBe('Multi-line comment with extra spacing and...');
  });
});

describe('openThreadsInOrder', () => {
  const file = (path: string, newLines: number[], status: 'modified' | 'added' = 'modified') => ({
    oldPath: path,
    newPath: path,
    status,
    additions: newLines.length,
    deletions: 0,
    isBinary: false,
    hunks: [{
      header: '',
      oldStart: 1,
      oldCount: 0,
      newStart: newLines[0] ?? 1,
      newCount: newLines.length,
      lines: newLines.map((line) => ({ type: 'add' as const, content: '', oldLineNumber: null, newLineNumber: line })),
    }],
  });

  it('counts general and outdated threads too, general first and unplaced last', () => {
    const ordered = openThreadsInOrder(
      [
        makeThread({ id: 'gone', filePath: 'src/gone.ts' }),
        makeThread({ id: 'b-3', filePath: 'src/b.ts', startLine: 3, endLine: 3 }),
        makeThread({ id: 'stale', filePath: 'src/a.ts', startLine: 90, endLine: 91 }),
        makeThread({ id: 'general', filePath: '__general__', startLine: 0, endLine: 0 }),
        makeThread({ id: 'a-2', filePath: 'src/a.ts', startLine: 2, endLine: 2 }),
        makeThread({ id: 'resolved', filePath: 'src/a.ts', startLine: 2, endLine: 2, status: 'resolved' }),
        makeThread({ id: 'whole', filePath: 'src/b.ts', startLine: 0, endLine: 0 }),
      ],
      [file('src/a.ts', [1, 2, 3]), file('src/b.ts', [3])],
    );

    expect(ordered.map((entry) => [entry.thread.id, entry.placed])).toEqual([
      ['general', true],
      ['a-2', true],
      ['whole', true],
      ['b-3', true],
      ['stale', false],
      ['gone', false],
    ]);
  });

  it('treats every thread as placed without the diff', () => {
    const ordered = openThreadsInOrder([makeThread({ id: 'one' }), makeThread({ id: 'general', filePath: '__general__' })]);

    expect(ordered.map((entry) => [entry.thread.id, entry.placed])).toEqual([
      ['general', true],
      ['one', true],
    ]);
  });
});

describe('threadLocation', () => {
  it('words a thread the same in the diff and the panel', () => {
    expect(threadLocation(makeThread({ filePath: '__general__', startLine: 0, endLine: 0 }))).toBe('General');
    expect(threadLocation(makeThread({ startLine: 0, endLine: 0 }))).toBe('Whole file');
    expect(threadLocation(makeThread({ startLine: 26, endLine: 27 }))).toBe('Lines 26–27');
    expect(threadLocation(makeThread({ startLine: 48, endLine: 48, side: 'old' }))).toBe('Line 48 (old)');
    expect(threadLocation(makeThread({ filePath: '__path__:src' }))).toBeNull();
  });
});
