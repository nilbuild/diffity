import { TREE_REF } from './types';
import { descriptionForRef } from './api';

export interface ThreadTarget {
  ref: string;
  threadId?: string | null;
}

/** Router path (HashRouter) that opens a view and, with `threadId`, scrolls to and highlights that thread. */
export function threadPath(repoPath: string, target: ThreadTarget): string {
  const base = `/r/${encodeURIComponent(repoPath)}`;
  const params = new URLSearchParams();
  if (target.ref !== TREE_REF) {
    params.set('ref', target.ref);
  }
  if (target.threadId) {
    params.set('thread', target.threadId);
  }
  const query = params.toString();
  const page = target.ref === TREE_REF ? 'tree' : 'diff';
  return `${base}/${page}${query ? `?${query}` : ''}`;
}

/** Navigates from outside React (toasts, background runs). */
export function goToThread(repoPath: string, target: ThreadTarget) {
  window.location.hash = threadPath(repoPath, target);
}

/** Short label for a view without a backend round-trip ("Uncommitted changes", "Commit abc1234", "Files"). */
export function viewLabel(ref: string): string {
  if (ref === TREE_REF) {
    return 'Files';
  }
  return descriptionForRef(ref);
}
