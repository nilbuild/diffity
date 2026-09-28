import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { PullRequest } from '@/lib/types';
import { agentBus } from '@/features/workspace/agent-bus';
import { useViewStore } from '@/features/workspace/view-store';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { Markdown } from '@/components/markdown/Markdown';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CircleDashedIcon,
  ClockIcon,
  CommentIcon,
  DownloadIcon,
  ExternalLinkIcon,
  GitCompareIcon,
  GitMergeIcon,
  GithubIcon,
  PullRequestIcon,
  SparklesIcon,
  XCircleIcon,
  type IconComponent,
} from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { Badge, CountBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { GithubAuthPanel } from './GithubAuthPanel';
import { PushReviewDialog, errorGuidance, isPushable } from './PushReviewDialog';

export function prRef(pr: PullRequest) {
  return `origin/${pr.baseRef}...HEAD`;
}

function openExternal(url: string) {
  openUrl(url).catch(() => window.open(url, '_blank'));
}

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const toneText: Record<Tone, string> = {
  neutral: 'text-fg-muted',
  accent: 'text-accent',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const tonePill: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-fg-muted',
  accent: 'border-accent/30 bg-accent-soft text-accent',
  success: 'border-success/30 bg-success/12 text-success',
  warning: 'border-warning/30 bg-warning/12 text-warning',
  danger: 'border-danger/30 bg-danger/12 text-danger',
};

function prState(pr: PullRequest): { label: string; tone: Tone; icon: IconComponent } {
  const state = pr.state.toUpperCase();
  if (state === 'MERGED') {
    return { label: 'Merged', tone: 'accent', icon: GitMergeIcon };
  }
  if (state === 'CLOSED') {
    return { label: 'Closed', tone: 'danger', icon: XCircleIcon };
  }
  if (pr.isDraft) {
    return { label: 'Draft', tone: 'neutral', icon: PullRequestIcon };
  }
  return { label: 'Open', tone: 'success', icon: PullRequestIcon };
}

function StatePill(props: { pr: PullRequest }) {
  const state = prState(props.pr);
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-xs font-medium',
        tonePill[state.tone],
      )}
    >
      <state.icon size={12} />
      {state.label}
    </span>
  );
}

function reviewDecisionInfo(decision: string | null): { label: string; tone: Tone; icon: IconComponent } | null {
  switch (decision) {
    case 'APPROVED':
      return { label: 'Approved', tone: 'success', icon: CheckCircleIcon };
    case 'CHANGES_REQUESTED':
      return { label: 'Changes requested', tone: 'danger', icon: AlertIcon };
    case 'REVIEW_REQUIRED':
      return { label: 'Review required', tone: 'warning', icon: CommentIcon };
    default:
      return null;
  }
}

function checksInfo(checks: string | null): { label: string; tone: Tone; icon: IconComponent } | null {
  if (!checks) {
    return null;
  }
  const value = checks.toUpperCase();
  if (value === 'SUCCESS') {
    return { label: 'Checks passing', tone: 'success', icon: CheckCircleIcon };
  }
  if (value === 'FAILURE' || value === 'ERROR') {
    return { label: 'Checks failing', tone: 'danger', icon: XCircleIcon };
  }
  if (value === 'PENDING' || value === 'EXPECTED') {
    return { label: 'Checks running', tone: 'warning', icon: ClockIcon };
  }
  return { label: `Checks ${checks.toLowerCase()}`, tone: 'neutral', icon: CircleDashedIcon };
}

function StatusItem(props: { info: { label: string; tone: Tone; icon: IconComponent } }) {
  const { info } = props;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', toneText[info.tone])}>
      <info.icon size={14} />
      {info.label}
    </span>
  );
}

