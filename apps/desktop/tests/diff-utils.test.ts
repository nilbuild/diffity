import { describe, it, expect } from 'vitest';
import type { DiffFile, DiffHunk, DiffLine } from '@diffity/parser';
import { getAutoCollapsedPaths, getChangeGroups, buildChangeGroupPatch } from '../src/lib/diff-utils';

function makeFile(path: string, status: DiffFile['status'] = 'modified'): DiffFile {
  return {
    oldPath: status === 'added' ? '' : path,
    newPath: status === 'deleted' ? '' : path,
    status,
    additions: 1,
    deletions: 0,
    hunks: [],
  };
}

describe('getAutoCollapsedPaths', () => {
  it('collapses deleted files', () => {
    const files = [makeFile('src/old.ts', 'deleted'), makeFile('src/new.ts')];
    const collapsed = getAutoCollapsedPaths(files);

    expect(collapsed.has('src/old.ts')).toBe(true);
    expect(collapsed.has('src/new.ts')).toBe(false);
  });

  describe('lock files', () => {
    const lockFiles = [
      'package-lock.json',
      'pnpm-lock.yaml',
      'pnpm-lock.yml',
      'bun.lock',
      'bun.lockb',
      'yarn.lock',
      'Cargo.lock',
      'Gemfile.lock',
      'composer.lock',
      'poetry.lock',
      'Pipfile.lock',
      'go.sum',
      'pubspec.lock',
      'Podfile.lock',
    ];

    for (const name of lockFiles) {
      it(`collapses ${name}`, () => {
        const files = [makeFile(name)];
        const collapsed = getAutoCollapsedPaths(files);

        expect(collapsed.has(name)).toBe(true);
      });
    }

    it('collapses lock files in subdirectories', () => {
      const files = [makeFile('packages/app/package-lock.json')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('packages/app/package-lock.json')).toBe(true);
    });
  });

  describe('minified files', () => {
    it('collapses .min.js files', () => {
      const files = [makeFile('dist/app.min.js')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('dist/app.min.js')).toBe(true);
    });

    it('collapses .min.css files', () => {
      const files = [makeFile('styles/main.min.css')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('styles/main.min.css')).toBe(true);
    });

    it('does not collapse regular .js files', () => {
      const files = [makeFile('src/app.js')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.size).toBe(0);
    });
  });

  describe('generated files', () => {
    it('collapses .d.ts files', () => {
      const files = [makeFile('types/index.d.ts')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('types/index.d.ts')).toBe(true);
    });

    it('collapses .map files', () => {
      const files = [makeFile('dist/app.js.map')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('dist/app.js.map')).toBe(true);
    });

    it('collapses .snap files', () => {
      const files = [makeFile('tests/__snapshots__/app.test.snap')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('tests/__snapshots__/app.test.snap')).toBe(true);
    });

    it('collapses files in dist/', () => {
      const files = [makeFile('dist/index.js')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('dist/index.js')).toBe(true);
    });

    it('collapses files in build/', () => {
      const files = [makeFile('build/output.js')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('build/output.js')).toBe(true);
    });

    it('collapses .generated.ts files', () => {
      const files = [makeFile('src/api.generated.ts')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('src/api.generated.ts')).toBe(true);
    });

    it('collapses protobuf generated files', () => {
      const files = [makeFile('proto/message.pb.go')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('proto/message.pb.go')).toBe(true);
    });

    it('collapses .lock extension files', () => {
      const files = [makeFile('some-tool.lock')];
      const collapsed = getAutoCollapsedPaths(files);

      expect(collapsed.has('some-tool.lock')).toBe(true);
    });
  });

  it('does not collapse regular source files', () => {
    const files = [
      makeFile('src/app.tsx'),
      makeFile('lib/utils.ts'),
      makeFile('README.md'),
      makeFile('package.json'),
    ];
    const collapsed = getAutoCollapsedPaths(files);

    expect(collapsed.size).toBe(0);
  });

  it('handles mix of collapsible and non-collapsible files', () => {
    const files = [
      makeFile('src/app.tsx'),
      makeFile('package-lock.json'),
      makeFile('dist/bundle.min.js'),
      makeFile('src/old.ts', 'deleted'),
      makeFile('lib/utils.ts'),
    ];
    const collapsed = getAutoCollapsedPaths(files);

    expect(collapsed.size).toBe(3);
    expect(collapsed.has('src/app.tsx')).toBe(false);
    expect(collapsed.has('package-lock.json')).toBe(true);
    expect(collapsed.has('dist/bundle.min.js')).toBe(true);
    expect(collapsed.has('src/old.ts')).toBe(true);
    expect(collapsed.has('lib/utils.ts')).toBe(false);
  });
});

