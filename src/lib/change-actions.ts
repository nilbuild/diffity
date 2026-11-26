import type { FileStatus } from './types';

/** Which uncommitted view a diff is: All (HEAD to working tree), Staged (HEAD to index) or Unstaged (index to working tree). */
export type WorkingView = 'all' | 'staged' | 'unstaged';

export type ChangeAction = 'stage' | 'unstage' | 'discard';

export function workingView(ref: string | undefined): WorkingView {
  if (ref === 'staged' || ref === 'unstaged') {
    return ref;
  }
  return 'all';
}

export function changeActionsFor(view: WorkingView): ChangeAction[] {
  if (view === 'staged') {
    return ['unstage'];
  }
  return ['stage', 'discard'];
}

/** Why the per-change buttons are off, or null. A `-w` diff's hunks may not apply to the real file. */
export function changeActionsDisabledReason(view: WorkingView, hideWhitespace: boolean): string | null {
  if (!hideWhitespace) {
    return null;
  }
  if (view === 'staged') {
    return 'Show whitespace changes to unstage parts of a file';
  }
  return 'Show whitespace changes to discard or stage parts of a file';
}

export function fileName(path: string): string {
  return path.split('/').pop() || path;
}

function isNewFile(status: FileStatus | string): boolean {
  return status === 'added' || status === 'untracked';
}

export function changeActionTitle(action: ChangeAction, view: WorkingView): string {
  if (action === 'stage') {
    return 'Stage this change';
  }
  if (action === 'unstage') {
    return 'Unstage this change. The file on disk stays as it is';
  }
  if (view === 'unstaged') {
    return 'Discard this change. Staged edits stay';
  }
  return 'Discard this change and restore these lines from the last commit';
}

export function changeActionLabel(action: ChangeAction): string {
  if (action === 'stage') {
    return 'Stage';
  }
  if (action === 'unstage') {
    return 'Unstage';
  }
  return 'Discard';
}

export interface ConfirmCopy {
  title: string;
  message: string;
  confirmLabel: string;
}

export function discardChangeCopy(view: WorkingView, path: string, status: FileStatus | string): ConfirmCopy {
  const name = fileName(path);
  if (isNewFile(status)) {
    return {
      title: 'Discard change',
      message: `Discard this change in ${name}? The file is new, so it is deleted. This can't be undone.`,
      confirmLabel: 'Discard',
    };
  }
  const detail = view === 'unstaged' ? 'Your staged edits to this file stay.' : 'This restores these lines from the last commit.';
  return {
    title: 'Discard change',
    message: `Discard this change in ${name}? ${detail} This can't be undone.`,
    confirmLabel: 'Discard',
  };
}

export function revertFileCopy(view: WorkingView, path: string, status: FileStatus | string): ConfirmCopy {
  const name = fileName(path);
  if (isNewFile(status)) {
    return {
      title: 'Delete file',
      message: `Delete ${name}? It is not in the last commit, so it is removed from disk. This can't be undone.`,
      confirmLabel: 'Delete',
    };
  }
  if (view === 'unstaged') {
    return {
      title: 'Discard unstaged changes',
      message: `Discard the unstaged changes to ${name}? Your staged edits stay. This can't be undone.`,
      confirmLabel: 'Discard',
    };
  }
  return {
    title: 'Revert file',
    message: `Discard all changes to ${name}, staged and unstaged? It goes back to the last commit. This can't be undone.`,
    confirmLabel: 'Revert',
  };
}

export function revertFileMenuLabel(view: WorkingView): string {
  return view === 'unstaged' ? 'Discard unstaged changes…' : 'Revert file…';
}

export function changeActionToast(action: ChangeAction, path: string): string {
  const name = fileName(path);
  if (action === 'stage') {
    return `Staged 1 change in ${name}`;
  }
  if (action === 'unstage') {
    return `Unstaged 1 change in ${name}`;
  }
  return `Discarded 1 change in ${name}`;
}