function BranchChip(props: { name: string }) {
  return (
    <span className="inline-flex h-5 max-w-[220px] items-center truncate rounded-sm border border-border bg-muted px-1.5 font-mono text-2xs text-fg-muted">
      {props.name}
    </span>
  );
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
        <Spinner size={14} /> Checking GitHub connection…
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
        <Spinner size={14} /> Looking for a pull request…
      </div>
    );
  }

  if (prQuery.isError && api.isAppError(prQuery.error) && prQuery.error.code === 'not_github') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <GithubIcon size={24} className="text-fg-subtle" />
        <p className="text-sm font-medium">No GitHub remote</p>
        <p className="max-w-[420px] text-xs text-fg-muted">{prQuery.error.message}</p>
        {login && <p className="mt-4 text-2xs text-fg-subtle">Signed in to GitHub as {login}</p>}
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
        {login && <p className="mt-6 text-center text-2xs text-fg-subtle">Signed in to GitHub as {login}</p>}
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
  const pushableQuery = useQuery({
    queryKey: queryKeys.pushable(repoPath, pr.number),
    queryFn: () => api.githubPushableThreads(repoPath, pr.number),
  });
  const unsynced = (pushableQuery.data ?? []).filter(isPushable).length;
  const statusQuery = useQuery({ queryKey: queryKeys.gitStatus(repoPath), queryFn: () => api.gitStatus(repoPath) });

  const showPrDiff = () => {
    setRef(reviewRef);
    useViewStore.getState().setTab('changes');
  };

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
        action: { label: 'Show in Changes', onClick: showPrDiff },
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

  const decision = reviewDecisionInfo(pr.reviewDecision);
  const checks = checksInfo(pr.checks);
  const ahead = statusQuery.data?.ahead ?? 0;
  const dirty = statusQuery.data?.dirty ?? false;
  const onPrRef = ref === reviewRef;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-raised">
        <div className="px-5 pt-4 pb-3.5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="selectable text-lg leading-snug font-semibold text-fg">
                {pr.title} <span className="font-normal text-fg-subtle">#{pr.number}</span>
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-fg-muted">
                <StatePill pr={pr} />
                <span>
                  <span className="font-medium text-fg">{pr.author}</span> wants to merge into
                </span>
                <BranchChip name={pr.baseRef} />
                <ArrowLeftIcon size={12} className="text-fg-subtle" />
                <BranchChip name={pr.headRef} />
              </div>
            </div>
            <Button size="sm" onClick={() => openExternal(pr.url)}>
              <GithubIcon size={12} />
              Open on GitHub
            </Button>
          </div>
          {(decision || checks) && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border-subtle pt-3">
              {decision && <StatusItem info={decision} />}
              {checks && <StatusItem info={checks} />}
              <span className="ml-auto font-mono text-2xs text-fg-subtle" title={pr.headSha}>
                {pr.headSha.slice(0, 7)}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-panel px-5 py-2.5">
          <Button size="md" variant="primary" onClick={reviewWithAi}>
            <SparklesIcon size={14} />
            Review with AI
          </Button>
          <Button size="md" loading={pulling} disabled={!sessionId} onClick={pullComments}>
            {!pulling && <DownloadIcon size={14} />}
            Pull comments
          </Button>
          <Button size="md" disabled={!sessionId} onClick={() => setPushOpen(true)}>
            <ArrowUpIcon size={14} />
            Push review
            {unsynced > 0 && <CountBadge count={unsynced} />}
          </Button>
          <Button size="md" variant="ghost" className="ml-auto" disabled={onPrRef} onClick={showPrDiff}>
            <GitCompareIcon size={14} />
            {onPrRef ? 'Viewing PR diff' : 'Show PR diff'}
          </Button>
        </div>
        {(ahead > 0 || dirty) && (
          <div className="flex items-start gap-2 border-t border-warning/30 bg-warning/10 px-5 py-2 text-xs text-warning">
            <AlertIcon size={14} className="mt-px shrink-0" />
            <span>
              {dirty
                ? 'You have uncommitted changes. Commit and push them before pushing a review so comments line up with GitHub.'
                : `You have ${ahead} unpushed commit${ahead === 1 ? '' : 's'}. Push them first so comments land on the PR head.`}
            </span>
          </div>
        )}
      </div>

      <PrDescription body={pr.body} />

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

function PrDescription(props: { body: string }) {
  const { body } = props;
  const [open, setOpen] = useState(true);
  const empty = !body.trim();
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-raised">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-9 w-full cursor-default items-center gap-2 bg-panel px-4 text-left text-xs font-medium text-fg-muted hover:text-fg',
          open && 'border-b border-border',
        )}
      >
        <ChevronRightIcon size={12} className={cn('transition-transform', open && 'rotate-90')} />
        Description
      </button>
      {open && (
        <div className="px-5 py-4">
          {empty ? <p className="text-xs text-fg-subtle italic">No description provided.</p> : <Markdown>{body}</Markdown>}
        </div>
      )}
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
      <div className="rounded-lg border border-dashed border-border px-5 py-5 text-center">
        <GithubIcon size={24} className="mx-auto text-fg-subtle" />
        <p className="mt-2 text-sm font-medium">No pull request for {repo?.branch ? <code className="font-mono">{repo.branch}</code> : 'this branch'}</p>
        <p className="mt-0.5 text-xs text-fg-muted">Check out an open PR below, or paste a PR URL.</p>
        <form
          className="mx-auto mt-3 flex max-w-[460px] gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void checkout(url);
          }}
        >
          <Input
            size="lg"
            wrapperClassName="flex-1"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repo/pull/123 or 123"
          />
          <Button type="submit" size="lg" loading={checkingOut === url.trim() && url.trim() !== ''} disabled={!url.trim() || checkingOut !== null}>
            Open PR
          </Button>
        </form>
      </div>

      <div>
        <h2 className="mb-2 text-xs font-semibold text-fg-muted">Open pull requests</h2>
        {prsQuery.isPending && (
          <div className="flex items-center gap-2 py-4 text-xs text-fg-subtle">
            <Spinner size={14} /> Loading…
          </div>
        )}
        {prsQuery.isError && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorGuidance(prsQuery.error)}
          </div>
        )}
        {prsQuery.data?.length === 0 && <p className="py-4 text-xs text-fg-subtle">No open pull requests.</p>}
        <ul className="overflow-hidden rounded-lg border border-border bg-raised empty:hidden">
          {(prsQuery.data ?? []).map((pr) => {
            const state = prState(pr);
            const checks = checksInfo(pr.checks);
            const decision = reviewDecisionInfo(pr.reviewDecision);
            return (
              <li
                key={pr.number}
                className="group flex items-start gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0 hover:bg-hover"
              >
                <state.icon size={14} className={cn('mt-[3px] shrink-0', toneText[state.tone])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{pr.title}</span>
                    {pr.isDraft && <Badge>Draft</Badge>}
                    {checks && (
                      <span title={checks.label} className={cn('flex shrink-0', toneText[checks.tone])}>
                        <checks.icon size={12} />
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-fg-subtle">
                    <span className="tabular-nums">#{pr.number}</span>
                    <span>·</span>
                    <span>{pr.author}</span>
                    <span>·</span>
                    <span className="truncate font-mono">{pr.headRef}</span>
                    {decision && (
                      <>
                        <span>·</span>
                        <span className={toneText[decision.tone]}>{decision.label}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    size="sm"
                    label="Open on GitHub"
                    className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => openExternal(pr.url)}
                  >
                    <ExternalLinkIcon size={14} />
                  </IconButton>
                  <Button
                    size="sm"
                    loading={checkingOut === String(pr.number)}
                    disabled={checkingOut !== null}
                    onClick={() => checkout(String(pr.number))}
                  >
                    Check out
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
