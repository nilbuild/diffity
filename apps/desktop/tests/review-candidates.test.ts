import { describe, expect, it } from 'vitest';
import {
  disabledReason,
  groupByFile,
  headerLine,
  otherDraftSessions,
  postLabel,
  postedToast,
  selectedItems,
  toCandidateItems,
  type DisabledInput,
} from '../src/features/review/review-candidates';
import type { ReviewCandidate, Thread } from '../src/lib/types';

const PR_REF = 'origin/main...HEAD';

function candidate(id: string, overrides: Partial<Thread> & { draft?: boolean; ref?: string; blocked?: string | null } = {}): ReviewCandidate {
  const { draft = false, ref = PR_REF, blocked = null, ...thread } = overrides;
  return {
    thread: {
      id,
      sessionId: ref === PR_REF ? 'pr' : 'work',
      filePath: 'src/a.ts',
      side: 'new',
      startLine: 3,
      endLine: 5,
      status: 'open',
      severity: null,
      anchorContent: null,
      githubThreadId: null,
      comments: [{ id: `${id}-c`, threadId: id, authorType: 'user', authorName: 'You', body: `body ${id}`, createdAt: '', githubCommentId: null, pending: draft, reviewId: null }],
      createdAt: '',
      updatedAt: '',
      pending: draft,
      reviewId: null,
      ...thread,
    } as Thread,
    sessionRef: ref,
    draft,
    blockedReason: blocked,
  };
}

const base: DisabledInput = {
  postToGitHub: true,
  sendClaude: false,
  draftCount: 0,
  selectedCount: 0,
  postableCount: 0,
  blockedCount: 0,
  hasBody: false,
  verdict: 'comment',
  loading: false,
  blocker: null,
  needsPendingChoice: false,
  claudeHasWork: false,
  claudeProblem: null,
};

describe('candidate items', () => {
  const items = toCandidateItems(
    [
      candidate('draft', { draft: true }),
      candidate('local'),
      candidate('work', { ref: 'work', filePath: 'src/b.ts', startLine: 7, endLine: 7 }),
      candidate('general', { filePath: '__general__', startLine: 0, endLine: 0 }),
      candidate('outside', { blocked: "Can't be posted: line isn't part of the PR diff" }),
    ],
    PR_REF,
  );

  it('selects drafts and local comments by default, never blocked ones', () => {
    expect(selectedItems(items, new Set()).map((i) => i.id)).toEqual(['draft', 'local', 'work', 'general']);
    expect(selectedItems(items, new Set(['local'])).map((i) => i.id)).toEqual(['draft', 'work', 'general']);
  });

  it('labels locations and other views', () => {
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(byId.draft.location).toBe('L3–5');
    expect(byId.work.location).toBe('L7');
    expect(byId.work.viewLabel).toBe('Uncommitted changes');
    expect(byId.local.viewLabel).toBeNull();
    expect(byId.general.location).toBe('General');
  });

  it('groups by file with general comments first', () => {
    expect(groupByFile(items).map(([file, group]) => [file, group.length])).toEqual([
      ['General comments', 1],
      ['src/a.ts', 3],
      ['src/b.ts', 1],
    ]);
  });

  it('submits drafts of other views first', () => {
    const drafts = toCandidateItems([candidate('d1', { draft: true, ref: 'work' }), candidate('d2', { draft: true })], PR_REF);
    expect(otherDraftSessions(drafts, 'pr')).toEqual(['work']);
  });

  it('counts in the header', () => {
    expect(headerLine(3, 0, false)).toBe('3 comments will be posted');
    expect(headerLine(1, 2, false)).toBe("1 comment will be posted · 2 can't be posted");
    expect(headerLine(0, 0, false)).toBe('No comments selected');
  });
});

describe('post button', () => {
  it('enables with a selected comment, a summary or a verdict', () => {
    expect(disabledReason({ ...base, selectedCount: 1, postableCount: 1 })).toBeNull();
    expect(disabledReason({ ...base, hasBody: true })).toBeNull();
    expect(disabledReason({ ...base, verdict: 'approve' })).toBeNull();
  });

  it('says what is missing', () => {
    expect(disabledReason(base)).toMatch(/^No comments to post yet/);
    expect(disabledReason({ ...base, postableCount: 2 })).toMatch(/^Select at least one comment/);
    expect(disabledReason({ ...base, blockedCount: 2 })).toMatch(/^None of your comments can be posted/);
    expect(disabledReason({ ...base, loading: true })).toBe('Checking which comments can be posted…');
    expect(disabledReason({ ...base, selectedCount: 1, blocker: 'Your local branch is at abc' })).toBe('Your local branch is at abc');
    expect(disabledReason({ ...base, selectedCount: 1, needsPendingChoice: true })).toBe('Choose what to do with your pending review on GitHub.');
  });

  it('local-only submit keeps the old rules', () => {
    expect(disabledReason({ ...base, postToGitHub: false })).toBe('Choose where the review goes: GitHub, Claude, or both.');
    expect(disabledReason({ ...base, postToGitHub: false, draftCount: 2 })).toBeNull();
  });

  it('labels', () => {
    expect(postLabel(145, 'comment', 3)).toBe('Post 3 comments to #145');
    expect(postLabel(145, 'comment', 0)).toBe('Post review to #145');
    expect(postLabel(145, 'approve', 2)).toBe('Approve #145');
  });
});

describe('posted toast', () => {
  it('reports what was posted', () => {
    const result = { pushed: 3, skipped: 0, failed: 0, errors: [], postedThreadIds: ['a', 'b', 'c'] };
    expect(postedToast(145, 'comment', result).title).toBe('Posted 3 comments to #145');
    expect(postedToast(145, 'requestChanges', result).title).toBe('Requested changes on #145 with 3 comments');
    expect(postedToast(145, 'comment', { ...result, postedThreadIds: [] }).title).toBe('Posted review to #145');
  });

  it('marks dry runs and lists skipped comments', () => {
    const toast = postedToast(145, 'comment', { pushed: 6, skipped: 1, failed: 0, errors: ['a.ts:9 — outside'], dryRun: true });
    expect(toast.title).toBe('Dry run: 6 comments for #145 not sent');
    expect(toast.description).toContain('a.ts:9 — outside');
  });
});
