import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useBaseBranch, useBranches, useGitHubAuth, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
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
import { Skeleton, useElapsed, useLatch, useRevealClass } from '../ui/skeleton';
import { HomeSkeletonBody } from './home-skeleton';
import { relative } from '../../features/pr/pr-meta';
import { Spinner } from '../icons/spinner';
import { hideStaticSplash } from './skeleton';
import { Breadcrumb, CurrentCrumb, TitleBar, Workspace } from './title-bar';
import { OptionsMenu } from './options-menu';
import { StatusBar } from './status-bar';
import { commitRef, errorMessage, openInEditor } from '../../lib/api';
import { prDiffRef } from './ref-menu';
import { useRepoNav } from '../../hooks/use-repo';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openSettingsAt } from '../../lib/ui-store';
import { CommentsButton } from '../../features/comments/comments-button';
import { cn } from '../../lib/cn';
import { buttonClaude, buttonIconSmall, buttonOutline, buttonPrimary, inputField } from '../ui/button-styles';
import { ChangesIcon, CheckCircleIcon, ChevronDownIcon, CommentIcon, EditorIcon, FilesIcon, GitCompareIcon, GitHubIcon, GitPullRequestIcon, SearchIcon, SparkleIcon, SwapIcon, XIcon } from '../ui/icon';
import { Popover } from '../ui/popover';
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
          <p className="mt-0.5 mb-3 text-xs text-text-secondary">What changed on compare since it split from base, like a pull request.</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-text-secondary">Base</span>
                <RefInput autoFocus value={base} onChange={setBase} placeholder={defaultBase ?? 'branch, tag or commit'} options={refOptions} />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-text-secondary">Compare</span>
                <RefInput value={head} onChange={setHead} placeholder="HEAD" options={refOptions} />
              </div>
            </div>
            <button
              type="button"
              className={buttonIconSmall}
              title="Swap base and compare"
              onClick={() => {
                const nextBase = head.trim() || 'HEAD';
                setHead(effectiveBase);
                setBase(nextBase);
              }}
            >
              <SwapIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex justify-end mt-3">
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
      {summary.additions > 0 && <span className="font-mono text-added">+{summary.additions}</span>}
      {summary.deletions > 0 && <span className="font-mono text-deleted">−{summary.deletions}</span>}
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

const BRANCH_PR_KEY = 'diffity-branch-pr';
const DEFAULT_BRANCHES = new Set(['main', 'master', 'develop', 'trunk']);

