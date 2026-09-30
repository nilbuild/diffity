import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import type { PullRequest } from '../../lib/types';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitHubAuth, useGitHubPr, useGitStatus, useOwnPr } from '../../hooks/use-repo-state';
import { openCommitDialog } from './commit-dialog';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { Spinner } from '../../components/icons/spinner';
import { buttonClaude, buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { DiffStatBar } from '../../components/ui/diff-stat-bar';
import { requestAskClaude } from '../claude/ask-claude-review';
import { useCopy } from '../../hooks/use-copy';
import type { CommentThread } from '../../components/comments/types';
import { PrStateIcon, ReviewDecision, headLabel, relative } from './pr-meta';
import {
  autoSyncPrComments,
  prRefFor,
  returnFromPullRequest,
  returnLabel,
  syncKey,
  syncPrCommentsNow,
  useCheckoutState,
  useCommentSync,
  useReturnPoint,
} from './pr-checkout';
import { menuItemClass } from '../../components/layout/options-menu';
import { ArrowLeftIcon, CheckIcon, CopyIcon, GitHubIcon, GitPullRequestIcon, PushIcon, RefreshIcon, SparkleIcon, XIcon } from '../../components/ui/icon';

export const usePrDetails = create<{ open: boolean }>(() => ({ open: false }));

export function openPrDetails() {
  usePrDetails.setState({ open: true });
}

function closePrDetails() {
  usePrDetails.setState({ open: false });
}

/** The checked-out pull request, when the diff that is showing is its diff. */
export function useCurrentPr(diffRef: string | null | undefined): PullRequest | null {
  const { details } = useGitHubPr();
  const pr = details?.pr ?? null;
  if (!pr || !diffRef || diffRef !== prRefFor(pr)) {
    return null;
  }
  return pr;
}

export function stateLabel(pr: PullRequest): string {
  if (pr.state === 'MERGED') {
    return 'Merged';
  }
  if (pr.state === 'CLOSED') {
    return 'Closed';
  }
  return pr.isDraft ? 'Draft' : 'Open';
}

export function checksLabel(checks: string | null): string | null {
  if (!checks) {
    return null;
  }
  if (checks === 'SUCCESS') {
    return 'All checks passed';
  }
  if (checks === 'FAILURE' || checks === 'ERROR') {
    return 'Some checks are failing';
  }
  return 'Checks are running';
}

export function checksTone(checks: string | null): string {
  if (checks === 'SUCCESS') {
    return 'bg-added';
  }
  if (checks === 'FAILURE' || checks === 'ERROR') {
    return 'bg-deleted';
  }
  return 'bg-modified';
}

function ChecksLine(props: { checks: string | null }) {
  const { checks } = props;
  const label = checksLabel(checks);

  if (!label) {
    return <span className="text-text-muted">No checks reported</span>;
  }
  if (checks === 'SUCCESS') {
    return <span className="flex items-center gap-2"><CheckIcon size="sm" className="text-added" />{label}</span>;
  }
  if (checks === 'FAILURE' || checks === 'ERROR') {
    return <span className="flex items-center gap-2"><XIcon size="sm" className="text-deleted" />{label}</span>;
  }
  return <span className="flex items-center gap-2"><span className="mx-[3px] size-2 rounded-full bg-modified" />{label}</span>;
}

/** "Reviewing @x's PR" or "Your PR"; null until the GitHub account is known. */
export function useReviewRole(pr: PullRequest | null): string | null {
  const ownPr = useOwnPr();
  const { data: auth, isPending, isError } = useGitHubAuth();
  if (!pr || (isPending && !isError) || !auth?.login) {
    return null;
  }
  return ownPr ? 'Your PR' : `Reviewing @${pr.author}’s PR`;
}

export function useLastSynced(pr: PullRequest | null): { syncing: boolean; when: string | null; at: number | null } {
  const nav = useRepoNav();
  const key = pr ? syncKey(nav.repoPath, pr.number) : '';
  const syncing = useCommentSync((state) => !!state.syncing[key]);
  const syncedAt = useCommentSync((state) => state.syncedAt[key] ?? null);
  return { syncing, when: syncedAt ? relative(new Date(syncedAt).toISOString()) : null, at: syncedAt };
}

export interface BackAction {
  label: string;
  title: string;
  onBack: () => void;
  disabled: boolean;
}

/** "Back to <branch>" when the PR was checked out from another branch (restores stashed changes too). */
export function usePrBack(pr: PullRequest | null): BackAction | null {
  const nav = useRepoNav();
  const { data: point } = useReturnPoint(nav.repoPath);
  const busy = useCheckoutState((state) => state.busy);
  if (!pr || !point || point.prNumber !== pr.number || (point.branch ?? point.sha) === null) {
    return null;
  }
  const label = returnLabel(point);
  return {
    label,
    title: `Check out ${label} again${point.stash?.sha ? ' and restore your stashed changes' : ''}`,
    onBack: () => void returnFromPullRequest(nav.repoPath, nav.toDiff),
    disabled: busy !== null,
  };
}

export function openPrOnGitHub(pr: Pick<PullRequest, 'url'>) {
  openUrl(pr.url).catch((error) => toast.error('Could not open GitHub', { description: tauri.errorMessage(error) }));
}

function BranchChip(props: { name: string }) {
  const { name } = props;
  const { copied, copy } = useCopy();

  return (
    <button
      onClick={() => copy(name)}
      className="group inline-flex min-w-0 max-w-[320px] items-center gap-1 rounded-md bg-fill px-1.5 py-0.5 font-mono text-[11px] text-text-secondary hover:text-text cursor-pointer"
      title={`Copy ${name}`}
    >
      <span className="truncate">{name}</span>
      {copied ? <CheckIcon size="xs" className="text-added" /> : <CopyIcon size="xs" className="opacity-0 group-hover:opacity-100" />}
    </button>
  );
}

function SideSection(props: { label: string; children: ReactNode }) {
  const { label, children } = props;

  return (
    <section className="px-5 py-4 border-b border-border-muted last:border-b-0">
      <h4 className="mb-2 text-[11px] font-medium text-text-muted">{label}</h4>
      <div className="flex flex-col gap-2 text-xs text-text-secondary">{children}</div>
    </section>
  );
}

interface DetailsDialogProps {
  pr: PullRequest;
  threads: CommentThread[];
  onClose: () => void;
}

function PrDetailsDialog(props: DetailsDialogProps) {
  const { pr, threads, onClose } = props;
  const nav = useRepoNav();
  const prRef = prRefFor(pr);
  const body = pr.body.trim();
  const role = useReviewRole(pr);
  const ownPr = useOwnPr();
  const back = usePrBack(pr);
  const { syncing, when: syncedWhen } = useLastSynced(pr);
  const synced = threads.filter((thread) => thread.githubThreadId).length;
  const unsynced = Math.max(0, pr.reviewThreadCount - synced);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  const askClaude = () => {
    onClose();
    nav.toDiff(prRef);
    requestAskClaude(prRef);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-6 font-sans"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div role="dialog" aria-label={`Pull request #${pr.number}`} className="flex w-[920px] max-w-full h-[min(640px,85vh)] rounded-xl border border-overlay-border bg-bg overflow-hidden animate-fade-in">
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-6 pt-5 pb-4 border-b border-border-muted">
            <div className="flex items-start gap-3">
              <h2 className="flex-1 min-w-0 text-[18px] leading-6 font-semibold text-text">
                {pr.title} <span className="font-normal text-text-muted">#{pr.number}</span>
              </h2>
              <button onClick={onClose} className="w-7 h-7 -mr-2 -mt-1 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover cursor-pointer" title="Close (Esc)">
                <XIcon size="md" />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="inline-flex items-center gap-1.5 h-5 px-2 rounded-full bg-fill font-medium text-text">
                <PrStateIcon pr={pr} className="h-3.5 w-3.5" />
                {stateLabel(pr)}
              </span>
              <span><span className="font-medium text-text">{pr.author}</span> wants to merge into <code className="font-mono">{pr.baseRef}</code></span>
              {pr.createdAt && <span className="text-text-muted">· opened {relative(pr.createdAt)}</span>}
              {role && (
                <span
                  className={cn('inline-flex h-5 items-center px-2 rounded-full text-[11px] font-medium', ownPr ? 'bg-claude/12 text-claude' : 'bg-fill text-text-secondary')}
                  title={ownPr ? 'You opened this pull request: comments are notes for Claude; reviewers’ comments can be sent to Claude too' : 'Someone else’s pull request: your comments form a GitHub review'}
                >
                  {role}
                </span>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 text-[13px] leading-relaxed text-text-secondary">
            {body ? <MarkdownContent content={body} /> : <p className="text-text-muted">No description provided.</p>}
          </div>
        </div>
        <aside className="w-[300px] shrink-0 border-l border-border-muted bg-sidebar overflow-y-auto">
          <SideSection label="Status">
            <span className="flex items-center gap-2 text-text">
              <PrStateIcon pr={pr} className="h-3.5 w-3.5" />
              {stateLabel(pr)}
            </span>
            <ReviewDecision decision={pr.reviewDecision} />
          </SideSection>
          <SideSection label="Branches">
            <span className="flex flex-wrap items-center gap-1.5">
              <BranchChip name={pr.baseRef} />
              <span className="text-text-muted">←</span>
              <BranchChip name={headLabel(pr)} />
            </span>
            {pr.isCrossRepository && pr.headRepo && <span className="text-text-muted">From fork {pr.headRepo}</span>}
          </SideSection>
          <SideSection label="Checks">
            <ChecksLine checks={pr.checks} />
          </SideSection>
          <SideSection label="Changes">
            <span className="flex items-center gap-2.5 tabular-nums">
              <span>{pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'}</span>
              <span className="font-mono text-added">+{pr.additions}</span>
              <span className="font-mono text-deleted">−{pr.deletions}</span>
              <DiffStatBar additions={pr.additions} deletions={pr.deletions} />
            </span>
          </SideSection>
          <SideSection label="Comments on GitHub">
            <span>
              {pr.reviewThreadCount} review thread{pr.reviewThreadCount === 1 ? '' : 's'}
              {unsynced > 0 ? ` · ${unsynced} not pulled yet` : ''}
            </span>
            <span className="text-text-muted" title="Syncs on its own when you open the PR and when you come back to the app">{syncedWhen ? `Synced ${syncedWhen}` : 'Not synced yet'}</span>
            <button onClick={() => void syncPrCommentsNow(nav.repoPath, pr)} disabled={syncing} className={cn(buttonOutline, 'self-start')}>
              {syncing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshIcon size="sm" className="text-text-secondary" />}
              {syncing ? 'Syncing…' : 'Sync comments now'}
            </button>
          </SideSection>
          <SideSection label="Actions">
            <button onClick={() => openPrOnGitHub(pr)} className={cn(buttonGhost, 'justify-start -ml-2.5')}>
              <GitHubIcon size="sm" />
              Open on GitHub
            </button>
            {back && (
              <button onClick={back.onBack} disabled={back.disabled} className={cn(buttonGhost, 'justify-start -ml-2.5')} title={back.title}>
                <ArrowLeftIcon size="sm" />
                <span className="truncate">Back to {back.label}</span>
              </button>
            )}
            <button onClick={askClaude} className={cn(buttonClaude, 'self-start')}>
              <SparkleIcon size="sm" />
              Ask Claude to review
            </button>
          </SideSection>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Everything the PR view needs besides the ref chip: quiet comment sync (on opening the PR diff and on window
 * focus, at most once a minute) and the details dialog. Renders nothing in the layout.
 */
export function PrSession(props: { diffRef: string; threads: CommentThread[] }) {
  const { diffRef, threads } = props;
  const nav = useRepoNav();
  const pr = useCurrentPr(diffRef);
  const open = usePrDetails((state) => state.open);
  const number = pr?.number ?? null;
  const baseRef = pr?.baseRef ?? null;

  useEffect(() => {
    if (number === null || baseRef === null) {
      return;
    }
    const target = { number, baseRef };
    void autoSyncPrComments(nav.repoPath, target);
    const onFocus = () => {
      void autoSyncPrComments(nav.repoPath, target);
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [nav.repoPath, number, baseRef]);

  useEffect(() => () => closePrDetails(), []);

  if (!pr || !open) {
    return null;
  }
  return <PrDetailsDialog pr={pr} threads={threads} onClose={closePrDetails} />;
}

/**
 * The one own-PR action that earns a title-bar slot when there is something to publish: Commit & push, or Push N
 * commits. Reviewer comments go through Send N to Claude (it lists them).
 */
export function OwnPrAction(props: { diffRef: string | null }) {
  const { diffRef } = props;
  const nav = useRepoNav();
  const ownPr = useOwnPr();
  const { details } = useGitHubPr();
  const { data: status } = useGitStatus();
  const pr = details?.pr ?? null;

  if (!ownPr || !pr || !status || !diffRef) {
    return null;
  }
  if (diffRef !== prRefFor(pr) && diffRef !== 'work' && diffRef !== 'staged' && diffRef !== 'unstaged') {
    return null;
  }
  const uncommitted = status.staged + status.unstaged + status.untracked;
  if (uncommitted > 0) {
    return (
      <button
        onClick={() => openCommitDialog(pr.number)}
        className={cn(buttonPrimary, 'px-2.5')}
        title={`${uncommitted} uncommitted file${uncommitted === 1 ? '' : 's'} on the branch of your PR #${pr.number}`}
      >
        <PushIcon size="md" />
        Commit & push
      </button>
    );
  }
  if (status.ahead === 0) {
    return null;
  }
  const pushNow = async () => {
    const id = toast.loading('Pushing…');
    try {
      const result = await tauri.gitPush(nav.repoPath);
      if (result.ok) {
        toast.success(`Pushed to PR #${pr.number}`, { id });
        return;
      }
      toast.error('Push failed', { id, description: result.output });
    } catch (error) {
      toast.error('Push failed', { id, description: tauri.errorMessage(error) });
    }
  };
  return (
    <button onClick={() => void pushNow()} className={cn(buttonPrimary, 'px-2.5')} title={`Push your local commits so PR #${pr.number} updates`}>
      <PushIcon size="md" />
      Push {status.ahead} commit{status.ahead === 1 ? '' : 's'}
    </button>
  );
}

/** PR entries at the top of the title bar's ⋯ menu while the PR diff is showing. */
export function PrMenuItems(props: { diffRef: string | null; close: () => void }) {
  const { diffRef, close } = props;
  const nav = useRepoNav();
  const pr = useCurrentPr(diffRef);
  const back = usePrBack(pr);
  const { syncing, when, at } = useLastSynced(pr);

  if (!pr) {
    return null;
  }
  const run = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <>
      <button className={menuItemClass} onClick={run(openPrDetails)}>
        <GitPullRequestIcon className="w-3.5 h-3.5" />
        Pull request details…
      </button>
      <button className={menuItemClass} onClick={run(() => openPrOnGitHub(pr))}>
        <GitHubIcon className="w-3.5 h-3.5" />
        Open on GitHub
      </button>
      <button className={menuItemClass} disabled={syncing} onClick={run(() => void syncPrCommentsNow(nav.repoPath, pr))} title={when ? `Last synced ${when}` : 'Not synced yet'}>
        {syncing ? <Spinner className="w-3.5 h-3.5" /> : <RefreshIcon className="w-3.5 h-3.5" />}
        <span className="whitespace-nowrap">{syncing ? 'Syncing comments…' : 'Sync comments now'}</span>
        {!syncing && at && <span className="ml-auto pl-2 text-[11px] text-text-muted whitespace-nowrap">{shortAgo(at)}</span>}
      </button>
      {back && (
        <button className={menuItemClass} disabled={back.disabled} onClick={run(back.onBack)} title={back.title}>
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          <span className="truncate">Back to {back.label}</span>
        </button>
      )}
      <div className="border-t border-overlay-border my-1 -mx-1" />
    </>
  );
}

function shortAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

/** "Comments synced 2 minutes ago · Sync comments now", for the review popover. */
export function PrSyncRow(props: { prNumber: number; className?: string }) {
  const { prNumber, className } = props;
  const nav = useRepoNav();
  const { details } = useGitHubPr();
  const pr = details?.pr && details.pr.number === prNumber ? details.pr : null;
  const { syncing, when } = useLastSynced(pr);

  if (!pr) {
    return null;
  }
  return (
    <div className={cn('flex items-center gap-2 text-xs text-text-muted', className)}>
      <GitHubIcon size="xs" />
      <span className="min-w-0 truncate">{syncing ? 'Syncing comments from GitHub…' : when ? `Comments synced ${when}` : 'Comments not synced yet'}</span>
      <button
        onClick={() => void syncPrCommentsNow(nav.repoPath, pr)}
        disabled={syncing}
        className="shrink-0 inline-flex items-center gap-1 text-text-secondary hover:text-text underline-offset-2 hover:underline cursor-pointer disabled:opacity-45 disabled:cursor-default"
      >
        {syncing ? <Spinner className="w-3 h-3" /> : <RefreshIcon size="xs" />}
        Sync comments now
      </button>
    </div>
  );
}
