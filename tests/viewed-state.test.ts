import { describe, expect, it } from 'vitest';
import { parseDiff } from '../src/lib/diff-parser';
import { computeViewedState, fileHash, isLegacyHash, legacyFileHash } from '../src/lib/viewed-state';

const patch = (line: string) => `diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-old
+${line}
`;

describe('computeViewedState', () => {
  const hashes = new Map([['a.ts', 'h2'], ['b.ts', 'h3'], ['c.ts', 'h4']]);

  it('keeps files whose diff is unchanged viewed', () => {
    const state = computeViewedState([{ filePath: 'b.ts', contentHash: 'h3', blobId: 'x' }], hashes);
    expect([...state.reviewed]).toEqual(['b.ts']);
    expect(state.changed.size).toBe(0);
  });

  it('flags files that changed after being viewed, unticked', () => {
    const state = computeViewedState([
      { filePath: 'a.ts', contentHash: 'h1', blobId: 'abc' },
      { filePath: 'c.ts', contentHash: 'old', blobId: null },
      { filePath: 'd.ts', contentHash: 'h9', blobId: 'def' },
    ], hashes);
    expect(state.reviewed.size).toBe(0);
    expect(state.changed.get('a.ts')).toEqual({ canDiff: true });
    expect(state.changed.get('c.ts')).toEqual({ canDiff: false });
    expect(state.changed.has('d.ts')).toBe(false);
  });

  it('clears the flag once the file is marked viewed again', () => {
    const state = computeViewedState([{ filePath: 'a.ts', contentHash: 'h2', blobId: 'new' }], hashes);
    expect(state.reviewed.has('a.ts')).toBe(true);
    expect(state.changed.has('a.ts')).toBe(false);
  });
});

describe('fileHash', () => {
  it('changes with the file diff', () => {
    const one = parseDiff(patch('new')).files[0];
    const same = parseDiff(patch('new')).files[0];
    const other = parseDiff(patch('newer')).files[0];
    expect(fileHash(one)).toBe(fileHash(same));
    expect(fileHash(one)).not.toBe(fileHash(other));
  });

  it('ignores hunk positions, so a rebase that shifts lines keeps the mark', () => {
    const at = (start: number) => parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -${start},3 +${start},3 @@ function a() {
 one
-old
+new
 three
`).files[0];
    expect(fileHash(at(1))).toBe(fileHash(at(40)));
  });

  it('is the same with whitespace changes shown or hidden', () => {
    const shown = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
-if (x) {
-  run();
+if (x)  {
+    run();
+    done();
 }
`).files[0];
    const hidden = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,4 @@
 if (x) {
   run();
+    done();
 }
`).files[0];
    expect(fileHash(shown)).toBe(fileHash(hidden));
    expect(fileHash(shown)).not.toBe(fileHash(parseDiff(patch('new')).files[0]));
  });

  it('is versioned, so marks saved with the old hash are told apart', () => {
    const file = parseDiff(patch('new')).files[0];
    expect(isLegacyHash(fileHash(file))).toBe(false);
    expect(isLegacyHash(legacyFileHash(file))).toBe(true);
  });
});

describe('legacy marks', () => {
  it('count as viewed while they match and are listed for an upgrade', () => {
    const file = parseDiff(patch('new')).files[0];
    const hashes = new Map([['a.ts', fileHash(file)]]);
    const legacy = new Map([['a.ts', legacyFileHash(file)]]);
    const state = computeViewedState([{ filePath: 'a.ts', contentHash: legacyFileHash(file), blobId: 'x' }], hashes, legacy);
    expect(state.reviewed.has('a.ts')).toBe(true);
    expect(state.upgrade).toEqual(['a.ts']);
  });

  it('count as changed once the file moved on', () => {
    const before = parseDiff(patch('new')).files[0];
    const after = parseDiff(patch('newer')).files[0];
    const state = computeViewedState(
      [{ filePath: 'a.ts', contentHash: legacyFileHash(before), blobId: 'x' }],
      new Map([['a.ts', fileHash(after)]]),
      new Map([['a.ts', legacyFileHash(after)]]),
    );
    expect(state.reviewed.size).toBe(0);
    expect(state.changed.get('a.ts')).toEqual({ canDiff: true });
    expect(state.upgrade).toEqual([]);
  });
});