function readBranchPrs(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BRANCH_PR_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * Whether the checked-out branch probably has a pull request: it had one last time, or (never seen) it is a pushed
 * feature branch. Home then waits a little longer for GitHub before deciding what is up next.
 */
function expectsPullRequest(key: string, branch: string | null, upstream: string | null | undefined): boolean {
  const known = readBranchPrs()[key];
  if (known !== undefined) {
    return known > 0;
  }
  return !!branch && !!upstream && !DEFAULT_BRANCHES.has(branch);
}

function rememberBranchPr(key: string, prNumber: number) {
  try {
    const stored = readBranchPrs();
    if (stored[key] === prNumber) {
      return;
    }
    stored[key] = prNumber;
    localStorage.setItem(BRANCH_PR_KEY, JSON.stringify(stored));
  } catch {
    return;
  }
}

function SectionTitle(props: { children: ReactNode; right?: ReactNode }) {
  const { children, right } = props;

  return (
    <div className="flex items-center gap-3 h-8">
      <h3 className="text-[13px] font-semibold text-text">{children}</h3>
      <span className="flex-1" />
      {right}
    </div>
  );
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const nav = useRepoNav();
  const { theme, toggleTheme } = useTheme();
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
  const base = useBaseBranch(details?.baseRef ?? null, branch);
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

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const branchRef = !details && base && branch && branch !== base && `origin/${branch}` !== base ? `${base}...HEAD` : null;
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
      key: 'branch', ref: branchRef, icon: <GitCompareIcon size="sm" />, eyebrow: 'This branch',
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
  const openThreads = (repoThreads ?? []).filter(isOpenThread);
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
  const [hero, ...queue] = candidates;
  const firstHeroKey = useRef<string | null | undefined>(undefined);
  if (ready && firstHeroKey.current === undefined) {
    firstHeroKey.current = hero?.key ?? null;
  }
  const heroUpgraded = ready && firstHeroKey.current !== (hero?.key ?? null);
  const otherPrs = signedOutEarly ? [] : (prs.data ?? []).filter((pr) => pr.number !== details?.prNumber).slice(0, 5);
  const prPlaceholderRows = prsLoading ? readPrRows(nav.repoPath) : 0;

  useEffect(() => {
    if (!status || !hasRemote || !auth?.authenticated || prLoading) {
      return;
    }
    rememberBranchPr(branchPrKey, details?.prNumber ?? 0);
  }, [status, hasRemote, auth?.authenticated, prLoading, branchPrKey, details?.prNumber]);

  useEffect(() => {
    if (!prs.data || prLoading) {
      return;
    }
    writePrRows(nav.repoPath, otherPrs.length);
  }, [prs.data, prLoading, otherPrs.length, nav.repoPath]);

  const statusParts: ReactNode[] = [];
  const uncommittedFiles = work.summary?.files ?? uncommitted;
  statusParts.push(uncommitted > 0 ? `${uncommittedFiles} uncommitted file${uncommittedFiles === 1 ? '' : 's'}` : 'Working tree clean');
  statusParts.push(openThreads.length > 0 ? `${openThreads.length} open comment${openThreads.length === 1 ? '' : 's'}` : 'No open comments');
  if (status?.upstream) {
    statusParts.push(<span key="sync" className="tabular-nums">↑{status.ahead} ↓{status.behind} with {status.upstream}</span>);
  }

  const signedOut = signedOutEarly;
  const hasQueue = queue.length > 0 || threadGroups.size > 0 || otherPrs.length > 0 || signedOut || prPlaceholderRows > 0;

  return (
    <div className="flex flex-col h-screen bg-frame text-text font-sans">
      <TitleBar sidebarToggle={false}>
        <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
          <Breadcrumb name={info?.name}>
            <CurrentCrumb>Home</CurrentCrumb>
          </Breadcrumb>
        </div>
        <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
        <div className="flex items-center gap-2 shrink-0">
          <CommentsButton />
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      <Workspace>
        <main ref={mainRef} className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[1000px] mx-auto px-8 pt-7 pb-12">
            <header className="flex items-center gap-3">
              <h1 className="text-[18px] leading-6 font-semibold text-text truncate">{info?.name ?? 'Repository'}</h1>
              {branch && (
                <BranchSwitcher branch={branch} className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-xs text-text-secondary" />
              )}
              <span className="flex-1" />
              <button onClick={() => nav.toTree()} className={cn(buttonOutline, 'h-7')}>
                <FilesIcon size="sm" className="text-text-secondary" />
                Browse files
              </button>
              <button
                onClick={() => {
                  openInEditor('').catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }));
                }}
                className={cn(buttonOutline, 'h-7')}
                title={`Open the repository folder in ${editor.name}`}
              >
                <EditorIcon size="sm" className="text-text-secondary" />
                Open in {editor.loading ? <Skeleton className="w-12 h-3" /> : editor.name}
              </button>
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

                {hero ? (
                  <Hero key={hero.key} item={hero} onReview={onNavigate} className={heroUpgraded ? 'reveal' : undefined} />
                ) : (
                  <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 py-3 border-y border-border-muted text-[13px]">
                    <CheckCircleIcon size="md" className="text-added" />
                    <span className="font-medium text-text">You're all caught up</span>
                    <span className="text-text-secondary">nothing to review</span>
                    <span className="flex-1" />
                    {last && (
                      <button onClick={() => onNavigate(commitRef(last.hash))} className="text-text-secondary hover:text-text underline decoration-text-muted/40 underline-offset-2 cursor-pointer" title={last.message}>
                        Latest commit <code className="font-mono text-xs">{last.shortHash}</code>
                      </button>
                    )}
                    <span aria-hidden className="text-text-muted">·</span>
                    <button onClick={() => setCompareSignal((value) => value + 1)} className="text-text-secondary hover:text-text underline decoration-text-muted/40 underline-offset-2 cursor-pointer">
                      Compare branches
                    </button>

                  </div>
                )}

                {hasQueue && (
                  <section className="mt-8">
                    <SectionTitle>To review</SectionTitle>
                    <ul className="-mx-3 mt-1">
                      {queue.map((item) => (
                        <ListRow
                          key={item.key}
                          icon={item.icon}
                          title={item.title}
                          meta={item.eyebrow}
                          stats={item.summary ? <StatCell additions={item.summary.additions} deletions={item.summary.deletions} bar={<DiffStatBar additions={item.summary.additions} deletions={item.summary.deletions} />} /> : item.summaryLoading && <Skeleton className="w-24 h-3" />}
                          onClick={() => onNavigate(item.ref)}
                          tooltip={item.action}
                          actions={[
                            { label: item.action, icon: item.icon, onSelect: () => (item.run ? item.run() : onNavigate(item.ref)) },
                            { label: 'Ask Claude to review', icon: <SparkleIcon size="sm" className="text-claude" />, onSelect: () => askClaudeFor(item.ref) },
                          ]}
                        />
                      ))}
                      {[...threadGroups.entries()].filter(([ref]) => !(hero?.key === 'comments' && hero.ref === ref)).map(([ref, group]) => (
                        <ListRow
                          key={`comments-${ref}`}
                          icon={<CommentIcon size="sm" className={group.claude > 0 ? 'text-claude' : undefined} />}
                          title={`${group.count} open comment${group.count === 1 ? '' : 's'} in ${group.label}`}
                          meta={group.claude > 0 ? `${group.claude} from Claude` : 'From you'}
                          onClick={() => {
                            if (ref === TREE_REF) {
                              nav.toTree();
                              return;
                            }
                            onNavigate(ref);
                          }}
                        />
                      ))}
                      {(otherPrs.length > 0 || signedOut || prPlaceholderRows > 0) && (
                        <li className="px-3 pt-3 pb-1 text-[11px] font-medium text-text-muted">Open pull requests on GitHub</li>
                      )}
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
                          onClick={() => void checkoutPullRequest(nav.repoPath, `#${pr.number}`, nav.toDiff)}
                          actions={[
                            { label: 'Check out and review', icon: <GitPullRequestIcon size="sm" />, onSelect: () => void checkoutPullRequest(nav.repoPath, `#${pr.number}`, nav.toDiff) },
                            { label: 'Open on GitHub', icon: <GitHubIcon size="sm" />, onSelect: () => void openUrl(pr.url) },
                          ]}
                        />
                      ))}
                    </ul>
                  </section>
                )}

                <section className="mt-8">
                  <SectionTitle
                    right={
                      <>
                        <div className="relative w-[240px]">
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
                            className={cn(inputField, 'pl-8 pr-8')}
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
                        <ComparePopover onNavigate={onNavigate} defaultBase={base} openSignal={compareSignal} />
                      </>
                    }
                  >
                    History
                  </SectionTitle>
                  <div className="mt-1 -mx-3">
                    <CommitList
                      search={search}
                      onFetchingChange={setSearching}
                      onOpen={(commit) => onNavigate(commitRef(commit.hash))}
                      onCompareFrom={(hash) => onNavigate(`${hash}..HEAD`)}
                    />
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </Workspace>
      <StatusBar />
    </div>
  );
}
