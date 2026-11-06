import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { NavigateFunction } from 'react-router';
import { create } from 'zustand';
import * as tauri from '../../lib/tauri';
import { queryClient } from '../../lib/query-client';
import { openSettingsAt } from '../../lib/ui-store';
import type { GitStatus, PullRequest, PullResult, StashResult } from '../../lib/types';
import { prBaseFor, prRefFor } from '../../lib/pr-ref';
import { openRepoAt, shortPath } from '../welcome/recent-repos';

export interface ReturnPoint {
  branch: string | null;
  sha: string | null;
  stash: StashResult | null;
  prNumber: number;
}

export type CheckoutGuard =
  | { kind: 'checkout'; repoPath: string; input: string; label: string; status: GitStatus }
  | { kind: 'back'; repoPath: string; point: ReturnPoint; status: GitStatus }
  | { kind: 'branch'; repoPath: string; branch: string; status: GitStatus };

/** What opening a pull request is doing, shown in place of the diff of the repository it runs in. */
export interface CheckoutProgress {
  repoPath: string;
  title: string;
  step: string;
}

interface CheckoutState {
  guard: CheckoutGuard | null;
  busy: string | null;
  progress: CheckoutProgress | null;
}

export const useCheckoutState = create<CheckoutState>(() => ({ guard: null, busy: null, progress: null }));

export function dismissGuard() {
  useCheckoutState.setState({ guard: null });
}

type ToDiff = (ref: string) => void;

/** What a branch switch needs to move you: to a diff, or Home. */
export interface SwitchNav {
  toDiff: ToDiff;
  toOverview: () => void;
}

/**
 * Where you land after switching what's checked out. Home and Files stay put and refresh. A diff of the old branch
 * means nothing on the new one, so it moves to the new branch's uncommitted changes, or Home when there are none.
 */
async function landAfterSwitch(repoPath: string, nav: SwitchNav) {
  if (!window.location.hash.includes('/diff')) {
    return;
  }
  const status = await tauri.gitStatus(repoPath).catch(() => null);
  if (status && status.staged + status.unstaged + status.untracked > 0) {
    nav.toDiff('work');
    return;
  }
  nav.toOverview();
}

export { prBaseFor, prRefFor };

export function labelFor(input: string): string {
  const match = /\/pull\/(\d+)/.exec(input) ?? /^#?(\d+)$/.exec(input.trim());
  return match ? `#${match[1]}` : input.trim();
}

/** A GitHub PR URL or a plain number (`12`, `#12`). */
export function parsePrInput(input: string): string | null {
  const value = input.trim();
  if (/^#?\d+$/.test(value)) {
    return value.replace('#', '');
  }
  if (/github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(value)) {
    return value;
  }
  return null;
}

const returnKey = (repoPath: string) => `pr.return:${repoPath}`;

export async function loadReturnPoint(repoPath: string): Promise<ReturnPoint | null> {
  const raw = await tauri.getSetting(returnKey(repoPath)).catch(() => null);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ReturnPoint;
  } catch {
    return null;
  }
}

async function saveReturnPoint(repoPath: string, point: ReturnPoint | null) {
  await tauri.setSetting(returnKey(repoPath), point ? JSON.stringify(point) : '');
  queryClient.setQueryData(['pr-return', repoPath], point);
}

export function useReturnPoint(repoPath: string) {
  return useQuery({ queryKey: ['pr-return', repoPath], queryFn: () => loadReturnPoint(repoPath), staleTime: Infinity });
}

function hasTrackedChanges(status: GitStatus): boolean {
  return status.staged + status.unstaged > 0;
}

function describeStash(stash: StashResult | null): string | null {
  if (!stash?.sha) {
    return null;
  }
  return `Your changes are in git stash (“${stash.message}”).`;
}

interface CommentSyncState {
  syncing: Record<string, boolean>;
  syncedAt: Record<string, number>;
  /** Why the last sync failed, until one succeeds. */
  failed: Record<string, string>;
  /** Review threads pulled in by an automatic sync that the user has not looked at yet (Comments button dot). */
  fresh: number;
}

export const useCommentSync = create<CommentSyncState>(() => ({ syncing: {}, syncedAt: {}, failed: {}, fresh: 0 }));

export const AUTO_SYNC_INTERVAL = 60_000;

export function syncKey(repoPath: string, prNumber: number): string {
  return `${repoPath}#${prNumber}`;
}

export function clearFreshComments() {
  if (useCommentSync.getState().fresh === 0) {
    return;
  }
  useCommentSync.setState({ fresh: 0 });
}

function summarize(result: PullResult): string | null {
  const total = result.pulled + result.updated;
  if (total === 0 && result.skipped === 0) {
    return null;
  }
  if (total === 0) {
    return 'Review comments are up to date';
  }
  return `Pulled ${result.pulled} review thread${result.pulled === 1 ? '' : 's'}${result.updated ? `, updated ${result.updated}` : ''}`;
}

