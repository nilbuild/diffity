import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { cn } from '@/lib/cn';
import type { PullRequest } from '@/lib/types';
import { agentBus } from '@/features/workspace/agent-bus';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { Markdown } from '@/features/agent/Markdown';
import { IconArrowDown, IconArrowUp, IconBranch, IconExternal, IconGithub, IconSparkles } from '@/features/agent/icons';
import { Badge, Button, Spinner } from '@/features/agent/primitives';
import { GithubAuthPanel } from './GithubAuthPanel';
import { PushReviewDialog, errorGuidance, isPushable } from './PushReviewDialog';

export function prRef(pr: PullRequest) {
  return `origin/${pr.baseRef}...HEAD`;
}

function openExternal(url: string) {
  openUrl(url).catch(() => window.open(url, '_blank'));
}

function stateTone(pr: PullRequest) {
  if (pr.isDraft) {
    return 'neutral' as const;
  }
  const state = pr.state.toUpperCase();
  if (state === 'OPEN') {
    return 'success' as const;
  }
  if (state === 'MERGED') {
    return 'accent' as const;
  }
  return 'danger' as const;
}

function reviewDecisionLabel(decision: string | null) {
  switch (decision) {
    case 'APPROVED':
      return { label: 'Approved', tone: 'success' as const };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes requested', tone: 'danger' as const };
    case 'REVIEW_REQUIRED':
      return { label: 'Review required', tone: 'warning' as const };
    default:
      return null;
  }
}

function checksLabel(checks: string | null) {
  if (!checks) {
    return null;
  }
  const value = checks.toUpperCase();
  if (value === 'SUCCESS') {
    return { label: 'Checks passing', tone: 'success' as const };
  }
  if (value === 'FAILURE' || value === 'ERROR') {
    return { label: 'Checks failing', tone: 'danger' as const };
  }
  if (value === 'PENDING' || value === 'EXPECTED') {
    return { label: 'Checks running', tone: 'warning' as const };
  }
  return { label: `Checks: ${checks.toLowerCase()}`, tone: 'neutral' as const };
}

export function usePrParamCheckout(enabled: boolean) {
  const { repoPath } = useWorkspace();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const handled = useRef(false);
  const target = params.get('pr');

  useEffect(() => {
    if (!enabled || !target || handled.current) {
      return;
    }
    handled.current = true;
    const next = new URLSearchParams(params);
    next.delete('pr');
    setParams(next, { replace: true });
    const pending = toast.loading(`Checking out ${target}…`);
    api
      .checkoutPr(repoPath, target)
      .then((pr) => {
        toast.success(`Checked out #${pr.number} ${pr.title}`, { id: pending });
        queryClient.setQueryData(queryKeys.pr(repoPath), pr);
        queryClient.invalidateQueries({ queryKey: ['repo', repoPath] });
      })
      .catch((error) => toast.error('Could not check out PR', { id: pending, description: errorGuidance(error) }));
  }, [enabled, target, params, setParams, repoPath, queryClient]);
}

export function PrTab() {
  const authQuery = useQuery({ queryKey: queryKeys.githubAuth(), queryFn: api.githubAuthStatus });
  const authenticated = authQuery.data?.authenticated ?? false;
  usePrParamCheckout(authenticated);

  if (authQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-fg-subtle">
        <Spinner size={12} /> Checking GitHub connection…
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="h-full overflow-auto px-6">
        <GithubAuthPanel deviceFlowAvailable={authQuery.data?.deviceFlowAvailable ?? false} />
      </div>
    );
  }

  return <AuthenticatedPrView login={authQuery.data?.login ?? null} />;
}

function AuthenticatedPrView(props: { login: string | null }) {
  const { login } = props;
  const { repoPath, repo } = useWorkspace();
  const prQuery = useQuery({
    queryKey: queryKeys.pr(repoPath),
    queryFn: () => api.findPr(repoPath),
    enabled: repo?.isGit !== false,
  });

  if (prQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-fg-subtle">
        <Spinner size={12} /> Looking for a pull request…
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[860px] px-6 py-6">
        {prQuery.isError && (
          <div className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorGuidance(prQuery.error)}
          </div>
        )}
        {prQuery.data ? <PrCard pr={prQuery.data} /> : <PrPicker />}
        {login && <p className="mt-6 text-center text-[11px] text-fg-subtle">Signed in to GitHub as {login}</p>}
      </div>
    </div>
  );
}

