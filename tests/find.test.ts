import { describe, expect, it } from 'vitest';
import type { DiffFile, DiffLine } from '@/lib/diff-parser';
import { carryCurrent, diffFindLines, fileFindLines, firstMatchFrom, searchLines } from '../src/lib/find';

function line(type: DiffLine['type'], content: string, oldLineNumber: number | null, newLineNumber: number | null): DiffLine {
  return { type, content, oldLineNumber, newLineNumber };
}

function file(path: string, lines: DiffLine[], extra: Partial<DiffFile> = {}): DiffFile {
  return {
    oldPath: path,
    newPath: path,
    status: 'modified',
    hunks: [{ header: '', oldStart: 1, oldCount: 0, newStart: 1, newCount: 0, lines }],
    additions: 0,
    deletions: 0,
    isBinary: false,
    ...extra,
  };
}

const files = [
  file('a.ts', [line('context', 'const Foo = 1;', 1, 1), line('delete', 'foo(foo)', 2, null), line('add', 'bar()', null, 2)]),
  file('b.ts', [line('add', 'FOO', null, 1)]),
  file('gone.ts', [line('delete', 'foo', 1, null)], { status: 'deleted', newPath: '/dev/null' }),
];

describe('diffFindLines', () => {
  it('indexes every hunk line with its file and rendered row key, in diff order', () => {
    expect(diffFindLines(files)).toEqual([
      { scope: 'a.ts', key: 'context-1', text: 'const Foo = 1;' },
      { scope: 'a.ts', key: 'delete-2', text: 'foo(foo)' },
      { scope: 'a.ts', key: 'add-2', text: 'bar()' },
      { scope: 'b.ts', key: 'add-1', text: 'FOO' },
      { scope: 'gone.ts', key: 'delete-1', text: 'foo' },
    ]);
  });

  it('includes files a reader has collapsed or not loaded yet: it searches the data', () => {
    const collapsedOrHeldBack = file('yarn.lock', [line('add', 'foo@1.0.0', null, 1)]);
    expect(searchLines(diffFindLines([collapsedOrHeldBack]), 'foo', { caseSensitive: false }).matches).toHaveLength(1);
  });
});

describe('searchLines', () => {
  const lines = diffFindLines(files);

  it('is case-insensitive by default and finds every occurrence on a line', () => {
    const { matches, truncated } = searchLines(lines, 'foo', { caseSensitive: false });
    expect(truncated).toBe(false);
    expect(matches.map((m) => [m.scope, m.key, m.start, m.end])).toEqual([
      ['a.ts', 'context-1', 6, 9],
      ['a.ts', 'delete-2', 0, 3],
      ['a.ts', 'delete-2', 4, 7],
      ['b.ts', 'add-1', 0, 3],
      ['gone.ts', 'delete-1', 0, 3],
    ]);
  });

  it('matches case when asked', () => {
    expect(searchLines(lines, 'FOO', { caseSensitive: true }).matches.map((m) => m.scope)).toEqual(['b.ts']);
  });

  it('treats the query as plain text', () => {
    expect(searchLines(lines, 'foo(', { caseSensitive: false }).matches).toHaveLength(1);
    expect(searchLines(lines, '.*', { caseSensitive: false }).matches).toHaveLength(0);
  });

  it('returns nothing for an empty query', () => {
    expect(searchLines(lines, '', { caseSensitive: false }).matches).toEqual([]);
  });

  it('caps the matches and says so', () => {
    const many = fileFindLines('big.txt', Array.from({ length: 100 }, () => 'aaaa'));
    const result = searchLines(many, 'a', { caseSensitive: false }, 50);
    expect(result.matches).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it('matches whole words only when asked', () => {
    const words = fileFindLines('w.ts', ['foo foobar barfoo foo_x (foo)']);
    const found = searchLines(words, 'foo', { caseSensitive: false, wholeWord: true }).matches;
    expect(found.map((m) => words[0].text.slice(m.start, m.end))).toEqual(['foo', 'foo']);
    expect(found.map((m) => m.start)).toEqual([0, 25]);
  });

  it('searches with a regular expression and reports a bad one', () => {
    const code = fileFindLines('r.ts', ['let a1 = 1; let b22 = 2;']);
    const found = searchLines(code, '[a-z]\\d+', { caseSensitive: false, regex: true }).matches;
    expect(found.map((m) => code[0].text.slice(m.start, m.end))).toEqual(['a1', 'b22']);
    expect(searchLines(code, '^', { caseSensitive: false, regex: true }).matches).toEqual([]);
    const bad = searchLines(code, 'foo(', { caseSensitive: false, regex: true });
    expect(bad.matches).toEqual([]);
    expect(bad.error).toMatch(/group/i);
  });

  it('keeps offsets right when lowercasing changes a line’s length', () => {
    const tricky = fileFindLines('x', ['İstanbul foo']);
    const [match] = searchLines(tricky, 'FOO', { caseSensitive: false }).matches;
    expect(tricky[0].text.slice(match.start, match.end)).toBe('foo');
  });
});

describe('position helpers', () => {
  const lines = diffFindLines(files);
  const { matches } = searchLines(lines, 'foo', { caseSensitive: false });

  it('starts from the file being read', () => {
    expect(firstMatchFrom(lines, matches, 'b.ts')).toBe(3);
    expect(firstMatchFrom(lines, matches, null)).toBe(0);
    expect(firstMatchFrom(lines, matches, 'missing.ts')).toBe(0);
  });

  it('keeps the current match across a refreshed result', () => {
    const refreshed = searchLines(diffFindLines(files.slice(1)), 'foo', { caseSensitive: false }).matches;
    expect(carryCurrent(matches[3], refreshed)).toBe(0);
    expect(carryCurrent(matches[0], refreshed)).toBe(-1);
  });
});
