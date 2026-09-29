import { describe, it, expect } from 'vitest';
import { collapseContext, diffLines } from '../src/lib/line-diff';

describe('diffLines', () => {
  it('marks added and deleted lines', () => {
    const result = diffLines('a\nb\nc', 'a\nx\nc');
    expect(result).toEqual([
      { type: 'context', text: 'a' },
      { type: 'delete', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'context', text: 'c' },
    ]);
  });

  it('treats a missing old text as all additions', () => {
    expect(diffLines('', 'one\ntwo').map((entry) => entry.type)).toEqual(['add', 'add']);
  });

  it('collapses long unchanged runs', () => {
    const old = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n');
    const next = old.replace('line 10', 'changed');
    const collapsed = collapseContext(diffLines(old, next), 2);
    expect(collapsed[0]).toBeNull();
    expect(collapsed.filter((entry) => entry?.type === 'add')).toHaveLength(1);
    expect(collapsed[collapsed.length - 1]).toBeNull();
  });
});
