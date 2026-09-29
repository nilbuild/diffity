import { describe, expect, it } from 'vitest';
import { parsePermissionSetting, runSkipsPrompts } from '../src/features/claude/permission-setting';

describe('permission setting', () => {
  it('defaults to skipping prompts', () => {
    expect(parsePermissionSetting(null)).toBe('skip');
    expect(parsePermissionSetting('')).toBe('skip');
    expect(parsePermissionSetting('nonsense')).toBe('skip');
    expect(parsePermissionSetting('askOnce')).toBe('askOnce');
    expect(parsePermissionSetting('askEach')).toBe('askEach');
  });

  it('only editing runs skip prompts', () => {
    expect(runSkipsPrompts('resolve', { kind: 'resolve' }, 'skip')).toBe(true);
    expect(runSkipsPrompts('resolve', { kind: 'thread', threadId: 't' }, 'skip')).toBe(true);
    expect(runSkipsPrompts('resolve', { kind: 'reviewFeedback', reviewId: 'r' }, 'skip')).toBe(true);
    expect(runSkipsPrompts('review', { kind: 'review', ref: 'work' }, 'skip')).toBe(false);
    expect(runSkipsPrompts('resolve', { kind: 'explain', path: 'a.ts' }, 'skip')).toBe(false);
    expect(runSkipsPrompts('resolve', { kind: 'resolve' }, 'askOnce')).toBe(false);
    expect(runSkipsPrompts('ask', { kind: 'chat' }, 'skip')).toBe(false);
  });
});
