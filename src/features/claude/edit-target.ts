import { useQuery } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { TREE_REF } from '../../lib/types';

/**
 * Where an agent's edits for a view land. Agents edit the code on disk, which only some views show: `here` when the view's
 * newer side is the working tree, so edits appear in it; `working-copy` when the code is checked out but the view compares
 * commits (a checked-out pull request, a commit, staged changes), so edits land as uncommitted changes the view won't
 * show; `none` for a branch or pull request that isn't checked out.
 */
export type EditTarget = 'here' | 'working-copy' | 'none';

/** Views whose newer side is the working tree: uncommitted or unstaged changes, the file browser, `main` (a branch vs your working copy). */
export function showsWorkingTree(ref: string): boolean {
  if (ref === 'work' || ref === '.' || ref === 'unstaged' || ref === TREE_REF) {
    return true;
  }
  return ref !== 'staged' && !ref.includes('..');
}

export async function editTarget(repoPath: string, ref: string | null | undefined): Promise<EditTarget> {
  if (!ref || showsWorkingTree(ref)) {
    return 'here';
  }
  if (ref === 'staged') {
    return 'working-copy';
  }
  try {
    const [view, work] = await Promise.all([tauri.resolveRef(repoPath, ref), tauri.resolveRef(repoPath, 'work')]);
    if (!view.headSha) {
      return 'none';
    }
    if (view.headSha === work.headSha) {
      return 'working-copy';
    }
    return (await tauri.refInCheckout(repoPath, ref)) ? 'working-copy' : 'none';
  } catch {
    return 'none';
  }
}

export async function canEditRef(repoPath: string, ref: string | null | undefined): Promise<boolean> {
  return (await editTarget(repoPath, ref)) !== 'none';
}

export function useEditTarget(repoPath: string, ref: string | null | undefined): EditTarget {
  const quick = !ref || showsWorkingTree(ref);
  const { data } = useQuery({
    queryKey: ['edit-target', repoPath, ref],
    queryFn: () => editTarget(repoPath, ref),
    enabled: !quick && ref !== 'staged',
    staleTime: 5_000,
  });
  if (quick) {
    return 'here';
  }
  if (ref === 'staged') {
    return 'working-copy';
  }
  return data ?? 'none';
}

export function useCanEditRef(repoPath: string, ref: string | null | undefined): boolean {
  return useEditTarget(repoPath, ref) !== 'none';
}

/** Where edits made from a view that doesn't show the working copy can be seen: a branch's All changes twin, else Uncommitted changes. */
export function whereEditsShow(viewRef: string): { ref: string; allChanges: boolean } {
  const base = viewRef.endsWith('...HEAD') ? viewRef.slice(0, -'...HEAD'.length) : null;
  if (base && !base.includes('..')) {
    return { ref: base, allChanges: true };
  }
  return { ref: 'work', allChanges: false };
}
