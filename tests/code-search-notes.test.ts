import { describe, it, expect } from 'vitest';
import { diskSearchNote, tooLargeNote } from '../src/features/code-search/code-search';

describe('diskSearchNote', () => {
  it('stays quiet when the view is what is on disk', () => {
    expect(diskSearchNote(null)).toBeNull();
    expect(diskSearchNote('work')).toBeNull();
    expect(diskSearchNote('staged')).toBeNull();
    expect(diskSearchNote('main')).toBeNull();
    expect(diskSearchNote('origin/main...HEAD')).toBeNull();
  });

  it('names the commit or branch the view shows instead', () => {
    expect(diskSearchNote('abc1234def~1..abc1234def')).toBe('Searching files on disk, not abc1234');
    expect(diskSearchNote('main..origin/feature/login')).toBe('Searching files on disk, not feature/login');
    expect(diskSearchNote('main...0123456789abcdef')).toBe('Searching files on disk, not 0123456');
  });
});

describe('tooLargeNote', () => {
  it('counts skipped files with the right plural', () => {
    expect(tooLargeNote(undefined)).toBeNull();
    expect(tooLargeNote(0)).toBeNull();
    expect(tooLargeNote(1)).toBe('1 file over 1 MB was skipped');
    expect(tooLargeNote(3)).toBe('3 files over 1 MB were skipped');
  });
});
