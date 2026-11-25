import { describe, expect, it, vi } from 'vitest';

const heads: Record<string, string | null> = { work: 'head', 'head~1..head': 'head', 'old~1..old': 'old', 'main...feature': 'feature', 'origin/main...HEAD': 'head' };

vi.mock('../src/lib/tauri', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/tauri')>()),
  resolveRef: async (_repoPath: string, ref: string) => {
    if (!(ref in heads)) {
      throw new Error('invalid ref');
    }
    return { ref, label: ref, canRevert: false, baseSha: null, headSha: heads[ref] };
  },
  refInCheckout: async (_repoPath: string, ref: string) => ref === 'old~1..old',
}));

const { canEditRef, editTarget } = await import('../src/features/claude/edit-target');

describe('canEditRef', () => {
  it('allows the working tree and a checked-out pull request', async () => {
    expect(await canEditRef('/r', null)).toBe(true);
    expect(await canEditRef('/r', 'work')).toBe(true);
    expect(await canEditRef('/r', 'origin/main...HEAD')).toBe(true);
  });

  it('allows the checked-out commit and earlier ones, not a branch that is not checked out', async () => {
    expect(await canEditRef('/r', 'head~1..head')).toBe(true);
    expect(await canEditRef('/r', 'old~1..old')).toBe(true);
    expect(await canEditRef('/r', 'main...feature')).toBe(false);
  });

  it('says where the edits land: shown in the view only when it shows the working tree', async () => {
    expect(await editTarget('/r', 'work')).toBe('here');
    expect(await editTarget('/r', 'unstaged')).toBe('here');
    expect(await editTarget('/r', 'main')).toBe('here');
    expect(await editTarget('/r', 'staged')).toBe('working-copy');
    expect(await editTarget('/r', 'origin/main...HEAD')).toBe('working-copy');
    expect(await editTarget('/r', 'head~1..head')).toBe('working-copy');
    expect(await editTarget('/r', 'old~1..old')).toBe('working-copy');
    expect(await editTarget('/r', 'main...feature')).toBe('none');
  });

  it('treats refs git cannot resolve as read-only', async () => {
    expect(await canEditRef('/r', 'gone~1..gone')).toBe(false);
  });
});