async function pullReviewThreads(repoPath: string, pr: Pick<PullRequest, 'number' | 'baseRef'>): Promise<PullResult> {
  const key = syncKey(repoPath, pr.number);
  useCommentSync.setState((state) => ({ syncing: { ...state.syncing, [key]: true } }));
  try {
    const session = await tauri.getSession(repoPath, prRefFor(pr));
    const result = await tauri.pullReview(repoPath, session.id, pr.number);
    useCommentSync.setState((state) => {
      const failed = { ...state.failed };
      delete failed[key];
      return { syncedAt: { ...state.syncedAt, [key]: Date.now() }, failed };
    });
    queryClient.invalidateQueries({ queryKey: ['threads'] });
    queryClient.invalidateQueries({ queryKey: ['repo-threads'] });
    return result;
  } catch (error) {
    useCommentSync.setState((state) => ({ failed: { ...state.failed, [key]: tauri.errorMessage(error) } }));
    throw error;
  } finally {
    useCommentSync.setState((state) => ({ syncing: { ...state.syncing, [key]: false } }));
  }
}

/** Pulls the PR's review threads into its session; returns a short summary, or null when nothing came in. */
export async function pullPrComments(repoPath: string, pr: Pick<PullRequest, 'number' | 'baseRef'>): Promise<string | null> {
  return summarize(await pullReviewThreads(repoPath, pr));
}

/** Manual sync ("Sync comments now"): always runs and reports the outcome in a toast. */
export async function syncPrCommentsNow(repoPath: string, pr: Pick<PullRequest, 'number' | 'baseRef'>) {
  if (useCommentSync.getState().syncing[syncKey(repoPath, pr.number)]) {
    return;
  }
  try {
    const summary = await pullPrComments(repoPath, pr);
    toast.success(summary ?? 'No review comments on this pull request yet');
  } catch (error) {
    toast.error('Could not pull review comments', { description: tauri.errorMessage(error) });
  }
}

/**
 * Quiet background sync (opening the PR view, window focus): at most once a minute, new threads light the Comments
 * button. A failure shows on the sync rows ("Sync failed · Retry") rather than in a toast.
 */
export async function autoSyncPrComments(repoPath: string, pr: Pick<PullRequest, 'number' | 'baseRef'>) {
  const key = syncKey(repoPath, pr.number);
  const { syncing, syncedAt, failed } = useCommentSync.getState();
  if (syncing[key] || (!failed[key] && Date.now() - (syncedAt[key] ?? 0) < AUTO_SYNC_INTERVAL)) {
    return;
  }
  const result = await pullReviewThreads(repoPath, pr).catch(() => null);
  if (!result || result.pulled === 0) {
    return;
  }
  useCommentSync.setState((state) => ({ fresh: state.fresh + result.pulled }));
}

/** Checks out a PR in `repoPath`, or opens the worktree that already has its branch checked out. */
export async function checkoutPullRequest(repoPath: string, input: string, nav: { toDiff: ToDiff; navigate: NavigateFunction }, options?: { stash?: boolean }) {
  const label = labelFor(input);
  const auth = await tauri.githubAuthStatus().catch(() => null);
  if (!auth?.authenticated) {
    toast.info('Sign in to GitHub to check out pull requests', {
      action: { label: 'Sign in to GitHub', onClick: () => openSettingsAt('github') },
    });
    return;
  }
  const title = `Opening pull request ${label}`;
  useCheckoutState.setState({ guard: null, busy: label, progress: { repoPath, title, step: 'Checking out its branch…' } });
  const id = toast.loading(`Checking out pull request ${label}…`);
  let stash: StashResult | null = null;
  try {
    const existing = await loadReturnPoint(repoPath);
    const repo = await tauri.openRepo(repoPath);
    if (options?.stash) {
      stash = await tauri.gitStashPush(repoPath, `diffity: before checking out PR ${label}`);
    }
    const pr = await tauri.checkoutPr(repoPath, input);
    const keep = existing && existing.branch !== repo.branch ? existing : null;
    const point: ReturnPoint = keep ?? { branch: repo.branch, sha: repo.headSha, stash, prNumber: pr.number };
    if (keep && stash?.sha && !keep.stash?.sha) {
      point.stash = stash;
    }
    point.prNumber = pr.number;
    await saveReturnPoint(repoPath, point);
    queryClient.invalidateQueries();
    toast.loading(`Pulling review comments for #${pr.number}…`, { id });
    useCheckoutState.setState({ progress: { repoPath, title: `Opening pull request #${pr.number}`, step: 'Pulling review comments…' } });
    const pulled = await pullPrComments(repoPath, pr).catch((error) => `Could not pull review comments: ${tauri.errorMessage(error)}`);
    nav.toDiff(prRefFor(pr));
    const details = [pulled ? `${pulled}.` : null, describeStash(stash)].filter(Boolean).join(' ');
    toast.success(`Checked out #${pr.number}`, { id, description: details || undefined });
  } catch (error) {
    if (tauri.isAppError(error) && error.code === 'dirty') {
      toast.dismiss(id);
      const fresh = await tauri.gitStatus(repoPath);
      useCheckoutState.setState({ guard: { kind: 'checkout', repoPath, input, label, status: fresh } });
      return;
    }
    let restored = '';
    if (stash?.sha) {
      restored = await tauri
        .gitStashRestore(repoPath, stash.sha)
        .then(() => ' Your stashed changes were put back.')
        .catch(() => ` ${describeStash(stash)}`);
    }
    if (tauri.isAppError(error) && error.code === 'in_worktree') {
      toast.info(`Opening the worktree of ${label}`, { id, description: `${shortPath(error.message)}${restored}` });
      void openRepoAt(error.message, nav.navigate, { extra: { pr: input } });
      return;
    }
    toast.error(`Could not check out ${label}`, { id, description: `${tauri.errorMessage(error)}${restored}` });
  } finally {
    useCheckoutState.setState({ busy: null, progress: null });
  }
}

