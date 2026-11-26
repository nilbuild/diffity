import { describe, expect, it } from 'vitest';
import { openSummary } from '../src/features/comments/comments-button';
import { findReadme } from '../src/components/tree/folder-viewer';

describe('openSummary', () => {
  it('says "in all views" away from a view', () => {
    expect(openSummary(5, 5, false)).toBe(' · 5 open in all views');
    expect(openSummary(0, 0, false)).toBe('');
  });

  it('names this view and, only when they differ, the rest', () => {
    expect(openSummary(5, 5, true)).toBe(' · 5 open in this view');
    expect(openSummary(3, 4, true)).toBe(' · 3 open in this view · 1 open in other view');
    expect(openSummary(0, 2, true)).toBe(' · 2 open in other views');
    expect(openSummary(0, 0, true)).toBe('');
  });
});

describe('findReadme', () => {
  it('finds a README.md in any case, files only', () => {
    const entry = (name: string, type: 'blob' | 'tree' = 'blob') => ({ name, path: `docs/${name}`, type });
    expect(findReadme([entry('readme.md', 'tree'), entry('index.ts')])).toBeNull();
    expect(findReadme([entry('index.ts'), entry('Readme.MD')])?.name).toBe('Readme.MD');
  });
});
