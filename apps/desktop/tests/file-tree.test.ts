import { describe, expect, it } from 'vitest';
import type { DiffFile } from '@diffity/parser';
import { buildFileTree, filterTreeToPaths } from '../src/lib/file-tree';

function makeFile(path: string): DiffFile {
  return {
    oldPath: path,
    newPath: path,
    status: 'modified',
    additions: 1,
    deletions: 0,
    hunks: [],
    isBinary: false,
  };
}

describe('filterTreeToPaths', () => {
  it('keeps only matching files and the directories needed to reach them', () => {
    const tree = buildFileTree([
      makeFile('src/app.ts'),
      makeFile('src/nested/utils.ts'),
      makeFile('tests/app.test.ts'),
    ]);

    const filtered = filterTreeToPaths(tree, new Set(['src/nested/utils.ts']));

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ type: 'dir', name: 'src' });

    if (filtered[0].type !== 'dir') {
      throw new Error('Expected directory node');
    }

    expect(filtered[0].children).toHaveLength(1);
    expect(filtered[0].children[0]).toMatchObject({ type: 'dir', name: 'nested' });
  });

  it('returns an empty tree when nothing matches', () => {
    const tree = buildFileTree([makeFile('src/app.ts')]);

    expect(filterTreeToPaths(tree, new Set(['docs/readme.md']))).toEqual([]);
  });
});
