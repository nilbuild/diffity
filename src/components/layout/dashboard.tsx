import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfo } from '../../hooks/use-info';
import { expectsPullRequest, useBaseBranchState, useBranches, useGitHubAuth, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import { diffOptions } from '../../queries/diff';
import { ReviewPopover, requestAskClaude } from '../../features/claude/review-form';
import { useRunPick } from '../../features/claude/model-setting';
import { agentMeta } from '../../features/claude/agents';
import { usePullRequests } from '../../features/pr/pull-requests-dialog';
import { checkoutPullRequest } from '../../features/pr/pr-checkout';
import { BranchSwitcher } from '../../features/pr/branch-switcher';
import { useEditorNameState } from '../../hooks/use-editor-name';
import { TREE_REF } from '../../lib/types';
import { CommitList, commitListOptions } from './commit-list';
import { DiffStatBar } from '../ui/diff-stat-bar';
import { ListRow, ListRowSkeleton, StatCell } from '../ui/list-row';
import { NewTaskButton, TaskSections } from '../../features/tasks/task-list';
import { useRepoTasks } from '../../features/tasks/tasks';
import { Skeleton, useElapsed, useLatch, useRevealClass } from '../ui/skeleton';
import { HomeSkeletonBody } from './home-skeleton';
import { relative } from '../../features/pr/pr-meta';
import { Spinner } from '../icons/spinner';
import { hideStaticSplash } from './skeleton';
import { Workspace } from './title-bar';
import { HomeTitleBar } from './home-title-bar';
import { StatusBar } from './status-bar';
import { commitRef, errorMessage, openInEditor } from '../../lib/api';
import { prDiffRef } from './ref-menu';
import { useRepoNav } from '../../hooks/use-repo';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openSettingsAt } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { buttonClaude, buttonGhost, buttonOutline, buttonPrimary, inputField } from '../ui/button-styles';
import { ArrowLeftIcon, ChangesIcon, CheckCircleIcon, ChevronDownIcon, CommentIcon, GitCommitIcon, EditorIcon, FilesIcon, GitCompareIcon, GitHubIcon, GitPullRequestIcon, SearchIcon, SparkleIcon, XIcon } from '../ui/icon';
import { Popover } from '../ui/popover';
import { Panel } from '../ui/panel';
import { CompareForm } from './compare-form';
import { useRestoredScroll, useViewState } from '../../lib/view-state';
import { useNavigate } from 'react-router';
import { clearSkippedView, diffRefOf, useSkippedView } from '../../features/welcome/resume';
import { commentOf, runLabel, runViewLabel, showRun, useRunningRuns } from '../../features/claude/claude-runner';
import { sameView } from '../../features/claude/conversation';

interface DashboardProps {
  onNavigate: (ref: string) => void;
}

function ComparePopover(props: { onNavigate: (ref: string) => void; defaultBase: string | null; label?: string; className?: string }) {
  const { onNavigate, defaultBase, label, className } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(buttonOutline, className, open && 'bg-fill-hover')}
        title="Compare two branches, tags or commits"
      >
        <GitCompareIcon className="w-3.5 h-3.5 text-text-secondary" />
        {label ?? 'Compare'}
        {!label && (
          <ChevronDownIcon className="w-3 h-3 text-text-secondary" />
        )}
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} align="end" width={340} className="p-3 overflow-visible">
        <CompareForm
          defaultBase={defaultBase}
          onCompare={(base, head) => {
            close();
            onNavigate(`${base}...${head}`);
          }}
        />
      </Popover>
    </div>
  );
}

type DiffSummary = { files: number; additions: number; deletions: number };

function useDiffSummary(ref: string | null): { summary: DiffSummary | null; loading: boolean } {
  const query = useQuery({ ...diffOptions(false, ref ?? undefined), enabled: !!ref });
  if (!ref) {
    return { summary: null, loading: false };
  }
  if (!query.data) {
    return { summary: null, loading: query.isPending && !query.isError };
  }
  return {
    summary: { files: query.data.files.length, additions: query.data.stats.totalAdditions, deletions: query.data.stats.totalDeletions },
    loading: false,
  };
}

