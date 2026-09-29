import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import type { PullRequest } from '../../lib/types';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitHubAuth, useGitHubPr, useGitStatus, useOwnPr } from '../../hooks/use-repo-state';
import { Skeleton, useRevealClass } from '../../components/ui/skeleton';
import { isPrShapedRef } from '../../components/layout/ref-menu';
import { openCommitDialog } from './commit-dialog';
import { requestSendToClaude, reviewerThreads } from '../review/finish-review';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { Spinner } from '../../components/icons/spinner';
import { buttonClaude, buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { DiffStatBar } from '../../components/ui/diff-stat-bar';
import { requestAskClaude } from '../claude/ask-claude-review';
import { useCopy } from '../../hooks/use-copy';
import type { CommentThread } from '../../components/comments/types';
import { PrStateIcon, ReviewDecision, headLabel, relative } from './pr-meta';
import { prRefFor, pullPrComments, returnFromPullRequest, returnLabel, useCheckoutState, useReturnPoint } from './pr-checkout';
import { ArrowLeftIcon, CheckIcon, CommentIcon, CopyIcon, GitHubIcon, RefreshIcon, SparkleIcon, XIcon } from '../../components/ui/icon';

const autoPulled = new Set<string>();
const lastSynced = new Map<string, number>();

function useCommentSync(repoPath: string, pr: PullRequest | null) {
  const [syncing, setSyncing] = useState(false);
  const key = pr ? `${repoPath}#${pr.number}` : null;

  const sync = async (manual: boolean) => {
    if (!pr || !key) {
      return;
    }
    setSyncing(true);
    try {
      const summary = await pullPrComments(repoPath, pr);
      lastSynced.set(key, Date.now());
      if (manual) {
        toast.success(summary ?? 'No review comments on this pull request yet');
      }
    } catch (error) {
      if (manual) {
        toast.error('Could not pull review comments', { description: tauri.errorMessage(error) });
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!key || autoPulled.has(key)) {
      return;
    }
    autoPulled.add(key);
    void sync(false);
  }, [key]);

  return { syncing, sync, syncedAt: key ? lastSynced.get(key) ?? null : null };
}


function stateLabel(pr: PullRequest): string {
  if (pr.state === 'MERGED') {
    return 'Merged';
  }
  if (pr.state === 'CLOSED') {
    return 'Closed';
  }
  return pr.isDraft ? 'Draft' : 'Open';
}

function checksInfo(checks: string | null): { label: string; icon: React.ReactNode } | null {
  if (!checks) {
    return null;
  }
  if (checks === 'SUCCESS') {
    return { label: 'All checks passed', icon: <CheckIcon size="sm" className="text-added" /> };
  }
  if (checks === 'FAILURE' || checks === 'ERROR') {
    return { label: 'Some checks are failing', icon: <XIcon size="sm" className="text-deleted" /> };
  }
  return { label: 'Checks are running', icon: <span className="size-2 rounded-full bg-modified" /> };
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
  repoPath: string;
  prRef: string;
  syncing: boolean;
  syncedAt: number | null;
  unsynced: number;
  onSync: () => void;
  onReview: () => void;
  back: { label: string; title: string; onBack: () => void; disabled: boolean } | null;
  onClose: () => void;
}

function PrDetailsDialog(props: DetailsDialogProps) {
  const { pr, prRef, syncing, syncedAt, unsynced, onSync, onReview, back, onClose } = props;
  const body = pr.body.trim();
  const checks = checksInfo(pr.checks);

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
    onReview();
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
            {checks ? <span className="flex items-center gap-2">{checks.icon}{checks.label}</span> : <span className="text-text-muted">No checks reported</span>}
          </SideSection>
          <SideSection label="Changes">
            <span className="flex items-center gap-2.5 tabular-nums">
              <span>{pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'}</span>
              <span className="font-mono text-added">+{pr.additions}</span>
              <span className="font-mono text-deleted">−{pr.deletions}</span>
              <DiffStatBar additions={pr.additions} deletions={pr.deletions} />
            </span>
            <button
              onClick={() => {
                onClose();
                onReview();
              }}
              className={cn(buttonPrimary, 'self-start')}
            >
              View PR diff
            </button>
          </SideSection>
          <SideSection label="Comments on GitHub">
            <span>
              {pr.reviewThreadCount} review thread{pr.reviewThreadCount === 1 ? '' : 's'}
              {unsynced > 0 ? ` · ${unsynced} not pulled yet` : ''}
            </span>
            <span className="text-text-muted">{syncedAt ? `Last synced ${relative(new Date(syncedAt).toISOString())}` : 'Not synced yet'}</span>
            <button onClick={onSync} disabled={syncing} className={cn(buttonOutline, 'self-start')}>
              {syncing ? <Spinner className="h-3.5 w-3.5" /> : <RefreshIcon size="sm" className="text-text-secondary" />}
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </SideSection>
          <SideSection label="Actions">
            <a href={pr.url} className={cn(buttonGhost, 'justify-start -ml-2.5')}>
              <GitHubIcon size="sm" />
              Open on GitHub
            </a>
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

/** The PR bar's box while the pull request for a branch-vs-base view is still being looked up. */
function PrBarSkeleton() {
  return (
    <div aria-busy className="shrink-0 border-b border-border-muted bg-bg font-sans">
      <div className="flex h-10 items-center gap-2 pl-4 pr-3">
        <Skeleton circle className="h-4 w-4" />
        <Skeleton className="h-3 w-72" />
        <Skeleton className="h-3 w-10" />
        <Skeleton className="ml-1 h-5 w-36 rounded-full" />
        <span className="min-w-2 flex-1" />
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="h-7 w-20 rounded-md" />
      </div>
    </div>
  );
}

export function PrBar(props: { diffRef: string; threads?: CommentThread[] }) {
  const { diffRef, threads = [] } = props;
  const nav = useRepoNav();
  const { details, loading } = useGitHubPr();
  const { isPending: authPending, isError: authFailed } = useGitHubAuth();
  const reveal = useRevealClass(loading);
  const pr = details?.pr ?? null;
  const onPr = !!pr && diffRef === prRefFor(pr);
  const { data: point } = useReturnPoint(nav.repoPath);
  const busy = useCheckoutState((state) => state.busy);
  const [dialog, setDialog] = useState(false);
  const ownPr = useOwnPr();
  const { data: status } = useGitStatus();
  const { syncing, sync, syncedAt } = useCommentSync(nav.repoPath, onPr ? pr : null);

  if (!onPr || !pr) {
    if (loading && isPrShapedRef(diffRef)) {
      return <PrBarSkeleton />;
    }
    return null;
  }

  const prRef = prRefFor(pr);
  const reviewerOpen = reviewerThreads(threads).length;
  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const ahead = status?.ahead ?? 0;
  const pushNow = async () => {
    const id = toast.loading('Pushing…');
    try {
      const result = await tauri.gitPush(nav.repoPath);
      if (result.ok) {
        toast.success(`Pushed to PR #${pr.number}`, { id });
      } else {
        toast.error('Push failed', { id, description: result.output });
      }
    } catch (error) {
      toast.error('Push failed', { id, description: tauri.errorMessage(error) });
    }
  };
  const showBack = !!point && point.prNumber === pr.number && (point.branch ?? point.sha) !== null;
  const checks = checksInfo(pr.checks);
  const synced = threads.filter((thread) => thread.githubThreadId).length;
  const unsynced = Math.max(0, pr.reviewThreadCount - synced);
  const syncTitle = `Pull review comments from GitHub into this view (read-only). ${syncedAt ? `Last synced ${relative(new Date(syncedAt).toISOString())}` : 'Not synced yet'}${unsynced > 0 ? ` · ${unsynced} not pulled yet` : ''}`;
  const back = showBack && point
    ? {
      label: returnLabel(point),
      title: `Check out ${returnLabel(point)} again${point.stash?.sha ? ' and restore your stashed changes' : ''}`,
      onBack: () => void returnFromPullRequest(nav.repoPath, nav.toDiff),
      disabled: busy !== null,
    }
    : null;

  return (
    <div className={cn('shrink-0 border-b border-border-muted bg-bg font-sans', reveal)}>
      <div className="flex h-10 items-center gap-2 pl-4 pr-3">
        <span className="flex shrink-0 items-center" title={stateLabel(pr)}>
          <PrStateIcon pr={pr} className="h-4 w-4" />
        </span>
        <button
          onClick={() => setDialog(true)}
          className="min-w-0 truncate text-[13px] font-semibold text-text hover:underline decoration-text-muted/50 underline-offset-2 cursor-pointer text-left"
          title="Show pull request details"
        >
          {pr.title}
        </button>
        <span className="shrink-0 text-[13px] text-text-muted tabular-nums">#{pr.number}</span>
        {checks && (
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center" title={checks.label}>
            {checks.icon}
          </span>
        )}
        {authPending && !authFailed ? <Skeleton className="ml-1 h-5 w-36 rounded-full" /> : (
          <span
            className={cn('ml-1 shrink-0 inline-flex h-5 items-center px-2.5 rounded-full text-[11px] font-medium', ownPr ? 'bg-claude/12 text-claude' : 'bg-fill text-text-secondary')}
            title={ownPr ? 'You opened this pull request: comments are notes for Claude; reviewers’ comments can be sent to Claude too' : 'Someone else’s pull request: your comments form a GitHub review'}
          >
            {ownPr ? 'Your PR' : `Reviewing @${pr.author}’s PR`}
          </span>
        )}
        <button onClick={() => setDialog(true)} className={cn(buttonOutline, 'h-6 px-2 text-xs')} title="Description, branches, checks and actions">
          Details
        </button>
        <span className="min-w-2 flex-1" />
        {ownPr && reviewerOpen > 0 && (
          <button onClick={requestSendToClaude} className={cn(buttonClaude, 'h-7 px-2.5')} title="Send reviewers’ open comments to Claude; you pick which and whether its replies go back to GitHub">
            <SparkleIcon size="sm" />
            Address {reviewerOpen} reviewer comment{reviewerOpen === 1 ? '' : 's'}
          </button>
        )}
        {ownPr && uncommitted > 0 && (
          <button onClick={() => openCommitDialog(pr.number)} className={cn(buttonPrimary, 'h-7 px-2.5')} title={`${uncommitted} uncommitted file${uncommitted === 1 ? '' : 's'} on this branch`}>
            Commit & push
          </button>
        )}
        {ownPr && uncommitted === 0 && ahead > 0 && (
          <button onClick={() => void pushNow()} className={cn(buttonPrimary, 'h-7 px-2.5')} title="Push your local commits so the pull request updates">
            Push {ahead} commit{ahead === 1 ? '' : 's'}
          </button>
        )}
        <button onClick={() => void sync(true)} disabled={syncing} className={cn(buttonGhost, 'relative h-7 px-2')} title={syncTitle}>
          {syncing ? <Spinner className="h-3.5 w-3.5" /> : <CommentIcon size="sm" />}
          {syncing ? 'Syncing…' : 'Sync comments'}
          {!syncing && unsynced > 0 && (
            <span className="min-w-[16px] h-4 px-1 rounded-full bg-text text-bg text-[10px] font-semibold leading-4 text-center tabular-nums">
              {unsynced > 99 ? '99+' : unsynced}
            </span>
          )}
        </button>
        <a href={pr.url} className={cn(buttonGhost, 'h-7 px-2')} title="Open this pull request on GitHub">
          <GitHubIcon size="sm" />
          GitHub
        </a>
        {back && (
          <button onClick={back.onBack} disabled={back.disabled} className={cn(buttonOutline, 'ml-1 h-7 px-2')} title={back.title}>
            <ArrowLeftIcon size="sm" />
            <span className="max-w-[140px] truncate">Back to {back.label}</span>
          </button>
        )}
      </div>
      {dialog && (
        <PrDetailsDialog
          pr={pr}
          repoPath={nav.repoPath}
          prRef={prRef}
          syncing={syncing}
          syncedAt={syncedAt}
          unsynced={unsynced}
          onSync={() => void sync(true)}
          onReview={() => nav.toDiff(prRef)}
          back={back}
          onClose={() => setDialog(false)}
        />
      )}
    </div>
  );
}
