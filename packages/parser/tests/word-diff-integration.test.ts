import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiff } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, './fixtures', name), 'utf-8');

describe('word diff integration', () => {
  it('attaches word diff to paired delete+add lines', () => {
    const result = parseDiff(fixture('single-file-deletions.diff'));
    const hunk = result.files[0].hunks[0];

    const delLines = hunk.lines.filter(l => l.type === 'delete');
    const addLines = hunk.lines.filter(l => l.type === 'add');

    expect(delLines[0].wordDiff).toBeDefined();
    expect(addLines[0].wordDiff).toBeDefined();
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
});