function StatLine(props: { summary: DiffSummary }) {
  const { summary } = props;

  return (
    <span className="inline-flex items-center gap-2.5 text-xs tabular-nums">
      <span className="text-text-secondary">{summary.files} file{summary.files === 1 ? '' : 's'}</span>
      {summary.additions > 0 && <span className="font-mono text-diff-added">+{summary.additions}</span>}
      {summary.deletions > 0 && <span className="font-mono text-diff-deleted">−{summary.deletions}</span>}
      <DiffStatBar additions={summary.additions} deletions={summary.deletions} />
    </span>
  );
}

interface Candidate {
  key: string;
  ref: string;
  icon: ReactNode;
  eyebrow: string;
  title: string;
  explain: string;
  summary: DiffSummary | null;
  summaryLoading?: boolean;
  /** What the primary button does, e.g. "View changes", "Compare with main". */
  action: string;
  run?: () => void;
  /** GitHub page for this item, shown as an "Open on GitHub" button. */
  url?: string;
}

/** What to look at first, as one bar: what it is and its size on the left, the actions on the right. */
function Hero(props: { item: Candidate; agentName: string; working: { label: string; open: () => void } | null; onReview: (ref: string) => void; className?: string }) {
  const { item, agentName, working, onReview, className } = props;
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);

  return (
    <section className={cn('mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-bg-secondary px-4 py-3.5', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-fill text-text-secondary">{item.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[14px] font-semibold text-text" title={item.title}>{item.title}</h2>
          <span className="shrink-0 text-[11px] font-medium text-text-muted">Up next · {item.eyebrow}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-3">
          {item.summary && <StatLine summary={item.summary} />}
          {!item.summary && item.summaryLoading && <Skeleton className="w-36 h-3" />}
          {item.explain && <span className="truncate text-xs text-text-muted">{item.explain}</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {item.url && (
          <button
            onClick={() => openUrl(item.url!).catch((error) => toast.error('Could not open GitHub', { description: errorMessage(error) }))}
            className={cn(buttonGhost, 'w-7 px-0')}
            title="Open on GitHub"
            aria-label="Open on GitHub"
          >
            <GitHubIcon size="sm" />
          </button>
        )}
        {working ? (
          <button onClick={working.open} className={buttonClaude} title="See what it's doing">
            <Spinner className="w-3.5 h-3.5" />
            {working.label}
          </button>
        ) : (
          <button ref={askRef} onClick={() => setAsking(!asking)} className={buttonClaude} aria-expanded={asking}>
            <SparkleIcon size="sm" />
            Review changes with {agentName}
          </button>
        )}
        <button onClick={() => (item.run ? item.run() : onReview(item.ref))} className={buttonPrimary}>
          {item.action}
        </button>
        <ReviewPopover
          open={asking}
          onClose={() => setAsking(false)}
          anchorRef={askRef}
          diffRef={item.ref}
          sessionId={null}
          onStarted={() => onReview(item.ref)}
        />
      </div>
    </section>
  );
}

const PR_ROWS_KEY = 'diffity-open-pr-rows';

/** How many "Open pull requests" rows this repository showed last time, so their placeholder takes the same space. */
function readPrRows(repoPath: string): number {
  try {
    const stored = JSON.parse(localStorage.getItem(PR_ROWS_KEY) ?? '{}') as Record<string, number>;
    return stored[repoPath] ?? 2;
  } catch {
    return 2;
  }
}

function writePrRows(repoPath: string, rows: number) {
  try {
    const stored = JSON.parse(localStorage.getItem(PR_ROWS_KEY) ?? '{}') as Record<string, number>;
    if (stored[repoPath] === rows) {
      return;
    }
    stored[repoPath] = rows;
    localStorage.setItem(PR_ROWS_KEY, JSON.stringify(stored));
  } catch {
    return;
  }
}

/** Looking at the code itself, beside reviewing its changes: in the file browser or the editor. */
function HomeActions(props: { editorName: string }) {
  const { editorName } = props;
  const nav = useRepoNav();

  return (
    <>
      <button onClick={() => nav.toTree()} className={cn(buttonOutline, 'h-7')} title="Browse and comment on any file">
        <FilesIcon size="sm" className="text-text-secondary" />
        Browse files
      </button>
      <button
        onClick={() => openInEditor('').catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }))}
        className={cn(buttonOutline, 'h-7')}
      >
        <EditorIcon size="sm" className="text-text-secondary" />
        Open in {editorName}
      </button>
    </>
  );
}

