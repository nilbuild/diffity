import { beforeEach, describe, expect, it } from 'vitest';

const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
  },
});

const { setRepoPath } = await import('../src/lib/api');
const { readViewState, writeViewState } = await import('../src/lib/view-state');
const { lastViewLocationFor, rememberLocation } = await import('../src/lib/repo-locations');

describe('view state', () => {
  beforeEach(() => {
    store.clear();
  });

  it('keeps state per repository', () => {
    setRepoPath('/a');
    writeViewState('tree:filter', 'src');
    setRepoPath('/b');
    expect(readViewState('tree:filter', '')).toBe('');
    writeViewState('tree:filter', 'lib');
    setRepoPath('/a');
    expect(readViewState('tree:filter', '')).toBe('src');
  });

  it('remembers the last location of each view without one-shot params', () => {
    const base = `/r/${encodeURIComponent('/a')}`;
    rememberLocation('/a', `${base}/diff?ref=abc123&thread=t1`);
    rememberLocation('/a', `${base}/tree?path=src%2Fapp.ts&type=file`);
    rememberLocation('/a', `${base}/overview`);
    expect(lastViewLocationFor('/a', 'diff')).toBe(`${base}/diff?ref=abc123`);
    expect(lastViewLocationFor('/a', 'tree')).toBe(`${base}/tree?path=src%2Fapp.ts&type=file`);
    expect(lastViewLocationFor('/b', 'diff')).toBeNull();
  });
});
