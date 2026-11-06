import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfo } from '../../hooks/use-info';
import { expectsPullRequest, useBaseBranch, useBranches, useGitHubAuth, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import { diffOptions } from '../../queries/diff';
import { AskClaudePopover, requestAskClaude } from '../../features/claude/ask-claude-review';
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
import { ChangesIcon, CheckCircleIcon, ChevronDownIcon, CommentIcon, EllipsisIcon, GitCommitIcon, EditorIcon, FilesIcon, GitCompareIcon, GitHubIcon, GitPullRequestIcon, SearchIcon, SparkleIcon, SwapIcon, XIcon } from '../ui/icon';
import { MenuItem, Popover, useMenu } from '../ui/popover';
import { Panel } from '../ui/panel';
import { useRestoredScroll, useViewState } from '../../lib/view-state';

interface DashboardProps {
  onNavigate: (ref: string) => void;
}

function RefInput(props: { value: string; onChange: (value: string) => void; placeholder: string; options: string[]; autoFocus?: boolean }) {
  const { value, onChange, placeholder, options, autoFocus } = props;
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const needle = value.trim().toLowerCase();
  const suggestions = options.filter((option) => option.toLowerCase().includes(needle) && option !== value).slice(0, 6);
  const show = focused && needle.length > 0 && suggestions.length > 0;

  return (
    <div className="relative flex-1 min-w-0">
      <input
        autoFocus={autoFocus}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (!show) {
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, suggestions.length - 1));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === 'Tab' || (event.key === 'Enter' && needle && suggestions[active])) {
            event.preventDefault();
            onChange(suggestions[active]);
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={cn(inputField, 'font-mono text-xs')}
      />
      {show && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-10 p-1 bg-overlay rounded-md ring-1 ring-overlay-border">
          {suggestions.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex items-center w-full h-7 px-2 rounded text-left font-mono text-xs text-text truncate cursor-pointer',
                  index === active && 'bg-hover',
                )}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ComparePopover(props: { onNavigate: (ref: string) => void; defaultBase: string | null; openSignal?: number }) {
  const { onNavigate, defaultBase, openSignal = 0 } = props;
  const { data: branches } = useBranches();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true);
    }
  }, [openSignal]);
  const [base, setBase] = useState('');
  const [head, setHead] = useState('HEAD');
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const effectiveBase = base.trim() || defaultBase || '';
  const refOptions = ['HEAD', ...(branches ?? []).map((branch) => branch.name)];

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(buttonOutline, open && 'bg-fill-hover')}
        title="Compare two branches, tags or commits"
      >
        <GitCompareIcon className="w-3.5 h-3.5 text-text-secondary" />
        Compare
        <ChevronDownIcon className="w-3 h-3 text-text-secondary" />
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} align="end" width={340} className="p-3 overflow-visible">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!effectiveBase) {
              return;
            }
            close();
            onNavigate(`${effectiveBase}...${head.trim() || 'HEAD'}`);
          }}
        >
          <div className="text-[13px] font-medium text-text">Compare changes</div>
          <p className="mt-0.5 mb-3 text-xs text-text-secondary">The changes Compare has on top of Base, the way a pull request shows them.</p>
          <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
            <span className="text-xs text-text-secondary">Base</span>
            <RefInput autoFocus value={base} onChange={setBase} placeholder={defaultBase ?? 'branch, tag or commit'} options={refOptions} />
            <span className="text-xs text-text-secondary">Compare</span>
            <RefInput value={head} onChange={setHead} placeholder="HEAD" options={refOptions} />
          </div>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              className={cn(buttonGhost, 'h-7 -ml-2 px-2 text-xs')}
              title="Swap base and compare"
              onClick={() => {
                const nextBase = head.trim() || 'HEAD';
                setHead(effectiveBase);
                setBase(nextBase);
              }}
            >
              <SwapIcon className="w-3.5 h-3.5" />
              Swap
            </button>
            <button type="submit" disabled={!effectiveBase} className={buttonPrimary}>
              Compare
            </button>
          </div>
        </form>
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
}