export function returnLabel(point: ReturnPoint): string {
  if (point.branch) {
    return point.branch;
  }
  return point.sha ? point.sha.slice(0, 7) : 'previous branch';
}

export async function returnFromPullRequest(repoPath: string, nav: SwitchNav, options?: { stash?: boolean }) {
  const point = await loadReturnPoint(repoPath);
  if (!point) {
    return;
  }
  const target = point.branch ?? point.sha;
  if (!target) {
    await saveReturnPoint(repoPath, null);
    return;
  }
  const status = await tauri.gitStatus(repoPath);
  if (hasTrackedChanges(status) && !options?.stash) {
    useCheckoutState.setState({ guard: { kind: 'back', repoPath, point, status } });
    return;
  }
  const label = returnLabel(point);
  useCheckoutState.setState({ guard: null, busy: label });
  const id = toast.loading(`Switching back to ${label}…`);
  let stash: StashResult | null = null;
  try {
    if (options?.stash) {
      stash = await tauri.gitStashPush(repoPath, `diffity: changes made on PR #${point.prNumber}`);
    }
    await tauri.gitCheckout(repoPath, target);
    await saveReturnPoint(repoPath, null);
    const notes: string[] = [];
    if (point.stash?.sha) {
      const restored = await tauri
        .gitStashRestore(repoPath, point.stash.sha)
        .then(() => 'Restored the changes you had before the checkout.')
        .catch((error) => `Could not restore your earlier changes: ${tauri.errorMessage(error)}`);
      notes.push(restored);
    }
    const saved = describeStash(stash);
    if (saved) {
      notes.push(`Changes from the PR branch: ${saved}`);
    }
    queryClient.invalidateQueries();
    await landAfterSwitch(repoPath, nav);
    toast.success(`Back on ${label}`, { id, description: notes.join(' ') || undefined });
  } catch (error) {
    let restored = '';
    if (stash?.sha) {
      restored = await tauri
        .gitStashRestore(repoPath, stash.sha)
        .then(() => ' Your stashed changes were put back.')
        .catch(() => ` ${describeStash(stash)}`);
    }
    toast.error(`Could not switch back to ${label}`, { id, description: `${tauri.errorMessage(error)}${restored}` });
  } finally {
    useCheckoutState.setState({ busy: null, progress: null });
  }
}

/** `origin/feature` → `feature`, so git creates (or reuses) a local tracking branch instead of a detached HEAD. */
export function localNameFor(branch: string, isRemote: boolean): string {
  if (!isRemote) {
    return branch;
  }
  const slash = branch.indexOf('/');
  return slash > 0 ? branch.slice(slash + 1) : branch;
}

export async function switchBranch(repoPath: string, branch: string, nav: SwitchNav, options?: { stash?: boolean }) {
  const status = await tauri.gitStatus(repoPath);
  if (status.branch === branch) {
    return;
  }
  if (hasTrackedChanges(status) && !options?.stash) {
    useCheckoutState.setState({ guard: { kind: 'branch', repoPath, branch, status } });
    return;
  }
  useCheckoutState.setState({ guard: null, busy: branch });
  const id = toast.loading(`Switching to ${branch}…`);
  let stash: StashResult | null = null;
  try {
    if (options?.stash) {
      stash = await tauri.gitStashPush(repoPath, `diffity: before switching to ${branch}`);
    }
    await tauri.gitCheckout(repoPath, branch);
    queryClient.invalidateQueries();
    await landAfterSwitch(repoPath, nav);
    toast.success(`Switched to ${branch}`, { id, description: describeStash(stash) ?? undefined });
  } catch (error) {
    if (tauri.isAppError(error) && error.code === 'dirty') {
      toast.dismiss(id);
      const fresh = await tauri.gitStatus(repoPath);
      useCheckoutState.setState({ guard: { kind: 'branch', repoPath, branch, status: fresh } });
      return;
    }
    let restored = '';
    if (stash?.sha) {
      restored = await tauri
        .gitStashRestore(repoPath, stash.sha)
        .then(() => ' Your stashed changes were put back.')
        .catch(() => ` ${describeStash(stash)}`);
    }
    toast.error(`Could not switch to ${branch}`, { id, description: `${tauri.errorMessage(error)}${restored}` });
  } finally {
    useCheckoutState.setState({ busy: null, progress: null });
  }
}
