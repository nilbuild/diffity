import { describe, expect, it } from 'vitest';
import { threadPath, viewLabel } from '../src/lib/thread-location';
import { groupThreads } from '../src/lib/repo-thread-groups';
import type { RepoThread } from '../src/lib/types';

function thread(partial: Partial<RepoThread>): RepoThread {
  return {
    id: 't',
    sessionId: 's',
    ref: 'work',
    refLabel: 'Uncommitted changes',
    filePath: 'a.ts',
    side: 'new',
    startLine: 1,
    endLine: 1,
    status: 'open',
    severity: null,
    anchorContent: null,
    authorType: 'agent',
    authorName: 'Claude Code',
    excerpt: 'x',
    replyCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    pending: false,
    anchor: 'current',
    movedTo: null,
    ...partial,
  };
}

describe('threadPath', () => {
  it('opens diff views with the thread', () => {
    expect(threadPath('/r/x', { ref: 'work', threadId: 'abc' })).toBe('/r/%2Fr%2Fx/diff?ref=work&thread=abc');
    expect(threadPath('/p', { ref: 'main...HEAD' })).toBe('/r/%2Fp/diff?ref=main...HEAD');
  });

  it('opens the file browser for tree threads', () => {
    expect(threadPath('/p', { ref: '__tree__', threadId: 't1' })).toBe('/r/%2Fp/tree?thread=t1');
    expect(threadPath('/p', { ref: '__tree__' })).toBe('/r/%2Fp/tree');
  });
});

describe('viewLabel', () => {
  it('labels refs', () => {
    expect(viewLabel('work')).toBe('Uncommitted changes');
    expect(viewLabel('__tree__')).toBe('Files');
    expect(viewLabel('abcdef1234~1..abcdef1234')).toBe('Commit abcdef1');
    expect(viewLabel('main...feature')).toBe('main...feature');
  });
});

describe('groupThreads', () => {
  it('puts the current view first, then the most recent, files sorted with general first', () => {
    const groups = groupThreads(
      [
        thread({ id: '1', ref: 'old', refLabel: 'Old', updatedAt: '2026-01-01T00:00:00Z' }),
        thread({ id: '2', ref: 'new', refLabel: 'New', updatedAt: '2026-03-01T00:00:00Z', filePath: 'b.ts' }),
        thread({ id: '3', ref: 'new', refLabel: 'New', updatedAt: '2026-02-01T00:00:00Z', filePath: '__general__' }),
        thread({ id: '4', ref: 'work', updatedAt: '2025-01-01T00:00:00Z' }),
      ],
      'work',
    );
    expect(groups.map((group) => group.ref)).toEqual(['work', 'new', 'old']);
    expect(groups[1].files.map((file) => file.path)).toEqual(['__general__', 'b.ts']);
    expect(groups[1].count).toBe(2);
  });
});