function Hero(props: { item: Candidate; onReview: (ref: string) => void; className?: string }) {
  const { item, onReview, className } = props;
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);

  return (
    <section className={cn('mt-6 rounded-xl border border-border bg-bg-secondary px-6 py-5', className)}>
      <div className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        {item.icon}
        Up next · {item.eyebrow}
      </div>
      <h2 className="mt-2 text-[18px] leading-6 font-semibold text-text line-clamp-2">{item.title}</h2>
      <p className="mt-1 text-[13px] text-text-secondary">{item.explain}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={() => (item.run ? item.run() : onReview(item.ref))} className={buttonPrimary}>
          {item.action}
        </button>
        <button ref={askRef} onClick={() => setAsking(!asking)} className={buttonClaude} aria-expanded={asking}>
          <SparkleIcon size="sm" />
          Ask Claude to review
        </button>
        <AskClaudePopover
          open={asking}
          onClose={() => setAsking(false)}
          anchorRef={askRef}
          diffRef={item.ref}
          sessionId={null}
          onStarted={() => onReview(item.ref)}
        />
        {item.summary && <span className="ml-auto"><StatLine summary={item.summary} /></span>}
        {!item.summary && item.summaryLoading && <Skeleton className="ml-auto w-36 h-3" />}
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

function HomeActions(props: { editorName: string }) {
  const { editorName } = props;
  const nav = useRepoNav();
  const menu = useMenu();

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Browse files, open in editor"
        className={cn(buttonOutline, 'h-7 w-7 px-0 justify-center', menu.open && 'bg-control-hover')}
      >
        <EllipsisIcon size="md" className="text-text-secondary" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={220}>
        <MenuItem icon={<FilesIcon size="sm" />} label="Browse files" onSelect={() => {
          menu.close();
          nav.toTree();
        }} />
        <MenuItem icon={<EditorIcon size="sm" />} label={`Open in ${editorName}`} onSelect={() => {
          menu.close();
          openInEditor('').catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }));
        }} />
      </Popover>
    </>
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
  const base = useBaseBranch(details?.pr ?? null, branch);
  const [search, setSearch] = useViewState('home:search', '');
  const [searching, setSearching] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useRestoredScroll(mainRef, 'home:scroll');
  const [compareSignal, setCompareSignal] = useState(0);
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
  const [historyOpen, setHistoryOpen] = useViewState<boolean | null>('home:history-open', null);
  const showHistory = historyOpen ?? !hasTasks;

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const branchBase = !details && base && branch && branch !== base && base.replace(/^(origin|upstream)\//, '') !== branch ? base : null;
  const branchRef = branchBase ? `${branchBase}...HEAD` : null;
  const prRef = details ? prDiffRef(details) : null;
  const last = recent?.commits[0] ?? null;

  const work = useDiffSummary(uncommitted > 0 ? 'work' : null);
  const prDiff = useDiffSummary(prRef);
  const branchDiff = useDiffSummary(branchRef);
  const prs = usePullRequests(hasRemote && !!auth?.authenticated);
  const prsLoading = hasRemote && !!auth?.authenticated && prs.isPending && !prs.isError;

  const settled = (query: { isPending: boolean; isError: boolean; fetchStatus: string }) => !query.isPending || query.isError || query.fetchStatus === 'idle';
  const localSettled = settled(statusQuery) && settled(metaQuery) && settled(branchesQuery) && settled(threadsQuery) && settled(recentQuery) && settled(historyQuery)
    && (localBudgetSpent || (!work.loading && !branchDiff.loading));
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
    });
  }
  if (branchRef && base && branchDiff.summary && branchDiff.summary.files > 0) {
    candidates.push({
      key: 'branch', ref: base, icon: <GitCompareIcon size="sm" />, eyebrow: 'This branch',
      title: `${branch} vs ${base.replace(/^origin\//, '')}`,
      explain: 'Everything on this branch since it split from its base',
      summary: branchDiff.summary,
      action: `Compare with ${base.replace(/^origin\//, '')}`,
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
      meta={<span className="truncate">{['Your checkout', hero.key === 'comments' ? null : hero.eyebrow, heroComments > 0 && hero.key !== 'comments' ? `${heroComments} open comment${heroComments === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}</span>}
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
      actions={[{ label: 'Ask Claude to review', icon: <SparkleIcon size="sm" className="text-claude" />, onSelect: () => askClaudeFor(hero.ref) }]}
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
              <NewTaskButton repoPath={nav.repoPath} />
              <HomeActions editorName={editor.loading ? 'editor' : editor.name} />
            </header>
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
                  <Hero key={hero.key} item={hero} onReview={onNavigate} className={heroUpgraded ? 'reveal' : undefined} />
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
                    <button onClick={() => setCompareSignal((value) => value + 1)} className={cn(buttonOutline, 'h-7 px-2.5 text-xs shrink-0')}>
                      <GitCompareIcon size="xs" className="text-text-secondary" />
                      Compare branches
                    </button>
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
                          meta={threadGroups.has(item.ref) ? `${item.eyebrow} · ${threadGroups.get(item.ref)?.count} open comment${threadGroups.get(item.ref)?.count === 1 ? '' : 's'}` : item.eyebrow}
                          stats={item.summary ? <StatCell additions={item.summary.additions} deletions={item.summary.deletions} bar={<DiffStatBar additions={item.summary.additions} deletions={item.summary.deletions} />} /> : item.summaryLoading && <Skeleton className="w-24 h-3" />}
                          onClick={() => onNavigate(item.ref)}
                          tooltip={item.action}
                          actions={[
                            { label: item.action, icon: item.icon, onSelect: () => (item.run ? item.run() : onNavigate(item.ref)) },
                            { label: 'Ask Claude to review', icon: <SparkleIcon size="sm" className="text-claude" />, onSelect: () => askClaudeFor(item.ref) },
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
                      <ComparePopover onNavigate={onNavigate} defaultBase={base} openSignal={compareSignal} />
                    </>
                  }
                >
                  <CommitList
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