function PrCard(props: { pr: PullRequest }) {
  const { pr } = props;
  const { repoPath, repo, ref, setRef } = useWorkspace();
  const queryClient = useQueryClient();
  const [pushOpen, setPushOpen] = useState(false);
  const [pulling, setPulling] = useState(false);
  const reviewRef = prRef(pr);

  const sessionQuery = useQuery({
    queryKey: queryKeys.session(repoPath, reviewRef),
    queryFn: () => api.getSession(repoPath, reviewRef),
  });
  const sessionId = sessionQuery.data?.id ?? null;
  const threadsQuery = useQuery({
    queryKey: queryKeys.threads(sessionId ?? ''),
    queryFn: () => api.listThreads(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });
  const unsynced = (threadsQuery.data ?? []).filter(isPushable).length;
  const statusQuery = useQuery({ queryKey: queryKeys.gitStatus(repoPath), queryFn: () => api.gitStatus(repoPath) });

  const pullComments = async () => {
    if (!sessionId) {
      return;
    }
    setPulling(true);
    try {
      const result = await api.pullReview(repoPath, sessionId, pr.number);
      queryClient.invalidateQueries({ queryKey: queryKeys.threads(sessionId) });
      const total = result.pulled + result.updated;
      toast.success(total === 0 ? 'Already up to date' : `Pulled ${result.pulled} new, updated ${result.updated}`, {
        description: result.skipped > 0 ? `${result.skipped} skipped (outdated or unsupported)` : undefined,
      });
      if (ref !== reviewRef) {
        setRef(reviewRef);
      }
    } catch (error) {
      toast.error('Could not pull comments', { description: errorGuidance(error) });
    } finally {
      setPulling(false);
    }
  };

  const reviewWithAi = () => {
    if (ref !== reviewRef) {
      setRef(reviewRef);
    }
    agentBus.runAction({ kind: 'review', ref: reviewRef });
  };

  const decision = reviewDecisionLabel(pr.reviewDecision);
  const checks = checksLabel(pr.checks);
  const ahead = statusQuery.data?.ahead ?? 0;
  const dirty = statusQuery.data?.dirty ?? false;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-bg-elevated">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="selectable text-base leading-snug font-semibold">
                {pr.title} <span className="font-normal text-fg-subtle">#{pr.number}</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-fg-muted">
                <Badge tone={stateTone(pr)}>{pr.isDraft ? 'Draft' : pr.state.toLowerCase()}</Badge>
                {decision && <Badge tone={decision.tone}>{decision.label}</Badge>}
                {checks && <Badge tone={checks.tone}>{checks.label}</Badge>}
                <span className="ml-1">
                  <span className="font-medium text-fg">{pr.author}</span> wants to merge
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                  <span className="rounded bg-accent-subtle px-1 text-accent">{pr.baseRef}</span>←
                  <span className="rounded bg-accent-subtle px-1 text-accent">{pr.headRef}</span>
                </span>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => openExternal(pr.url)}>
              <IconExternal size={12} />
              Open on GitHub
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <Button size="sm" variant="primary" onClick={reviewWithAi}>
            <IconSparkles size={12} />
            Review this PR with AI
          </Button>
          <Button size="sm" loading={pulling} disabled={!sessionId} onClick={pullComments}>
            <IconArrowDown size={12} />
            Pull comments from GitHub
          </Button>
          <Button size="sm" disabled={!sessionId} onClick={() => setPushOpen(true)}>
            <IconArrowUp size={12} />
            Push review…
            {unsynced > 0 && <Badge tone="accent">{unsynced}</Badge>}
          </Button>
          {ref !== reviewRef && (
            <Button size="sm" variant="ghost" onClick={() => setRef(reviewRef)}>
              <IconBranch size={12} />
              Show PR diff
            </Button>
          )}
        </div>
        {(ahead > 0 || dirty) && (
          <div className="border-t border-border bg-warning/10 px-5 py-2 text-xs text-warning">
            {dirty
              ? 'You have uncommitted changes. Commit and push them before pushing a review so comments line up with GitHub.'
              : `You have ${ahead} unpushed commit${ahead === 1 ? '' : 's'}. Push your commits first so comments land on the PR head.`}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-bg-elevated px-5 py-4">
        {pr.body.trim() ? (
          <Markdown>{pr.body}</Markdown>
        ) : (
          <p className="text-xs text-fg-subtle italic">No description provided.</p>
        )}
      </div>

      <PushReviewDialog
        open={pushOpen}
        onOpenChange={setPushOpen}
        repoPath={repoPath}
        sessionId={sessionId}
        pr={pr}
        localHeadSha={repo?.headSha ?? null}
      />
    </div>
  );
}

function PrPicker() {
  const { repoPath, repo } = useWorkspace();
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const prsQuery = useQuery({ queryKey: queryKeys.prs(repoPath), queryFn: () => api.listPrs(repoPath) });

  const checkout = async (target: string) => {
    const value = target.trim();
    if (!value) {
      return;
    }
    setCheckingOut(value);
    try {
      const pr = await api.checkoutPr(repoPath, value);
      toast.success(`Checked out #${pr.number}`, { description: pr.title });
      queryClient.setQueryData(queryKeys.pr(repoPath), pr);
      queryClient.invalidateQueries({ queryKey: ['repo', repoPath] });
      setUrl('');
    } catch (error) {
      toast.error('Could not check out PR', { description: errorGuidance(error), duration: 10_000 });
    } finally {
      setCheckingOut(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-dashed border-border px-5 py-5 text-center">
        <IconGithub size={20} className="mx-auto text-fg-subtle" />
        <p className="mt-2 text-sm font-medium">No pull request for {repo?.branch ? <code className="font-mono">{repo.branch}</code> : 'this branch'}</p>
        <p className="mt-0.5 text-xs text-fg-muted">Check out an open PR below, or paste a PR URL.</p>
        <form
          className="mx-auto mt-3 flex max-w-[460px] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void checkout(url);
          }}
        >
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repo/pull/123 or 123"
            className="selectable h-8 min-w-0 flex-1 rounded-md border border-border bg-bg-elevated px-2.5 text-xs outline-none focus:border-accent focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="md" loading={checkingOut === url.trim() && url.trim() !== ''} disabled={!url.trim() || checkingOut !== null}>
            Open PR
          </Button>
        </form>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold text-fg-muted">Open pull requests</h2>
        {prsQuery.isPending && (
          <div className="flex items-center gap-2 py-4 text-xs text-fg-subtle">
            <Spinner size={12} /> Loading…
          </div>
        )}
        {prsQuery.isError && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorGuidance(prsQuery.error)}
          </div>
        )}
        {prsQuery.data?.length === 0 && <p className="py-4 text-xs text-fg-subtle">No open pull requests.</p>}
        <ul className="overflow-hidden rounded-xl border border-border bg-bg-elevated empty:hidden">
          {(prsQuery.data ?? []).map((pr) => (
            <li key={pr.number} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-medium">{pr.title}</span>
                  {pr.isDraft && <Badge>Draft</Badge>}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-fg-subtle">
                  <span>#{pr.number}</span>·<span>{pr.author}</span>·
                  <span className="truncate font-mono">{pr.headRef}</span>
                </div>
              </div>
              <button
                type="button"
                title="Open on GitHub"
                onClick={() => openExternal(pr.url)}
                className={cn('rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg')}
              >
                <IconExternal size={12} />
              </button>
              <Button
                size="xs"
                loading={checkingOut === String(pr.number)}
                disabled={checkingOut !== null}
                onClick={() => checkout(String(pr.number))}
              >
                Check out
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
