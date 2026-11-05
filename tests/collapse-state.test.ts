import { describe, expect, it } from 'vitest';
import { parseDiff } from '../src/lib/diff-parser';
import { collapseAdded, collapsedFromToggles, defaultCollapsed, togglesFromCollapsed } from '../src/lib/collapse-state';

const changed = (path: string) => `diff --git a/${path} b/${path}
--- a/${path}
+++ b/${path}
@@ -1 +1 @@
-old
+new
`;
const deleted = `diff --git a/old.ts b/old.ts
deleted file mode 100644
--- a/old.ts
+++ /dev/null
@@ -1 +0,0 @@
-old
`;
const files = parseDiff(changed('a.ts') + changed('b.ts') + deleted).files;

const none = new Set<string>();

describe('defaultCollapsed', () => {
  it('collapses viewed files along with deleted files', () => {
    expect(defaultCollapsed(files, none, new Set(['a.ts']))).toEqual(new Set(['old.ts', 'a.ts']));
  });

  it('keeps a viewed file collapsed even when it has comments', () => {
    expect(defaultCollapsed(files, new Set(['a.ts', 'old.ts']), new Set(['a.ts']))).toEqual(new Set(['a.ts']));
  });

  it('ignores viewed paths that are not in the diff', () => {
    expect(defaultCollapsed(files, none, new Set(['gone.ts']))).toEqual(new Set(['old.ts']));
  });
});

describe('toggles', () => {
  it('remembers nothing for a viewed file left collapsed', () => {
    const viewed = new Set(['a.ts']);
    expect(togglesFromCollapsed(files, none, viewed, new Set(['a.ts', 'old.ts']))).toEqual(none);
  });

  it('keeps a viewed file the reader opened open', () => {
    const viewed = new Set(['a.ts']);
    const toggled = togglesFromCollapsed(files, none, viewed, new Set(['old.ts']));
    expect(toggled).toEqual(new Set(['a.ts']));
    expect(collapsedFromToggles(files, none, viewed, toggled)).toEqual(new Set(['old.ts']));
  });
});

describe('collapseAdded', () => {
  it('collapses only newly viewed files', () => {
    const next = collapseAdded(new Set(), new Set(['a.ts']), new Set(['a.ts', 'b.ts']));
    expect(next).toEqual(new Set(['b.ts']));
  });

  it('returns the same set when nothing was added', () => {
    const collapsed = new Set(['a.ts']);
    expect(collapseAdded(collapsed, new Set(['a.ts']), new Set(['a.ts']))).toBe(collapsed);
  });
});
