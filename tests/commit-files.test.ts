import { describe, expect, it } from 'vitest';
import { commitFiles, commitPathspecs } from '../src/features/pr/commit-files';

describe('commit files', () => {
  it('lists changed files, shows untracked as added and appends hidden ones once', () => {
    const files = commitFiles(
      [
        { path: 'src/a.ts', oldPath: null, status: 'modified', additions: 2, deletions: 1, binary: false },
        { path: 'new.txt', oldPath: null, status: 'untracked', additions: 3, deletions: 0, binary: false },
      ],
      ['dist/app.js', 'src/a.ts'],
    );
    expect(files.map((file) => [file.path, file.status, file.hidden])).toEqual([
      ['src/a.ts', 'modified', false],
      ['new.txt', 'added', false],
      ['dist/app.js', 'modified', true],
    ]);
  });

  it('takes a rename’s old path along', () => {
    const files = commitFiles([{ path: 'src/cache.ts', oldPath: 'src/legacy-cache.ts', status: 'renamed', additions: 7, deletions: 0, binary: false }], []);
    expect(commitPathspecs(files)).toEqual(['src/cache.ts', 'src/legacy-cache.ts']);
  });
});
