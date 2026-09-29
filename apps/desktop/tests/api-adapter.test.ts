import { describe, it, expect } from 'vitest';
import { commitRef, descriptionForRef, parseGitHubRemote, toCommentThread } from '../src/lib/api';
import type { Thread } from '../src/lib/types';

describe('descriptionForRef', () => {
  it('labels working tree refs like the web app', () => {
    expect(descriptionForRef('work')).toBe('Uncommitted changes');
    expect(descriptionForRef('staged')).toBe('Staged changes');
    expect(descriptionForRef('unstaged')).toBe('Unstaged changes');
  });

  it('labels commits, ranges and single refs', () => {
    expect(descriptionForRef(commitRef('abcdef1234567'))).toBe('Commit abcdef1');
    expect(descriptionForRef('main...HEAD')).toBe('main...HEAD');
    expect(descriptionForRef('HEAD~3')).toBe('Changes since HEAD~3');
  });
});

describe('parseGitHubRemote', () => {
  it('parses https and ssh remotes', () => {
    expect(parseGitHubRemote('https://github.com/kamranahmedse/diffity.git')).toEqual({ owner: 'kamranahmedse', repo: 'diffity' });
    expect(parseGitHubRemote('git@github.com:owner/name.git')).toEqual({ owner: 'owner', repo: 'name' });
  });

  it('ignores other hosts', () => {
    expect(parseGitHubRemote('git@gitlab.com:owner/name.git')).toBeNull();
    expect(parseGitHubRemote(null)).toBeNull();
  });
});

describe('toCommentThread', () => {
  it('maps backend threads to the web UI shape', () => {
    const thread: Thread = {
      id: 't1',
      sessionId: 's1',
      filePath: 'src/a.ts',
      side: 'new',
      startLine: 3,
      endLine: 4,
      status: 'open',
      severity: null,
      anchorContent: null,
      githubThreadId: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      pending: true,
      reviewId: 'r1',
      comments: [
        {
          id: 'c1',
          threadId: 't1',
          authorType: 'agent',
          authorName: 'Claude Code',
          body: 'hi',
          createdAt: '2026-01-01T00:00:00Z',
          githubCommentId: null,
          pending: true,
          reviewId: 'r1',
          mentionsAgent: false,
        },
      ],
    };
    const mapped = toCommentThread(thread);
    expect(mapped.comments[0].author).toEqual({ name: 'Claude Code', type: 'agent' });
    expect(mapped.anchorContent).toBeUndefined();
    expect(mapped.pending).toBe(true);
    expect(mapped.sessionId).toBe('s1');
  });
});
