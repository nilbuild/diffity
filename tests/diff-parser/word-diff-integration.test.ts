import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiff } from '../../src/lib/diff-parser/index.js';
import { lineSimilarity, pairChangedLines } from '../../src/lib/diff-parser/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, './fixtures', name), 'utf-8');

describe('word diff integration', () => {
  it('attaches word diff to paired delete+add lines', () => {
    const result = parseDiff(fixture('single-file-deletions.diff'));
    const hunk = result.files[0].hunks[0];

    const delLines = hunk.lines.filter(l => l.type === 'delete');
    const addLines = hunk.lines.filter(l => l.type === 'add');

    expect(delLines[0].wordDiff).toBeUndefined();
    expect(delLines[2].wordDiff).toBeDefined();
    expect(addLines[0].wordDiff).toBe(delLines[2].wordDiff);
  });

  it('does not attach word diff to pure additions', () => {
    const result = parseDiff(fixture('single-file-additions.diff'));
    const hunk = result.files[0].hunks[0];
    const addLines = hunk.lines.filter(l => l.type === 'add');

    for (const line of addLines) {
      expect(line.wordDiff).toBeUndefined();
    }
  });

  it('pairs consecutive delete+add sequences for word diff', () => {
    const result = parseDiff(fixture('single-file-mixed.diff'));
    const hunk = result.files[0].hunks[0];

    const lines = hunk.lines;
    const portDel = lines.find(
      l => l.type === 'delete' && l.content.includes('3000')
    );
    const portAdd = lines.find(
      l => l.type === 'add' && l.content.includes('8080')
    );

    expect(portDel?.wordDiff).toBeDefined();
    expect(portAdd?.wordDiff).toBeDefined();

    const portDelSegments = portDel!.wordDiff!;
    const hasDelete = portDelSegments.some(s => s.type === 'delete');
    expect(hasDelete).toBe(true);
  });

  it('pairs lines by similarity, not position', () => {
    const raw = [
      'diff --git a/src/utils/format.ts b/src/utils/format.ts',
      '--- a/src/utils/format.ts',
      '+++ b/src/utils/format.ts',
      '@@ -9,2 +9,3 @@',
      '-  return `${value.toFixed(1)} ${UNITS[unit]}`;',
      '+  const digits = unit === 0 ? 0 : 1;',
      '+  return `${value.toFixed(digits)} ${UNITS[unit]}`;',
      ' }',
      '',
    ].join('\n');
    const lines = parseDiff(raw).files[0].hunks[0].lines;
    const [removed, digits, added] = lines;

    expect(digits.wordDiff).toBeUndefined();
    expect(removed.wordDiff).toBeDefined();
    expect(added.wordDiff).toBe(removed.wordDiff);
    expect(removed.wordDiff!.filter(s => s.type === 'delete').map(s => s.text)).toEqual(['1']);
    expect(added.wordDiff!.filter(s => s.type === 'insert').map(s => s.text)).toEqual(['digits']);
  });

  it('skips word highlights for lines with little in common', () => {
    const raw = [
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -1,1 +1,1 @@',
      "-  console.log('adding', a, b);",
      '+  throw new Error(message);',
      '',
    ].join('\n');
    const lines = parseDiff(raw).files[0].hunks[0].lines;

    expect(lines[0].wordDiff).toBeUndefined();
    expect(lines[1].wordDiff).toBeUndefined();
  });

  it('keeps pairs in order', () => {
    const pairs = pairChangedLines(
      ['const a = 1;', 'const b = 2;', 'const c = 3;'],
      ['let x = 9;', 'const b = 20;', 'const c = 30;'],
    );
    for (let k = 1; k < pairs.length; k++) {
      expect(pairs[k][0]).toBeGreaterThan(pairs[k - 1][0]);
      expect(pairs[k][1]).toBeGreaterThan(pairs[k - 1][1]);
    }
    expect(pairs).toContainEqual([1, 1]);
    expect(pairs).toContainEqual([2, 2]);
  });

  it('scores similarity from shared tokens', () => {
    expect(lineSimilarity('return a + b;', 'return a + b;')).toBe(1);
    expect(lineSimilarity('foo', 'bar')).toBe(0);
    expect(lineSimilarity('', 'bar')).toBe(0);
  });

  it('skips lines over the length limit', () => {
    const long = 'x'.repeat(1001);
    expect(pairChangedLines([long], [long])).toEqual([]);
  });
});