/** When switching here skipped the view you had open (stale and nothing unfinished), a way back to it. */
function ContinueView(props: { repoPath: string }) {
  const { repoPath } = props;
  const navigate = useNavigate();
  const location = useSkippedView((state) => state.byRepo[repoPath] ?? null);

  const ref = location ? diffRefOf(repoPath, location) : null;
  if (!location || !ref) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={() => {
        clearSkippedView(repoPath);
        navigate(location);
      }}
      className="mt-2 inline-flex items-center gap-1.5 h-6 px-2 -ml-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
    >
      <ArrowLeftIcon size="xs" />
      Continue where you left off: <span className="text-text">{runViewLabel(repoPath, ref)}</span>
    </button>
  );
}

/** An agent at work on this item: the same words as the status pill, with its spinner. */
function Working(props: { label: string }) {
  const { label } = props;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-claude">
      <Spinner className="w-3 h-3" />
      {label}
    </span>
  );
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const nav = useRepoNav();
  const { data: info } = useInfo();
  const statusQuery = useGitStatus();
  const status = statusQuery.data;
  const metaQuery = useRepoMeta();
  const branchesQuery = useBranches();
  const { details, hasRemote, loading: prLoading } = useGitHubPr();
  const authQuery = useGitHubAuth();
  const auth = authQuery.data;
  const threadsQuery = useRepoThreads();
  const repoThreads = threadsQuery.data;
  const branch = status?.branch ?? info?.branch ?? null;
  const { base, pending: basePending } = useBaseBranchState(details?.pr ?? null, branch);
  const [search, setSearch] = useViewState('home:search', '');
  const [searching, setSearching] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useRestoredScroll(mainRef, 'home:scroll');
  const recentQuery = useRecentCommits(1);
  const recent = recentQuery.data;
  const historyQuery = useInfiniteQuery(commitListOptions(''));
  const editor = useEditorNameState();
  const branchPrKey = `${nav.repoPath}\n${status?.branch ?? info?.branch ?? ''}`;
  const expectPr = hasRemote && auth?.authenticated !== false && expectsPullRequest(branchPrKey, status?.branch ?? null, status?.upstream);
  const prBudgetSpent = useElapsed(expectPr ? 1500 : 600);
  const listBudgetSpent = useElapsed(600);
  const localBudgetSpent = useElapsed(3000);
  const hasTasks = useRepoTasks(nav.repoPath).length > 0;
  const reviewAgent = agentMeta(useRunPick('review', nav.repoPath).agent).short;
  const runs = useRunningRuns(nav.repoPath);
  const runOn = (ref: string) => runs.find((item) => sameView(item.ref, ref) && !commentOf(item.action)) ?? null;
  const workingOn = (ref: string) => {
    const run = runOn(ref);
    return run ? runLabel(run.action, agentMeta(run.agentId ?? 'claude').short, !!run.context.conversation) : null;
  };
  const heroWorking = (ref: string) => {
    const run = runOn(ref);
    return run ? { label: workingOn(ref)!, open: () => showRun(run) } : null;
  };
  const [historyOpen, setHistoryOpen] = useViewState<boolean | null>('home:history-open', null);
  const showHistory = historyOpen ?? !hasTasks;

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const branchBase = !details && base && branch && branch !== base && base.replace(/^(origin|upstream)\//, '') !== branch ? base : null;
  const branchRef = branchBase ? `${branchBase}...HEAD` : null;
  const prRef = details?.pr.state === 'OPEN' ? prDiffRef(details) : null;
  const last = recent?.commits[0] ?? null;

  const work = useDiffSummary(uncommitted > 0 ? 'work' : null);
  const prDiff = useDiffSummary(prRef);
  const branchDiff = useDiffSummary(branchRef);
  const prs = usePullRequests(hasRemote && !!auth?.authenticated);
  const prsLoading = hasRemote && !!auth?.authenticated && prs.isPending && !prs.isError;

  const settled = (query: { isPending: boolean; isError: boolean; fetchStatus: string }) => !query.isPending || query.isError || query.fetchStatus === 'idle';
  const localSettled = settled(statusQuery) && settled(metaQuery) && settled(branchesQuery) && settled(threadsQuery) && settled(recentQuery) && settled(historyQuery)
    && (localBudgetSpent || (!basePending && !work.loading && !branchDiff.loading));
  const prSettled = settled(metaQuery) && (!hasRemote || (settled(authQuery) && !prLoading));
  const ready = useLatch(localSettled && (prSettled || prBudgetSpent) && (!prsLoading || listBudgetSpent));
  const reveal = useRevealClass(!ready);

  const candidates: Candidate[] = [];
  if (uncommitted > 0) {
    const files = work.summary?.files ?? uncommitted;
    candidates.push({
      key: 'work', ref: 'work', icon: <ChangesIcon size="sm" />, eyebrow: 'Uncommitted changes',
      title: `${files} file${files === 1 ? '' : 's'} changed since your last commit`,
      explain: [status?.staged ? `${status.staged} staged` : null, status?.unstaged ? `${status.unstaged} unstaged` : null, status?.untracked ? `${status.untracked} new` : null].filter(Boolean).join(' · '),
      summary: work.summary,
      summaryLoading: work.loading,
      action: 'View changes',
    });
  }
  if (details && prRef) {
    candidates.push({
      key: 'pr', ref: prRef, icon: <GitPullRequestIcon size="sm" className="text-added" />, eyebrow: `Pull request #${details.prNumber}`,
      title: details.prTitle,
      explain: `${details.pr?.author ? `by ${details.pr.author} · ` : ''}${branch ?? ''} → ${details.baseRef}`,
      summary: prDiff.summary,
      summaryLoading: prDiff.loading,
      action: 'View PR diff',
      url: details.pr.url,
    });
  }
  if (branchRef && base && branchDiff.summary && branchDiff.summary.files > 0) {
    candidates.push({
      key: 'branch', ref: base, icon: <GitCompareIcon size="sm" />, eyebrow: 'This branch',
      title: `${branch} vs ${base.replace(/^origin\//, '')}`,
      explain: `Everything on this branch since it split from ${base.replace(/^origin\//, '')}`,
      summary: branchDiff.summary,
      action: 'View diff',
    });
  }
  const askClaudeFor = (ref: string) => {
    onNavigate(ref);
    requestAskClaude(ref);
  };

  const signedOutEarly = hasRemote && !!auth && !auth.authenticated;
  const openThreads = (repoThreads ?? []).filter((thread) => isOpenThread(thread) && !thread.otherBranch && !thread.unassigned);
  const threadGroups = new Map<string, { label: string; count: number; claude: number }>();
  for (const thread of openThreads) {
    const group = threadGroups.get(thread.ref) ?? { label: thread.refLabel, count: 0, claude: 0 };
    group.count += 1;
    if (thread.authorType === 'agent') {
      group.claude += 1;
    }
    threadGroups.set(thread.ref, group);
  }
  const goToComments = (ref: string) => {
    if (ref === TREE_REF) {
      nav.toTree();
      return;
    }
    onNavigate(ref);
  };
  const firstCommentGroup = [...threadGroups.entries()][0];
  if (candidates.length === 0 && firstCommentGroup) {
    const [ref, group] = firstCommentGroup;
    candidates.push({
      key: 'comments', ref, icon: <CommentIcon size="sm" className={group.claude > 0 ? 'text-claude' : undefined} />, eyebrow: 'Open comments',
      title: `${openThreads.length} open comment${openThreads.length === 1 ? '' : 's'} to address`,
      explain: `${group.count} in ${group.label}${threadGroups.size > 1 ? ` and more in ${threadGroups.size - 1} other view${threadGroups.size === 2 ? '' : 's'}` : ''}`,
      summary: null,
      action: 'Go to comments',
      run: () => goToComments(ref),
    });
  }
  // A view's open comments show on its own card or row, so they don't get a second row in "To review".
  for (const candidate of candidates) {
    const group = threadGroups.get(candidate.ref);
    if (group && candidate.key !== 'comments') {
      candidate.explain = [candidate.explain, `${group.count} open comment${group.count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    }
  }
  const candidateRefs = new Set(candidates.map((candidate) => candidate.ref));
  const otherCommentGroups = [...threadGroups.entries()].filter(([ref]) => !candidateRefs.has(ref));
  const [hero, ...queue] = candidates;
  const firstHeroKey = useRef<string | null | undefined>(undefined);
  if (ready && firstHeroKey.current === undefined) {
    firstHeroKey.current = hero?.key ?? null;
  }
  const heroUpgraded = ready && firstHeroKey.current !== (hero?.key ?? null);
  const otherPrs = signedOutEarly ? [] : (prs.data ?? []).filter((pr) => pr.number !== details?.prNumber).slice(0, 5);
  const prPlaceholderRows = prsLoading ? readPrRows(nav.repoPath) : 0;

  useEffect(() => {
    if (!prs.data || prLoading) {
      return;
    }
    writePrRows(nav.repoPath, otherPrs.length);
  }, [prs.data, prLoading, otherPrs.length, nav.repoPath]);

  const statusParts: ReactNode[] = [];
  const uncommittedFiles = work.summary?.files ?? uncommitted;
  statusParts.push(uncommitted > 0 ? `${uncommittedFiles} uncommitted file${uncommittedFiles === 1 ? '' : 's'}` : <span key="clean" className="inline-flex items-center gap-1 text-added"><CheckCircleIcon size="xs" />Working tree clean</span>);
  statusParts.push(openThreads.length > 0 ? `${openThreads.length} open comment${openThreads.length === 1 ? '' : 's'}` : 'No open comments');
  if (status?.upstream) {
    statusParts.push(<span key="sync" className="tabular-nums">↑{status.ahead} ↓{status.behind} with {status.upstream}</span>);
  }

  const signedOut = signedOutEarly;
  const heroComments = hero ? threadGroups.get(hero.ref)?.count ?? 0 : 0;
  const checkoutRow = hasTasks && hero ? (
    <ListRow
      key="checkout"
      icon={hero.icon}
      title={hero.title}
      meta={<span className="truncate">{['Your copy', hero.key === 'comments' ? null : hero.eyebrow, heroComments > 0 && hero.key !== 'comments' ? `${heroComments} open comment${heroComments === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</span>}
      stats={
        <span className="flex items-center gap-3">
          {hero.summary && <StatCell additions={hero.summary.additions} deletions={hero.summary.deletions} bar={<DiffStatBar additions={hero.summary.additions} deletions={hero.summary.deletions} />} />}
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (hero.run) {
                hero.run();
                return;
              }
              onNavigate(hero.ref);
            }}
            className={cn(buttonOutline, 'h-7 px-2.5 text-xs')}
          >
            Review
          </button>
        </span>
      }
      onClick={() => (hero.run ? hero.run() : onNavigate(hero.ref))}
      tooltip={hero.action}
      actions={[{ label: `Review changes with ${reviewAgent}`, icon: <SparkleIcon size="sm" className="text-claude" />, onSelect: () => askClaudeFor(hero.ref) }]}
    />
  ) : null;

  return (
    <div className="flex flex-col h-screen bg-frame text-text font-sans">
      <HomeTitleBar name={info?.name} />

      <Workspace>
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[1000px] mx-auto px-8 pt-7 pb-12">
            <header className="flex items-center gap-3">
              <h1 className="text-[18px] leading-6 font-semibold text-text truncate">{info?.name ?? 'Repository'}</h1>
              {branch && (
                <BranchSwitcher branch={branch} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-text-secondary" />
              )}
              <span className="flex-1" />
              <HomeActions editorName={editor.loading ? 'editor' : editor.name} />
              <NewTaskButton repoPath={nav.repoPath} />
            </header>
            <ContinueView repoPath={nav.repoPath} />
            {!ready && (
              <HomeSkeletonBody />
            )}
            {ready && (
              <div className={reveal}>
                <p className="mt-1 text-xs text-text-muted flex flex-wrap items-center gap-x-2">
                  {statusParts.map((part, index) => (
                    <span key={index} className="inline-flex items-center gap-2">
                      {index > 0 && <span aria-hidden>·</span>}
                      {part}
                    </span>
                  ))}
                </p>

                <TaskSections repoPath={nav.repoPath} checkoutRow={checkoutRow} />

                {hasTasks ? null : hero ? (
                  <Hero key={hero.key} item={hero} agentName={reviewAgent} working={heroWorking(hero.ref)} onReview={onNavigate} className={heroUpgraded ? 'reveal' : undefined} />
                ) : (
                  <div className="mt-6 flex items-center gap-3 px-4 py-3 rounded-lg border border-added/25 bg-added/[0.06]">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-added/15 text-added shrink-0">
                      <CheckCircleIcon size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-text">You're all caught up</span>
                      <span className="block truncate text-xs text-text-secondary">Nothing to review on {branch ?? 'this branch'}</span>
                    </span>
                    {last && (
                      <button onClick={() => onNavigate(commitRef(last.hash))} className={cn(buttonGhost, 'h-7 px-2.5 text-xs shrink-0')} title={last.message}>
                        Latest commit <code className="font-mono text-[11px]">{last.shortHash}</code>
                      </button>
                    )}
                    <ComparePopover onNavigate={onNavigate} defaultBase={base} label="Compare branches" className="h-7 px-2.5 text-xs" />
                  </div>
                )}

                {(queue.length > 0 || otherCommentGroups.length > 0) && (
                  <Panel title="To review" icon={<ChangesIcon size="sm" />}>
                    <ul>
                      {queue.map((item) => (
                        <ListRow
                          key={item.key}
                          icon={item.icon}
                          title={item.title}
                          meta={
                            workingOn(item.ref) ? (
                              <Working label={workingOn(item.ref)!} />
                            ) : threadGroups.has(item.ref) ? (
                              `${item.eyebrow} · ${threadGroups.get(item.ref)?.count} open comment${threadGroups.get(item.ref)?.count === 1 ? '' : 's'}`
                            ) : (
                              item.eyebrow
                            )
                          }
                          stats={item.summary ? <StatCell additions={item.summary.additions} deletions={item.summary.deletions} bar={<DiffStatBar additions={item.summary.additions} deletions={item.summary.deletions} />} /> : item.summaryLoading && <Skeleton className="w-24 h-3" />}
                          onClick={() => onNavigate(item.ref)}
                          tooltip={item.action}
                          actions={[
                            { label: item.action, icon: item.icon, onSelect: () => (item.run ? item.run() : onNavigate(item.ref)) },
                            { label: `Review changes with ${reviewAgent}`, icon: <SparkleIcon size="sm" className="text-claude" />, onSelect: () => askClaudeFor(item.ref) },
                          ]}
                        />
                      ))}
                      {otherCommentGroups.map(([ref, group]) => (
                        <ListRow
                          key={`comments-${ref}`}
                          icon={<CommentIcon size="sm" className={group.claude > 0 ? 'text-claude' : undefined} />}
                          title={`${group.count} open comment${group.count === 1 ? '' : 's'} in ${group.label}`}
                          meta={group.claude > 0 ? `${group.claude} from Claude` : 'From you'}
                          onClick={() => goToComments(ref)}
                        />
                      ))}
                    </ul>
                  </Panel>
                )}

                {(otherPrs.length > 0 || signedOut || prPlaceholderRows > 0) && (
                  <Panel title="Pull requests" icon={<GitPullRequestIcon size="sm" />} count={otherPrs.length > 0 ? `${otherPrs.length} open` : undefined} right={<span className="text-xs text-text-muted">from GitHub</span>}>
                    <ul>
                      {signedOut && (
                        <ListRow
                          icon={<GitHubIcon size="sm" />}
                          title="Sign in to GitHub to see open pull requests"
                          meta="Import your gh login or paste a token in Settings"
                          onClick={() => openSettingsAt('github')}
                        />
                      )}
                      {Array.from({ length: prPlaceholderRows }, (_, index) => <ListRowSkeleton key={`pr-skeleton-${index}`} index={index} />)}
                      {otherPrs.map((pr) => (
                        <ListRow
                          key={`pr-${pr.number}`}
                          icon={<GitPullRequestIcon size="sm" className={pr.isDraft ? 'text-text-muted' : 'text-added'} />}
                          title={pr.title}
                          meta={
                            <>
                              <span className="tabular-nums">#{pr.number}</span>
                              <span aria-hidden>·</span>
                              <span className="truncate">{pr.author}</span>
                              {pr.updatedAt && <><span aria-hidden>·</span><span className="shrink-0">updated {relative(pr.updatedAt)}</span></>}
                              {pr.isDraft && <span className="shrink-0 px-1.5 rounded-full bg-fill text-[10px] font-medium text-text-secondary">Draft</span>}
                              {pr.reviewDecision === 'REVIEW_REQUIRED' && <span className="shrink-0 px-1.5 rounded-full bg-modified/12 text-[10px] font-medium text-modified">Review required</span>}
                              {pr.checks && <span className={cn('shrink-0 w-1.5 h-1.5 rounded-full', pr.checks === 'SUCCESS' ? 'bg-added' : pr.checks === 'FAILURE' || pr.checks === 'ERROR' ? 'bg-deleted' : 'bg-modified')} title={`Checks: ${pr.checks.toLowerCase()}`} />}
                            </>
                          }
                          stats={<StatCell additions={pr.additions} deletions={pr.deletions} bar={<DiffStatBar additions={pr.additions} deletions={pr.deletions} />} />}
                          tooltip="Check out this pull request (asks first if you have uncommitted changes)"
                          onClick={() => void checkoutPullRequest(nav.repoPath, `#${pr.number}`, nav)}
                          actions={[
                            { label: 'Check out and review', icon: <GitPullRequestIcon size="sm" />, onSelect: () => void checkoutPullRequest(nav.repoPath, `#${pr.number}`, nav) },
                            { label: 'Open on GitHub', icon: <GitHubIcon size="sm" />, onSelect: () => void openUrl(pr.url) },
                          ]}
                        />
                      ))}
                    </ul>
                  </Panel>
                )}

                <Panel
                  title="History"
                  icon={<GitCommitIcon size="sm" />}
                  detail={branch ?? undefined}
                  collapsible={{ open: showHistory, onToggle: () => setHistoryOpen(!showHistory) }}
                  right={
                    <>
                      {showHistory && (
                        <div className="relative w-[200px]">
                          <SearchIcon size="sm" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                          <input
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            type="text"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                setSearch('');
                              }
                            }}
                            placeholder="Search commits"
                            className={cn(inputField, 'h-7 pl-8 pr-8 text-xs')}
                          />
                          {searching && <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3" />}
                          {!searching && search && (
                            <button
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-hover cursor-pointer"
                              onClick={() => setSearch('')}
                              title="Clear search"
                            >
                              <XIcon size="xs" />
                            </button>
                          )}
                        </div>
                      )}
                      <ComparePopover onNavigate={onNavigate} defaultBase={base} />
                    </>
                  }
                >
                  <CommitList
                    limit={10}
                    search={search}
                    onFetchingChange={setSearching}
                    onOpen={(commit) => onNavigate(commitRef(commit.hash))}
                    onCompareFrom={(hash) => onNavigate(`${hash}..HEAD`)}
                  />
                </Panel>
              </div>
            )}
          </div>
        </main>
      </Workspace>
      <StatusBar />
    </div>
  );
}
