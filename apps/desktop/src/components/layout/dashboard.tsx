import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useDismiss } from '../../hooks/use-dismiss';
import { useBaseBranch, useBranches, useGitHubPr, useGitStatus } from '../../hooks/use-repo-state';
import { CommitList, HistoryRow, SectionHeader } from './commit-list';
import { GitCompareIcon } from '../icons/git-compare-icon';
import { PencilIcon } from '../icons/pencil-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { SearchIcon } from '../icons/search-icon';
import { SwapIcon } from '../icons/swap-icon';
import { XIcon } from '../icons/x-icon';
import { ChevronDownIcon } from '../icons/chevron-down-icon';
import { Spinner } from '../icons/spinner';
import { hideStaticSplash } from './skeleton';
import { RepoTitle, TitleBar } from './title-bar';
import { OptionsMenu } from './options-menu';
import { StatusBar } from './status-bar';
import { commitRef, type Commit } from '../../lib/api';
import { HistoryDetail, type HistoryTarget } from './history-detail';
import { SidebarFrame } from './sidebar-frame';
import { GitCommitIcon } from '../icons/git-commit-icon';
import { prDiffRef } from './ref-menu';
import { cn } from '../../lib/cn';
import { buttonIconSmall, buttonOutline, buttonPrimary, inputField, overlayPanel } from '../ui/button-styles';

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

function ComparePopover(props: { onNavigate: (ref: string) => void; defaultBase: string | null }) {
  const { onNavigate, defaultBase } = props;
  const { data: branches } = useBranches();
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState('');
  const [head, setHead] = useState('HEAD');
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
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
      {open && (
        <form
          className={cn(overlayPanel, 'absolute right-0 top-full mt-1.5 w-[340px] p-3 z-50')}
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
      )}
    </div>
  );
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const { theme, toggleTheme } = useTheme();
  const { data: info } = useInfo();
  const { data: status } = useGitStatus();
  const { details } = useGitHubPr();
  const branch = status?.branch ?? info?.branch ?? null;
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<HistoryTarget | null>(null);
  const [firstCommit, setFirstCommit] = useState<Commit | null>(null);
  const handleLoaded = useCallback((commits: Commit[]) => setFirstCommit(commits[0] ?? null), []);

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const showBranch = !details && base && branch && branch !== base && `origin/${branch}` !== base;
  const hasWorking = uncommitted > 0 || !!details || !!showBranch;

  const workingTargets: HistoryTarget[] = [];
  if (uncommitted > 0) {
    workingTargets.push({ ref: 'work', title: 'Uncommitted changes', icon: <PencilIcon className="w-3.5 h-3.5" />, meta: `${uncommitted} file${uncommitted === 1 ? '' : 's'} · staged, unstaged and new` });
  }
  if (details) {
    workingTargets.push({ ref: prDiffRef(details), title: details.prTitle, icon: <GitPullRequestIcon className="w-3.5 h-3.5" />, meta: `Pull request #${details.prNumber} · into ${details.baseRef}` });
  }
  if (showBranch && base) {
    workingTargets.push({ ref: `${base}...HEAD`, title: `${branch} vs ${base.replace(/^origin\//, '')}`, icon: <GitCompareIcon className="w-3.5 h-3.5" />, meta: 'Every commit on this branch' });
  }

  const activeTarget = selected ?? workingTargets[0] ?? (firstCommit ? commitTarget(firstCommit) : null);

  const working = hasWorking ? (
    <section>
      <SectionHeader>Working</SectionHeader>
      <ul>
        {workingTargets.map((target) => (
          <HistoryRow
            key={target.ref}
            icon={target.icon}
            title={target.title}
            meta={<span className="truncate">{target.meta}</span>}
            selected={activeTarget?.ref === target.ref}
            onClick={() => setSelected(target)}
            onDoubleClick={() => onNavigate(target.ref)}
          />
        ))}
      </ul>
    </section>
  ) : null;

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans">
      <TitleBar>
        <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
          <RepoTitle name={info?.name} />
        </div>
        <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
        <div className="flex items-center gap-2 shrink-0">
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      <div className="flex flex-1 min-h-0">
        <SidebarFrame collapsed={false} onExpand={() => undefined} view="overview" storageKey="diffity-history-width" defaultWidth={420}>
          <div className="flex items-center gap-2 px-3 pt-1 pb-2 shrink-0">
            <div className="relative flex-1 min-w-0">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
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
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
            <ComparePopover onNavigate={onNavigate} defaultBase={base} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
            <CommitList
              search={search}
              header={working}
              selectedHash={activeTarget?.commit?.hash ?? null}
              onFetchingChange={setSearching}
              onLoaded={handleLoaded}
              onSelect={(commit) => setSelected(commitTarget(commit))}
              onOpen={(commit) => onNavigate(commitRef(commit.hash))}
              onCompareFrom={(hash) => onNavigate(`${hash}..HEAD`)}
            />
          </div>
        </SidebarFrame>
        <main className="flex-1 min-w-0 overflow-y-auto">
          <HistoryDetail target={activeTarget} onOpen={onNavigate} />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}

function commitTarget(commit: Commit): HistoryTarget {
  return { ref: commitRef(commit.hash), title: commit.message, icon: <GitCommitIcon className="w-3.5 h-3.5" />, commit };
}
