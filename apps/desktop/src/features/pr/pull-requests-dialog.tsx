import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import { buttonPrimary } from '../../components/ui/button-styles';
import type { PullRequest } from '../../lib/types';
import { closePullRequests, openSettingsAt, useUi } from '../../lib/ui-store';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitHubAuth, useGitHubPr, useHasGitHubRemote } from '../../hooks/use-repo-state';
import { Spinner } from '../../components/icons/spinner';
import { ChecksStatus, PrStateIcon, ReviewDecision, headLabel, relative } from './pr-meta';
import { checkoutPullRequest, parsePrInput, prRefFor, useCheckoutState } from './pr-checkout';
import { GitHubIcon, GitPullRequestIcon, RefreshIcon, SearchIcon, XIcon } from '../../components/ui/icon';

export function usePullRequests(enabled: boolean) {
  const repoPath = useRepoNav().repoPath;
  return useQuery({
    queryKey: ['pull-requests', repoPath],
    queryFn: () => tauri.listPrs(repoPath),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

function matches(pr: PullRequest, needle: string): boolean {
  if (!needle) {
    return true;
  }
  const haystack = `${pr.number} #${pr.number} ${pr.title} ${pr.author} ${pr.headRef} ${pr.headRepo ?? ''} ${pr.baseRef}`.toLowerCase();
  return needle
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function PrRow(props: { pr: PullRequest; active: boolean; current: boolean; busy: boolean; onPick: () => void; onHover: () => void }) {
  const { pr, active, current, busy, onPick, onHover } = props;

  return (
    <button
      type="button"
      onClick={onPick}
      onMouseMove={onHover}
      data-active={active || undefined}
      className={cn('flex w-full cursor-pointer items-start gap-2.5 px-4 py-2 text-left transition-colors', active && 'bg-hover')}
    >
      <PrStateIcon pr={pr} className="mt-0.5 h-3.5 w-3.5" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-text">{pr.title}</span>
          {pr.isDraft && <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-text-muted">Draft</span>}
          {current && <span className="shrink-0 rounded-full bg-accent/10 px-1.5 text-[10px] font-medium text-accent">Checked out</span>}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-text-muted">
          <span className="shrink-0">#{pr.number}</span>
          <span>·</span>
          <span className="shrink-0">{pr.author}</span>
          {pr.updatedAt && (
            <>
              <span>·</span>
              <span className="shrink-0">updated {relative(pr.updatedAt)}</span>
            </>
          )}
          <span>·</span>
          <span className="truncate font-mono" title={`${headLabel(pr)} → ${pr.baseRef}`}>
            {headLabel(pr)}
          </span>
        </span>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-2 text-[11px]">
        <ReviewDecision decision={pr.reviewDecision} />
        <ChecksStatus checks={pr.checks} />
        {(pr.additions > 0 || pr.deletions > 0) && (
          <span className="font-mono tabular-nums">
            <span className="text-added">+{pr.additions}</span> <span className="text-deleted">−{pr.deletions}</span>
          </span>
        )}
        {busy && <Spinner className="h-3 w-3" />}
      </span>
    </button>
  );
}

function EmptyState(props: { title: string; detail: string; action?: { label: string; onClick: () => void } }) {
  const { title, detail, action } = props;

  return (
    <div className="flex flex-col items-center px-8 py-10 text-center">
      <GitPullRequestIcon className="mb-2 h-5 w-5 text-text-muted" />
      <div className="text-[13px] font-medium text-text">{title}</div>
      <div className="mt-1 max-w-sm text-xs text-text-muted">{detail}</div>
      {action && (
        <button
          onClick={action.onClick}
          className={cn(buttonPrimary, 'mt-3')}
        >
          <GitHubIcon className="h-3 w-3" />
          {action.label}
        </button>
      )}
    </div>
  );
}

function PullRequestsBody() {
  const nav = useRepoNav();
  const hasRemote = useHasGitHubRemote();
  const { data: auth, isLoading: authLoading } = useGitHubAuth();
  const signedIn = !!auth?.authenticated;
  const { data: prs, isLoading, isFetching, error, refetch } = usePullRequests(hasRemote && signedIn);
  const { details } = useGitHubPr();
  const busy = useCheckoutState((state) => state.busy);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const direct = parsePrInput(query);
  const filtered = useMemo(() => (prs ?? []).filter((pr) => matches(pr, direct ? '' : query.trim())), [prs, query, direct]);
  const exact = direct ? (prs ?? []).find((pr) => String(pr.number) === direct.replace(/.*\/pull\/(\d+).*/, '$1')) : undefined;
  const rows: { key: string; pr: PullRequest | null; input: string }[] = [];
  if (direct && !exact) {
    rows.push({ key: 'direct', pr: null, input: direct });
  }
  if (exact) {
    rows.push({ key: `pr-${exact.number}`, pr: exact, input: String(exact.number) });
  }
  if (!direct) {
    filtered.forEach((pr) => rows.push({ key: `pr-${pr.number}`, pr, input: String(pr.number) }));
  }

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (input: string, pr: PullRequest | null) => {
    closePullRequests();
    if (pr && details && details.prNumber === pr.number) {
      nav.toDiff(prRefFor(pr));
      return;
    }
    void checkoutPullRequest(nav.repoPath, input, nav.toDiff);
  };

  const handleKey = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePullRequests();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, rows.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      const row = rows[active];
      if (!row) {
        return;
      }
      event.preventDefault();
      pick(row.input, row.pr);
    }
  };

  const renderBody = () => {
    if (!hasRemote) {
      return <EmptyState title="No GitHub remote" detail="This repository has no github.com origin, so there are no pull requests to list." />;
    }
    if (authLoading) {
      return (
        <div className="flex items-center gap-2 px-4 py-6 text-xs text-text-muted">
          <Spinner className="h-3 w-3" />
          Checking your GitHub account…
        </div>
      );
    }
    if (!signedIn) {
      return (
        <EmptyState
          title="Sign in to GitHub"
          detail="Diffity needs your GitHub account to list and check out pull requests. It only reads unless you post a review."
          action={{
            label: 'Sign in',
            onClick: () => {
              closePullRequests();
              openSettingsAt('github');
            },
          }}
        />
      );
    }
    if (isLoading) {
      return (
        <div className="space-y-3 px-4 py-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-1.5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-bg-tertiary" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-bg-tertiary" />
            </div>
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <div className="px-4 py-6 text-xs">
          <div className="text-deleted">Could not load pull requests</div>
          <div className="mt-1 text-text-muted">{tauri.errorMessage(error)}</div>
          <button onClick={() => void refetch()} className="mt-2 cursor-pointer text-accent hover:underline">
            Try again
          </button>
        </div>
      );
    }
    if (rows.length === 0) {
      if (query.trim()) {
        return <EmptyState title="No matching pull requests" detail="Paste a pull request URL or type its number to open one that is not listed." />;
      }
      return <EmptyState title="No open pull requests" detail="Paste a pull request URL or type a number to check out a closed or merged one." />;
    }
    return (
      <div ref={listRef} className="py-1">
        {rows.map((row, index) => {
          if (!row.pr) {
            return (
              <button
                key={row.key}
                type="button"
                data-active={index === active || undefined}
                onMouseMove={() => setActive(index)}
                onClick={() => pick(row.input, null)}
                className={cn('flex w-full cursor-pointer items-center gap-2.5 px-4 py-2 text-left', index === active && 'bg-hover')}
              >
                <GitPullRequestIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <span className="text-[13px] text-text">
                  Check out pull request <span className="font-medium">#{row.input.replace(/.*\/pull\/(\d+).*/, '$1')}</span>
                </span>
                <span className="ml-auto text-[11px] text-text-muted">Enter</span>
              </button>
            );
          }
          return (
            <PrRow
              key={row.key}
              pr={row.pr}
              active={index === active}
              current={details?.prNumber === row.pr.number}
              busy={busy === `#${row.pr.number}`}
              onHover={() => setActive(index)}
              onPick={() => pick(row.input, row.pr)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[12vh] font-sans" onMouseDown={closePullRequests}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pull requests"
        onKeyDown={handleKey}
        onMouseDown={(event) => event.stopPropagation()}
        className="mx-4 flex max-h-[70vh] w-[640px] max-w-full flex-col overflow-hidden rounded-xl bg-overlay ring-1 ring-overlay-border"
      >
        <div className="flex items-center gap-2 border-b border-overlay-border px-4 py-2.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
          <input
            autoComplete="off"
            autoCorrect="off"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pull requests, or paste a URL / #number"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-text-muted"
          />
          {signedIn && hasRemote && (
            <button
              onClick={() => void refetch()}
              title="Refresh"
              className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text"
            >
              {isFetching ? <Spinner className="h-3 w-3" /> : <RefreshIcon className="h-3.5 w-3.5" />}
            </button>
          )}
          <button
            onClick={closePullRequests}
            title="Close"
            className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-text-muted hover:bg-hover hover:text-text"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{renderBody()}</div>
        <div className="flex items-center justify-between border-t border-overlay-border px-4 py-2 text-xs text-text-muted">
          <span>
            {prs ? `${prs.length} open pull request${prs.length === 1 ? '' : 's'}` : 'Pull requests'}
          </span>
          <span>↑↓ to move · Enter to check out · Esc to close</span>
        </div>
      </div>
    </div>
  );
}

export function PullRequestsDialog() {
  const open = useUi((state) => state.pullRequestsOpen);

  if (!open) {
    return null;
  }
  return <PullRequestsBody />;
}
