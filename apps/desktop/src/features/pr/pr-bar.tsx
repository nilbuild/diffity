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
import { ChecksStatus, PrStateBadge, ReviewDecision, headLabel, relative } from './pr-meta';
import { prRefFor, pullPrComments, returnFromPullRequest, returnLabel, useCheckoutState, useReturnPoint } from './pr-checkout';
import { ArrowLeftIcon, ChevronDownIcon, DownloadIcon, ExternalLinkIcon } from '../../components/ui/icon';

const autoPulled = new Set<string>();

function useCommentSync(repoPath: string, pr: PullRequest | null) {
  const [syncing, setSyncing] = useState(false);

  const sync = async (manual: boolean) => {
    if (!pr) {
      return;
    }
    setSyncing(true);
    try {
      const summary = await pullPrComments(repoPath, pr);
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

  const key = pr ? `${repoPath}#${pr.number}` : null;
  useEffect(() => {
    if (!key || autoPulled.has(key)) {
      return;
    }
    autoPulled.add(key);
    void sync(false);
  }, [key]);

  return { syncing, sync };
}

const actionClass =
  'inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-text-secondary transition-colors hover:bg-hover hover:text-text disabled:opacity-50';

export function PrBar(props: { diffRef: string }) {
  const { diffRef } = props;
  const nav = useRepoNav();
  const { details } = useGitHubPr();
  const pr = details?.pr ?? null;
  const onPr = !!pr && diffRef === prRefFor(pr);
  const { data: point } = useReturnPoint(nav.repoPath);
  const busy = useCheckoutState((state) => state.busy);
  const [expanded, setExpanded] = useState(false);
  const { syncing, sync } = useCommentSync(nav.repoPath, onPr ? pr : null);

  if (!onPr || !pr) {
    return null;
  }

  const body = pr.body.trim();
  const showBack = !!point && point.prNumber === pr.number && (point.branch ?? point.sha) !== null;

  return (
    <div className="shrink-0 bg-bg-secondary border-b border-border font-sans">
      <div className="flex h-10 items-center gap-2.5 px-3 text-xs">
        <PrStateBadge pr={pr} />
        <span className="min-w-0 truncate text-[13px] font-semibold text-text" title={pr.title}>
          {pr.title}
        </span>
        <a href={pr.url} className="shrink-0 text-text-muted hover:text-text" title="Open on GitHub">
          #{pr.number}
        </a>
        <span className="hidden shrink-0 text-text-muted xl:inline">
          <span className="font-medium text-text-secondary">{pr.author}</span> wants to merge into
        </span>
        <span className="hidden min-w-0 items-center gap-1 font-mono text-[11px] lg:flex" title={`${headLabel(pr)} into ${pr.baseRef}`}>
          <span className="shrink-0 rounded bg-diff-hunk-bg px-1.5 py-0.5 text-diff-hunk-text">{pr.baseRef}</span>
          <span className="shrink-0 text-text-muted">←</span>
          <span className="max-w-[280px] truncate rounded bg-diff-hunk-bg px-1.5 py-0.5 text-diff-hunk-text">{headLabel(pr)}</span>
        </span>
        <span className="hidden shrink-0 items-center gap-2 text-[11px] 2xl:flex">
          <ReviewDecision decision={pr.reviewDecision} />
          <ChecksStatus checks={pr.checks} withLabel />
        </span>
        <span className="flex-1" />
        <span className="flex shrink-0 items-center gap-2 text-[11px] 2xl:hidden">
          <ChecksStatus checks={pr.checks} />
        </span>
        {pr.updatedAt && <span className="hidden shrink-0 text-[11px] text-text-muted xl:inline">updated {relative(pr.updatedAt)}</span>}
        <button onClick={() => setExpanded(!expanded)} className={cn(actionClass, expanded && 'bg-hover text-text')} title="Pull request description">
          Description
          <ChevronDownIcon className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
        </button>
        <button onClick={() => void sync(true)} disabled={syncing} className={actionClass} title="Pull review comments from GitHub (read-only)">
          {syncing ? <Spinner className="h-3 w-3" /> : <DownloadIcon className="h-3 w-3" />}
          {syncing ? 'Syncing…' : 'Sync comments'}
        </button>
        <a href={pr.url} className={actionClass} title="Open on GitHub">
          <ExternalLinkIcon className="h-3 w-3" />
          <span className="hidden lg:inline">GitHub</span>
        </a>
        {showBack && point && (
          <button
            onClick={() => void returnFromPullRequest(nav.repoPath, nav.toDiff)}
            disabled={busy !== null}
            className={cn(buttonOutline, 'h-6 px-2')}
            title={`Check out ${returnLabel(point)} again${point.stash?.sha ? ' and restore your stashed changes' : ''}`}
          >
            <ArrowLeftIcon className="h-3 w-3" />
            <span className="max-w-[140px] truncate">Back to {returnLabel(point)}</span>
          </button>
        )}
      </div>
      {expanded && (
        <div className="max-h-[40vh] overflow-y-auto border-t border-border-muted px-4 py-3 text-[13px] leading-relaxed text-text-secondary">
          {body ? <MarkdownContent content={body} /> : <span className="text-text-muted">No description provided.</span>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
            <span>
              {pr.changedFiles} file{pr.changedFiles === 1 ? '' : 's'} · <span className="text-added">+{pr.additions}</span>{' '}
              <span className="text-deleted">−{pr.deletions}</span>
            </span>
            {pr.createdAt && <span>opened {relative(pr.createdAt)} by {pr.author}</span>}
            <span>
              {pr.reviewThreadCount} review thread{pr.reviewThreadCount === 1 ? '' : 's'} on GitHub
            </span>
            {pr.isCrossRepository && pr.headRepo && <span>from fork {pr.headRepo}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
