import { describe, expect, it } from 'vitest';
import { diagramRefs, linkRefs, parseRef, refFromHref, refHref } from '../src/features/guide/guide-refs';
import { treePrefix } from '../src/features/guide/guide-callstack';
import type { GuideCall } from '../src/lib/types';

describe('guide refs', () => {
  it('parses files, lines and ranges', () => {
    expect(parseRef('src/a.ts')).toEqual({ path: 'src/a.ts', line: undefined, side: 'new' });
    expect(parseRef('./src/a.ts#L12-L20')).toEqual({ path: 'src/a.ts', line: 12, side: 'new' });
  });

  it('round-trips through an href', () => {
    const ref = { path: 'src/my file.ts', line: 3, side: 'new' as const };
    expect(refFromHref(refHref(ref))).toEqual(ref);
    expect(refFromHref('https://example.com')).toBeNull();
  });

  it('reads node and arrow links from the diagram', () => {
    const refs = diagramRefs('flowchart LR\n  a --> b\n  %% ref node:a [[src/a.ts#L3]]\n  %% ref edge:a->b [[src/b.ts#L9]]');
    expect(refs.get('a')?.line).toBe(3);
    expect(refs.get('a->b')).toEqual({ path: 'src/b.ts', line: 9, side: 'new' });
  });

  it('links references in prose but leaves code spans alone', () => {
    const out = linkRefs('See [[src/a.ts#L4]] and `[[src/b.ts]]`.');
    expect(out).toContain(`[a.ts:4](${refHref({ path: 'src/a.ts', line: 4, side: 'new' })})`);
    expect(out).toContain('`[[src/b.ts]]`');
  });

  it('reads node links from a diagram', () => {
    const refs = diagramRefs('flowchart LR\n  A --> B\n  %% ref node:A [[src/a.ts#L2]]\n  %% ref node:B [[src/b.ts]]');
    expect(refs.get('A')).toEqual({ path: 'src/a.ts', line: 2, side: 'new' });
    expect(refs.get('B')?.line).toBeUndefined();
  });
});

describe('treePrefix', () => {
  const row = (depth: number): GuideCall => ({ depth, call: 'x', change: 'same', side: 'new' });

  it('draws branches that continue and branches that end', () => {
    const rows = [row(0), row(1), row(2), row(1), row(2)];
    expect(rows.map((_, i) => treePrefix(rows, i))).toEqual(['', '├─ ', '│  └─ ', '└─ ', '   └─ ']);
  });
});