function makeLine(type: DiffLine['type'], content: string, oldNum: number | null, newNum: number | null): DiffLine {
  return { type, content, oldLineNumber: oldNum, newLineNumber: newNum };
}

function makeHunk(lines: DiffLine[], oldStart = 1, newStart = 1): DiffHunk {
  let oldCount = 0;
  let newCount = 0;
  for (const line of lines) {
    if (line.type === 'context' || line.type === 'delete') {
      oldCount++;
    }
    if (line.type === 'context' || line.type === 'add') {
      newCount++;
    }
  }
  return {
    header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    oldStart,
    oldCount,
    newStart,
    newCount,
    lines,
  };
}

function makeDiffFile(hunks: DiffHunk[], status: DiffFile['status'] = 'modified'): DiffFile {
  return {
    oldPath: 'src/file.ts',
    newPath: 'src/file.ts',
    status,
    additions: 0,
    deletions: 0,
    hunks,
    isBinary: false,
  };
}

describe('getChangeGroups', () => {
  it('returns empty array for all context lines', () => {
    const lines = [
      makeLine('context', 'a', 1, 1),
      makeLine('context', 'b', 2, 2),
    ];

    expect(getChangeGroups(lines)).toEqual([]);
  });

  it('identifies a single change group', () => {
    const lines = [
      makeLine('context', 'a', 1, 1),
      makeLine('delete', 'b', 2, null),
      makeLine('add', 'c', null, 2),
      makeLine('context', 'd', 3, 3),
    ];
    const groups = getChangeGroups(lines);

    expect(groups).toEqual([{ startIndex: 1, endIndex: 2 }]);
  });

  it('identifies multiple change groups', () => {
    const lines = [
      makeLine('context', 'a', 1, 1),
      makeLine('delete', 'b', 2, null),
      makeLine('context', 'c', 3, 2),
      makeLine('add', 'd', null, 3),
      makeLine('add', 'e', null, 4),
      makeLine('context', 'f', 4, 5),
    ];
    const groups = getChangeGroups(lines);

    expect(groups).toEqual([
      { startIndex: 1, endIndex: 1 },
      { startIndex: 3, endIndex: 4 },
    ]);
  });

  it('handles change group at start of hunk', () => {
    const lines = [
      makeLine('add', 'new', null, 1),
      makeLine('context', 'a', 1, 2),
    ];
    const groups = getChangeGroups(lines);

    expect(groups).toEqual([{ startIndex: 0, endIndex: 0 }]);
  });

  it('handles change group at end of hunk', () => {
    const lines = [
      makeLine('context', 'a', 1, 1),
      makeLine('delete', 'old', 2, null),
    ];
    const groups = getChangeGroups(lines);

    expect(groups).toEqual([{ startIndex: 1, endIndex: 1 }]);
  });

  it('handles all changed lines as one group', () => {
    const lines = [
      makeLine('delete', 'a', 1, null),
      makeLine('delete', 'b', 2, null),
      makeLine('add', 'c', null, 1),
    ];
    const groups = getChangeGroups(lines);

    expect(groups).toEqual([{ startIndex: 0, endIndex: 2 }]);
  });
});

