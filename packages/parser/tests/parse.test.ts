import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDiff } from '../src/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) =>
  readFileSync(resolve(__dirname, './fixtures', name), 'utf-8');

describe('parseDiff', () => {
  describe('basic formats', () => {
    it('parses single file with additions only', () => {
      const result = parseDiff(fixture('single-file-additions.diff'));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].oldPath).toBe('hello.ts');
      expect(result.files[0].newPath).toBe('hello.ts');
      expect(result.files[0].status).toBe('modified');
      expect(result.files[0].hunks).toHaveLength(1);

      const hunk = result.files[0].hunks[0];
      expect(hunk.oldStart).toBe(1);
      expect(hunk.oldCount).toBe(3);
      expect(hunk.newStart).toBe(1);
      expect(hunk.newCount).toBe(6);

      const addLines = hunk.lines.filter(l => l.type === 'add');
      expect(addLines).toHaveLength(3);
      expect(addLines[0].content).toBe("const name = 'world';");
      expect(addLines[0].newLineNumber).toBe(2);
      expect(addLines[0].oldLineNumber).toBeNull();

      const contextLines = hunk.lines.filter(l => l.type === 'context');
      expect(contextLines).toHaveLength(3);
      expect(contextLines[0].oldLineNumber).toBe(1);
      expect(contextLines[0].newLineNumber).toBe(1);

      expect(result.files[0].additions).toBe(3);
      expect(result.files[0].deletions).toBe(0);
    });

    it('parses single file with deletions', () => {
      const result = parseDiff(fixture('single-file-deletions.diff'));

      expect(result.files).toHaveLength(1);
      const hunk = result.files[0].hunks[0];
      const delLines = hunk.lines.filter(l => l.type === 'delete');
      expect(delLines).toHaveLength(3);
      expect(delLines[0].content).toBe("  console.log('adding', a, b);");
      expect(delLines[0].oldLineNumber).toBe(2);
      expect(delLines[0].newLineNumber).toBeNull();

      expect(result.files[0].additions).toBe(1);
      expect(result.files[0].deletions).toBe(3);
    });

    it('parses single file with mixed changes', () => {
      const result = parseDiff(fixture('single-file-mixed.diff'));

      expect(result.files).toHaveLength(1);
      const hunk = result.files[0].hunks[0];

      expect(hunk.lines.filter(l => l.type === 'add')).toHaveLength(3);
      expect(hunk.lines.filter(l => l.type === 'delete')).toHaveLength(2);
      expect(hunk.lines.filter(l => l.type === 'context')).toHaveLength(5);

      expect(result.files[0].additions).toBe(3);
      expect(result.files[0].deletions).toBe(2);
    });

    it('parses single file with multiple hunks', () => {
      const result = parseDiff(fixture('single-file-multi-hunk.diff'));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].hunks).toHaveLength(2);

      expect(result.files[0].hunks[0].oldStart).toBe(1);
      expect(result.files[0].hunks[0].newStart).toBe(1);
      expect(result.files[0].hunks[1].oldStart).toBe(20);
      expect(result.files[0].hunks[1].newStart).toBe(20);
    });

    it('parses multiple files', () => {
      const result = parseDiff(fixture('multi-file.diff'));

      expect(result.files).toHaveLength(2);
      expect(result.files[0].newPath).toBe('index.ts');
      expect(result.files[1].newPath).toBe('runner.ts');

      expect(result.stats.filesChanged).toBe(2);
      expect(result.stats.totalAdditions).toBe(
        result.files[0].additions + result.files[1].additions
      );
      expect(result.stats.totalDeletions).toBe(
        result.files[0].deletions + result.files[1].deletions
      );
    });

    it('parses empty diff', () => {
      const result = parseDiff(fixture('empty.diff'));

      expect(result.files).toHaveLength(0);
      expect(result.stats.filesChanged).toBe(0);
      expect(result.stats.totalAdditions).toBe(0);
      expect(result.stats.totalDeletions).toBe(0);
    });
  });

  describe('hunk header parsing', () => {
    it('parses standard hunk header', () => {
      const result = parseDiff(fixture('single-file-additions.diff'));
      const hunk = result.files[0].hunks[0];

      expect(hunk.oldStart).toBe(1);
      expect(hunk.oldCount).toBe(3);
      expect(hunk.newStart).toBe(1);
      expect(hunk.newCount).toBe(6);
    });

    it('parses hunk header with function context', () => {
      const result = parseDiff(fixture('hunk-with-context.diff'));
      const hunk = result.files[0].hunks[0];

      expect(hunk.oldStart).toBe(10);
      expect(hunk.oldCount).toBe(5);
      expect(hunk.newStart).toBe(10);
      expect(hunk.newCount).toBe(7);
      expect(hunk.context).toBe('function processData() {');
    });

    it('parses new file hunk header with 0,0', () => {
      const result = parseDiff(fixture('new-file.diff'));
      const hunk = result.files[0].hunks[0];

      expect(hunk.oldStart).toBe(0);
      expect(hunk.oldCount).toBe(0);
      expect(hunk.newStart).toBe(1);
      expect(hunk.newCount).toBe(3);
    });
  });

  describe('line number assignment', () => {
    it('assigns correct line numbers to context lines', () => {
      const result = parseDiff(fixture('single-file-additions.diff'));
      const contextLines = result.files[0].hunks[0].lines.filter(
        l => l.type === 'context'
      );

      expect(contextLines[0].oldLineNumber).toBe(1);
      expect(contextLines[0].newLineNumber).toBe(1);
    });

    it('assigns correct line numbers to addition lines', () => {
      const result = parseDiff(fixture('single-file-additions.diff'));
      const addLines = result.files[0].hunks[0].lines.filter(
        l => l.type === 'add'
      );

      expect(addLines[0].oldLineNumber).toBeNull();
      expect(addLines[0].newLineNumber).toBe(2);
      expect(addLines[1].newLineNumber).toBe(3);
      expect(addLines[2].newLineNumber).toBe(4);
    });

    it('assigns correct line numbers to deletion lines', () => {
      const result = parseDiff(fixture('single-file-deletions.diff'));
      const delLines = result.files[0].hunks[0].lines.filter(
        l => l.type === 'delete'
      );

      expect(delLines[0].newLineNumber).toBeNull();
      expect(delLines[0].oldLineNumber).toBe(2);
      expect(delLines[1].oldLineNumber).toBe(3);
      expect(delLines[2].oldLineNumber).toBe(4);
    });
  });

  describe('file status detection', () => {
    it('detects new files', () => {
      const result = parseDiff(fixture('new-file.diff'));

      expect(result.files[0].status).toBe('added');
      expect(result.files[0].oldPath).toBe('/dev/null');
      expect(result.files[0].newPath).toBe('newfile.ts');
    });

    it('detects deleted files', () => {
      const result = parseDiff(fixture('deleted-file.diff'));

      expect(result.files[0].status).toBe('deleted');
      expect(result.files[0].oldPath).toBe('old-file.ts');
      expect(result.files[0].newPath).toBe('/dev/null');
    });

    it('detects renamed files', () => {
      const result = parseDiff(fixture('renamed-file.diff'));

      expect(result.files[0].status).toBe('renamed');
      expect(result.files[0].oldPath).toBe('old-name.ts');
      expect(result.files[0].newPath).toBe('new-name.ts');
      expect(result.files[0].similarityIndex).toBe(85);
    });

    it('detects copied files', () => {
      const result = parseDiff(fixture('copied-file.diff'));

      expect(result.files[0].status).toBe('copied');
      expect(result.files[0].oldPath).toBe('original.ts');
      expect(result.files[0].newPath).toBe('copy.ts');
      expect(result.files[0].similarityIndex).toBe(90);
    });

    it('detects mode-only changes', () => {
      const result = parseDiff(fixture('mode-change.diff'));

      expect(result.files[0].status).toBe('modified');
      expect(result.files[0].oldMode).toBe('100644');
      expect(result.files[0].newMode).toBe('100755');
      expect(result.files[0].hunks).toHaveLength(0);
    });

    it('detects mode change with content', () => {
      const result = parseDiff(fixture('mode-change-with-content.diff'));

      expect(result.files[0].oldMode).toBe('100644');
      expect(result.files[0].newMode).toBe('100755');
      expect(result.files[0].hunks).toHaveLength(1);
      expect(result.files[0].additions).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles no newline at end of file', () => {
      const result = parseDiff(fixture('no-newline.diff'));
      const lines = result.files[0].hunks[0].lines;
      const lastContext = lines.filter(l => l.type === 'context').pop();

      expect(lastContext?.noNewline).toBe(true);
    });

    it('handles binary files (new)', () => {
      const result = parseDiff(fixture('binary-file.diff'));

      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].status).toBe('added');
      expect(result.files[0].hunks).toHaveLength(0);
      expect(result.files[0].additions).toBe(0);
      expect(result.files[0].deletions).toBe(0);
    });

    it('handles binary files (modified)', () => {
      const result = parseDiff(fixture('binary-modified.diff'));

      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].status).toBe('modified');
    });

    it('handles binary files (deleted)', () => {
      const result = parseDiff(fixture('binary-deleted.diff'));

      expect(result.files[0].isBinary).toBe(true);
      expect(result.files[0].status).toBe('deleted');
    });

    it('handles files with spaces in path', () => {
      const result = parseDiff(fixture('spaces-in-path.diff'));

      expect(result.files[0].oldPath).toBe('my folder/my file.ts');
      expect(result.files[0].newPath).toBe('my folder/my file.ts');
    });

    it('handles unicode content', () => {
      const result = parseDiff(fixture('unicode-content.diff'));

      expect(result.files).toHaveLength(1);
      const addLine = result.files[0].hunks[0].lines.find(l => l.type === 'add' && l.content.includes('emoji'));
      expect(addLine).toBeDefined();
    });

    it('handles submodule changes', () => {
      const result = parseDiff(fixture('submodule.diff'));

      expect(result.files).toHaveLength(1);
      expect(result.files[0].newPath).toBe('vendor/lib');
    });
  });

  describe('stats computation', () => {
    it('computes per-file stats', () => {
      const result = parseDiff(fixture('single-file-mixed.diff'));

      expect(result.files[0].additions).toBe(3);
      expect(result.files[0].deletions).toBe(2);
    });

    it('computes total stats across files', () => {
      const result = parseDiff(fixture('multi-file.diff'));

      expect(result.stats.filesChanged).toBe(2);
      expect(result.stats.totalAdditions).toBeGreaterThan(0);
      expect(result.stats.totalDeletions).toBeGreaterThan(0);
    });

    it('binary files report 0 additions/deletions', () => {
      const result = parseDiff(fixture('binary-file.diff'));

      expect(result.files[0].additions).toBe(0);
      expect(result.files[0].deletions).toBe(0);
    });
  });
});
