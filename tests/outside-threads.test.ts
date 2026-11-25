import { describe, expect, it } from 'vitest';
import { threadsOutside } from '../src/components/comments/outside-threads';
import type { CommentThread } from '../src/components/comments/types';

function thread(id: string, filePath: string, status: CommentThread['status'] = 'open'): CommentThread {
  return { id, filePath, side: 'new', startLine: 1, endLine: 1, comments: [], status };
}

describe('threadsOutside', () => {
  const threads = [thread('a', 'kept.ts'), thread('b', 'gone.ts'), thread('c', '__general__'), thread('d', 'gone.ts', 'resolved')];

  it('counts open comments on files the view no longer changes', () => {
    expect(threadsOutside(threads, new Set(['kept.ts'])).map((item) => item.id)).toEqual(['b']);
  });

  it('never counts general comments, even when the view has no changes left', () => {
    expect(threadsOutside(threads, null).map((item) => item.id)).toEqual(['a', 'b']);
  });
});
