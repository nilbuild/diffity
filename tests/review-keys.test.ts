import { describe, expect, it } from 'vitest';
import { reviewKeyAction } from '../src/lib/review-keys';
import { stepIndex } from '../src/lib/current-thread';
import { SHORTCUT_SECTIONS, withAgent } from '../src/lib/shortcuts';
import { clearDraft, draftKey, readDraft, writeDraft } from '../src/features/claude/agent-drafts';

const key = (value: string, mods: Partial<{ shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {}) => ({
  key: value,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mods,
});

describe('reviewKeyAction', () => {
  it('maps the review-loop keys', () => {
    expect(reviewKeyAction(key('R', { shiftKey: true }))).toBe('reply');
    expect(reviewKeyAction(key('e'))).toBe('resolve');
    expect(reviewKeyAction(key('a'))).toBe('ask');
    expect(reviewKeyAction(key('}', { shiftKey: true }))).toBe('next');
    expect(reviewKeyAction(key('{', { shiftKey: true }))).toBe('previous');
    expect(reviewKeyAction(key('Enter', { shiftKey: true, metaKey: true }))).toBe('review');
    expect(reviewKeyAction(key('Enter', { shiftKey: true, ctrlKey: true }))).toBe('review');
  });

  it('leaves keys other handlers own alone', () => {
    expect(reviewKeyAction(key('r'))).toBe(null);
    expect(reviewKeyAction(key(']'))).toBe(null);
    expect(reviewKeyAction(key('['))).toBe(null);
    expect(reviewKeyAction(key('E', { shiftKey: true, metaKey: true }))).toBe(null);
    expect(reviewKeyAction(key('}', { shiftKey: true, metaKey: true }))).toBe(null);
    expect(reviewKeyAction(key('Enter', { metaKey: true }))).toBe(null);
    expect(reviewKeyAction(key('a', { altKey: true }))).toBe(null);
  });
});

describe('stepIndex', () => {
  it('steps from the current thread and wraps', () => {
    expect(stepIndex(3, 0, 0, 1)).toBe(1);
    expect(stepIndex(3, 2, 2, 1)).toBe(0);
    expect(stepIndex(3, 0, 0, -1)).toBe(2);
    expect(stepIndex(0, -1, -1, 1)).toBe(-1);
  });

  it('starts at either end with no current thread', () => {
    expect(stepIndex(3, -1, -1, 1)).toBe(0);
    expect(stepIndex(3, -1, -1, -1)).toBe(2);
  });

  it('lands on the thread that took the place of one just resolved', () => {
    expect(stepIndex(2, -1, 1, 1)).toBe(1);
    expect(stepIndex(2, -1, 1, -1)).toBe(0);
    expect(stepIndex(2, -1, 2, 1)).toBe(0);
  });
});

describe('withAgent', () => {
  it('names the picked agent in the shortcut rows', () => {
    const rows = withAgent(SHORTCUT_SECTIONS, { short: 'Codex', handle: 'codex' }).flatMap((section) => section.shortcuts);
    expect(rows.some((row) => row.label === 'Ask Codex in a comment' && row.keys[0] === '@codex')).toBe(true);
    expect(rows.some((row) => /\{agent\}|\{handle\}|Claude/.test(`${row.label} ${row.keys.join(' ')}`))).toBe(false);
  });
});

describe('agent drafts', () => {
  it('keeps text per project, view and field until cleared', () => {
    const note = draftKey('note', '/r', 'work');
    const other = draftKey('note', '/r', 'main..HEAD');
    const instructions = draftKey('instructions', '/r', 'work');
    writeDraft(note, 'also check the tests');
    expect(readDraft(note)).toBe('also check the tests');
    expect(readDraft(other)).toBe('');
    expect(readDraft(instructions)).toBe('');
    clearDraft(note);
    expect(readDraft(note)).toBe('');
  });
});
