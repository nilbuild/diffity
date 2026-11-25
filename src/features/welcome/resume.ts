import type { NavigateFunction } from 'react-router';
import { create } from 'zustand';
import * as tauri from '../../lib/tauri';
import { repoBase } from '../../hooks/use-repo';
import { beginOpening } from '../../lib/opening';
import { lastLocationFor, lastVisitFor } from '../../lib/repo-locations';
import { useClaude } from '../claude/claude-runner';
import { conversationFor, sameView } from '../claude/conversation';
import { openRepoAt } from './recent-repos';

/** Coming back within this long always returns to where you were, so a quick look at another project round-trips. */
export const RECENT_MS = 2 * 60 * 60 * 1000;

interface Return {
  visitedAt: number | null;
  now: number;
  /** The view has nothing to show any more: no changes, or its branch is gone. */
  empty: boolean;
  /** Something in the view is unfinished: drafts, your open comments, a chat or run, files marked viewed. */
  inProgress: boolean;
}

export function shouldRestore(state: Return): boolean {
  if (state.empty) {
    return false;
  }
  if (state.visitedAt !== null && state.now - state.visitedAt < RECENT_MS) {
    return true;
  }
  return state.inProgress;
}

/** The diff view a location shows, or null for any other page (those always reopen as they were). */
export function diffRefOf(repoPath: string, location: string): string | null {
  const [path, query = ''] = location.split('?');
  if (path !== `${repoBase(repoPath)}/diff`) {
    return null;
  }
  return new URLSearchParams(query).get('ref') || 'work';
}

async function hasWorkInProgress(repoPath: string, ref: string): Promise<boolean> {
  if (conversationFor(repoPath, ref)?.chatId) {
    return true;
  }
  if (useClaude.getState().runs.some((run) => run.context.repoPath === repoPath && sameView(run.ref, ref))) {
    return true;
  }
  const session = await tauri.getSession(repoPath, ref);
  const [pending, threads, viewed] = await Promise.all([
    tauri.getPendingReview(session.id),
    tauri.listThreads(session.id),
    tauri.listViewed(session.id),
  ]);
  const yourOpenComment = threads.some((thread) => thread.status === 'open' && thread.comments[0]?.authorType === 'user');
  return (pending?.pendingCount ?? 0) > 0 || yourOpenComment || viewed.length > 0;
}

/**
 * Where switching to a project goes: its last view when that's recent or unfinished, else its home (which then offers
 * that view under "Continue"). Null when the project has no remembered view.
 */
export async function resumeLocation(repoPath: string): Promise<string | null> {
  const last = lastLocationFor(repoPath);
  if (!last) {
    return null;
  }
  const ref = diffRefOf(repoPath, last);
  if (!ref) {
    return last;
  }
  const home = `${repoBase(repoPath)}/overview`;
  const empty = await tauri.diffIsEmpty(repoPath, ref).catch(() => true);
  const visitedAt = lastVisitFor(repoPath);
  const now = Date.now();
  const recent = visitedAt !== null && now - visitedAt < RECENT_MS;
  const inProgress = !empty && !recent ? await hasWorkInProgress(repoPath, ref).catch(() => true) : false;
  if (shouldRestore({ visitedAt, now, empty, inProgress })) {
    clearSkippedView(repoPath);
    return last;
  }
  useSkippedView.setState((state) => ({ byRepo: { ...state.byRepo, [repoPath]: empty ? null : last } }));
  return home;
}

let latestSwitch = 0;

/** Opens a project where it makes sense to land (see `resumeLocation`); a newer switch wins over a slower one. */
export async function switchToProject(repoPath: string, navigate: NavigateFunction) {
  const ticket = ++latestSwitch;
  if (!lastLocationFor(repoPath)) {
    await openRepoAt(repoPath, navigate);
    return;
  }
  beginOpening(repoPath, 'Switching');
  const to = await resumeLocation(repoPath);
  if (ticket !== latestSwitch) {
    return;
  }
  navigate(to ?? `${repoBase(repoPath)}/overview`);
}

/** The view switching didn't reopen, per project, for Home's "Continue" link until it's used or the next switch. */
export const useSkippedView = create<{ byRepo: Record<string, string | null> }>(() => ({ byRepo: {} }));

export function clearSkippedView(repoPath: string) {
  useSkippedView.setState((state) => ({ byRepo: { ...state.byRepo, [repoPath]: null } }));
}