describe('buildChangeGroupPatch', () => {
  it('builds a patch for a single change group with context', () => {
    const lines = [
      makeLine('context', 'before', 1, 1),
      makeLine('delete', 'old', 2, null),
      makeLine('add', 'new', null, 2),
      makeLine('context', 'after', 3, 3),
    ];
    const hunk = makeHunk(lines);
    const file = makeDiffFile([hunk]);
    const patch = buildChangeGroupPatch(file, hunk, 1, 2);

    expect(patch).toContain('--- a/src/file.ts');
    expect(patch).toContain('+++ b/src/file.ts');
    expect(patch).toContain('@@ -1,3 +1,3 @@');
    expect(patch).toContain(' before');
    expect(patch).toContain('-old');
    expect(patch).toContain('+new');
    expect(patch).toContain(' after');
  });

  it('builds a patch for a change group without preceding context', () => {
    const lines = [
      makeLine('add', 'new line', null, 1),
      makeLine('context', 'existing', 1, 2),
    ];
    const hunk = makeHunk(lines, 1, 1);
    const file = makeDiffFile([hunk]);
    const patch = buildChangeGroupPatch(file, hunk, 0, 0);

    expect(patch).toContain('+new line');
    expect(patch).toContain(' existing');
    const patchLines = patch.split('\n');
    const diffLines = patchLines.filter(l => !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('@@'));
    expect(diffLines.some(l => l.startsWith('-'))).toBe(false);
  });

  it('includes up to 3 context lines before and after', () => {
    const lines = [
      makeLine('context', 'c1', 1, 1),
      makeLine('context', 'c2', 2, 2),
      makeLine('context', 'c3', 3, 3),
      makeLine('context', 'c4', 4, 4),
      makeLine('delete', 'old', 5, null),
      makeLine('context', 'c5', 6, 5),
      makeLine('context', 'c6', 7, 6),
      makeLine('context', 'c7', 8, 7),
      makeLine('context', 'c8', 9, 8),
    ];
    const hunk = makeHunk(lines);
    const file = makeDiffFile([hunk]);
    const patch = buildChangeGroupPatch(file, hunk, 4, 4);

    expect(patch).toContain(' c2');
    expect(patch).toContain(' c3');
    expect(patch).toContain(' c4');
    expect(patch).toContain('-old');
    expect(patch).toContain(' c5');
    expect(patch).toContain(' c6');
    expect(patch).toContain(' c7');
    expect(patch).not.toContain(' c1');
    expect(patch).not.toContain(' c8');
  });

  it('selects only one change group from a hunk with multiple', () => {
    const lines = [
      makeLine('context', 'a', 1, 1),
      makeLine('delete', 'first-del', 2, null),
      makeLine('add', 'first-add', null, 2),
      makeLine('context', 'b', 3, 3),
      makeLine('delete', 'second-del', 4, null),
      makeLine('context', 'c', 5, 4),
    ];
    const hunk = makeHunk(lines);
    const file = makeDiffFile([hunk]);

    const patch = buildChangeGroupPatch(file, hunk, 4, 4);

    expect(patch).toContain('-second-del');
    expect(patch).toContain(' b');
    expect(patch).toContain(' c');
    expect(patch).not.toContain('first');
  });

  it('builds a correct patch for delete-only changes', () => {
    const lines = [
      makeLine('context', 'keep-before', 1, 1),
      makeLine('delete', 'removed-a', 2, null),
      makeLine('delete', 'removed-b', 3, null),
      makeLine('context', 'keep-after', 4, 2),
    ];
    const hunk = makeHunk(lines);
    const file = makeDiffFile([hunk]);
    const patch = buildChangeGroupPatch(file, hunk, 1, 2);

    expect(patch).toContain('@@ -1,4 +1,2 @@');
    expect(patch).toContain(' keep-before');
    expect(patch).toContain('-removed-a');
    expect(patch).toContain('-removed-b');
    expect(patch).toContain(' keep-after');
    const patchLines = patch.split('\n');
    const diffLines = patchLines.filter(l => !l.startsWith('---') && !l.startsWith('+++') && !l.startsWith('@@'));
    expect(diffLines.some(l => l.startsWith('+'))).toBe(false);
  });

  it('builds a correct patch for delete-only with no surrounding context', () => {
    const lines = [
      makeLine('delete', 'only-line', 1, null),
    ];
    const hunk = makeHunk(lines, 1, 1);
    const file = makeDiffFile([hunk]);
    const patch = buildChangeGroupPatch(file, hunk, 0, 0);

    expect(patch).toContain('@@ -1,1 +1,0 @@');
    expect(patch).toContain('-only-line');
  });

  it('handles added file paths', () => {
    const lines = [
      makeLine('add', 'new content', null, 1),
    ];
    const hunk = makeHunk(lines, 0, 1);
    const file = makeDiffFile([hunk], 'added');
    file.oldPath = '/dev/null';
    const patch = buildChangeGroupPatch(file, hunk, 0, 0);

    expect(patch).toContain('--- /dev/null');
    expect(patch).toContain('+++ b/src/file.ts');
  });
});
