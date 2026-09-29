import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import type { PullRequest } from '../../lib/types';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { Spinner } from '../../components/icons/spinner';
import { buttonOutline } from '../../components/ui/button-styles';
import { useCopy } from '../../hooks/use-copy';
import type { CommentThread } from '../../components/comments/types';
import { PrStateIcon, ReviewDecision, headLabel, relative } from './pr-meta';
import { prRefFor, pullPrComments, returnFromPullRequest, returnLabel, useCheckoutState, useReturnPoint } from './pr-checkout';
import { ArrowLeftIcon, CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon, ExternalLinkIcon, XIcon } from '../../components/ui/icon';

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

const iconButton =
  'relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-hover hover:text-text disabled:opacity-50';

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

function DetailRow(props: { label: string; children: React.ReactNode }) {
  const { label, children } = props;

  return (
    <div className="flex items-start gap-3 min-h-6">
      <span className="w-20 shrink-0 pt-0.5 text-xs text-text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-text-secondary">{children}</div>
    </div>
  );
}

export function PrBar(props: { diffRef: string; threads?: CommentThread[] }) {
  const { diffRef, threads = [] } = props;
  const nav = useRepoNav();
  const { details } = useGitHubPr();
  const pr = details?.pr ?? null;
  const onPr = !!pr && diffRef === prRefFor(pr);
  const { data: point } = useReturnPoint(nav.repoPath);
  const busy = useCheckoutState((state) => state.busy);
  const [expanded, setExpanded] = useState(false);
  const [showBody, setShowBody] = useState(true);
  const { syncing, sync, syncedAt } = useCommentSync(nav.repoPath, onPr ? pr : null);

  if (!onPr || !pr) {
    return null;
  }

  const body = pr.body.trim();
  const showBack = !!point && point.prNumber === pr.number && (point.branch ?? point.sha) !== null;
  const checks = checksInfo(pr.checks);
  const synced = threads.filter((thread) => thread.githubThreadId).length;
  const unsynced = Math.max(0, pr.reviewThreadCount - synced);
  const syncTitle = `Pull review comments from GitHub (read-only). ${syncedAt ? `Last synced ${relative(new Date(syncedAt).toISOString())}` : 'Not synced yet'}${unsynced > 0 ? ` · ${unsynced} on GitHub not here yet` : ''}`;

  return (
    <div className="shrink-0 border-b border-border-muted bg-bg font-sans">
      <div className="flex h-10 items-center gap-2 pl-4 pr-3">
        <span className="flex shrink-0 items-center" title={stateLabel(pr)}>
          <PrStateIcon pr={pr} className="h-4 w-4" />
        </span>
        <span className="min-w-0 truncate text-[13px] font-semibold text-text" title={pr.title}>
          {pr.title}
        </span>
        <span className="shrink-0 text-[13px] text-text-muted tabular-nums">#{pr.number}</span>
        <span className="min-w-2 flex-1" />
        {checks && (
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center" title={checks.label}>
            {checks.icon}
          </span>
        )}
        <button onClick={() => void sync(true)} disabled={syncing} className={iconButton} title={syncTitle} aria-label="Sync comments from GitHub">
          {syncing ? <Spinner className="h-3.5 w-3.5" /> : <DownloadIcon size="md" />}
          {!syncing && unsynced > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-[3px] rounded-full bg-text text-bg text-[9px] font-semibold leading-[15px] text-center tabular-nums">
              {unsynced > 99 ? '99+' : unsynced}
            </span>
          )}
        </button>
        <a href={pr.url} className={iconButton} title="Open on GitHub" aria-label="Open on GitHub">
          <ExternalLinkIcon size="md" />
        </a>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(iconButton, expanded && 'bg-hover text-text')}
          title={expanded ? 'Hide details' : 'Details: branches, author, checks and description'}
          aria-expanded={expanded}
          aria-label="Pull request details"
        >
          <ChevronDownIcon size="md" className={cn('transition-transform', expanded && 'rotate-180')} />
        </button>
        {showBack && point && (
          <button
            onClick={() => void returnFromPullRequest(nav.repoPath, nav.toDiff)}
            disabled={busy !== null}
            className={cn(buttonOutline, 'ml-1 h-7 px-2')}
            title={`Check out ${returnLabel(point)} again${point.stash?.sha ? ' and restore your stashed changes' : ''}`}
          >
            <ArrowLeftIcon size="sm" />
            <span className="max-w-[140px] truncate">Back to {returnLabel(point)}</span>
          </button>
        )}
      </div>
      {expanded && (
        <div className="max-h-[45vh] overflow-y-auto border-t border-border-muted bg-bg-secondary px-4 py-3 animate-fade-in">
          <div className="flex flex-col gap-1.5">
            <DetailRow label="Status">
              <span className="font-medium text-text">{stateLabel(pr)}</span>
              <ReviewDecision decision={pr.reviewDecision} />
            </DetailRow>
            <DetailRow label="Branches">
              <BranchChip name={pr.baseRef} />
              <span className="text-text-muted">←</span>
              <BranchChip name={headLabel(pr)} />
              {pr.isCrossRepository && pr.headRepo && <span className="text-text-muted">from fork {pr.headRepo}</span>}
            </DetailRow>
            <DetailRow label="Author">
              <span className="text-text">{pr.author}</span>
              {pr.createdAt && <span className="text-text-muted">opened {relative(pr.createdAt)}</span>}
              {pr.updatedAt && <span className="text-text-muted">· updated {relative(pr.updatedAt)}</span>}
            </DetailRow>
            <DetailRow label="Checks">
              {checks ? <>{checks.icon}<span>{checks.label}</span></> : <span className="text-text-muted">No checks reported</span>}
            </DetailRow>
            <DetailRow label="Changes">
              <span>{pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'}</span>
              <span className="text-added">+{pr.additions}</span>
              <span className="text-deleted">−{pr.deletions}</span>
              <span className="text-text-muted">· {pr.reviewThreadCount} review thread{pr.reviewThreadCount === 1 ? '' : 's'} on GitHub</span>
            </DetailRow>
          </div>
          <div className="mt-3 border-t border-border-muted pt-2">
            <button
              onClick={() => setShowBody(!showBody)}
              className="flex items-center gap-1.5 h-6 text-xs font-medium text-text-secondary hover:text-text cursor-pointer"
              aria-expanded={showBody}
            >
              <ChevronDownIcon size="xs" className={cn('transition-transform', !showBody && '-rotate-90')} />
              Description
            </button>
            {showBody && (
              <div className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                {body ? <MarkdownContent content={body} /> : <span className="text-text-muted">No description provided.</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
