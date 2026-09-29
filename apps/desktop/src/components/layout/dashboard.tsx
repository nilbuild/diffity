import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useBaseBranch, useBranches, useGitHubPr, useGitStatus } from '../../hooks/use-repo-state';
import { CommitList } from './commit-list';
import { Spinner } from '../icons/spinner';
import { hideStaticSplash } from './skeleton';
import { RepoTitle, TitleBar, Workspace } from './title-bar';
import { OptionsMenu } from './options-menu';
import { StatusBar } from './status-bar';
import { commitRef } from '../../lib/api';
import { HOME_REF, prDiffRef, RefMenu } from './ref-menu';
import { useRepoNav } from '../../hooks/use-repo';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openComments } from '../../lib/ui-store';
import { CommentsButton } from '../../features/comments/comments-button';
import { cn } from '../../lib/cn';
import { buttonIconSmall, buttonOutline, buttonPrimary, inputField } from '../ui/button-styles';
import { ChangesIcon, ChevronDownIcon, CommentIcon, FolderSimpleIcon, GitCompareIcon, GitPullRequestIcon, SearchIcon, SwapIcon, XIcon } from '../ui/icon';
import { Popover } from '../ui/popover';

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

function WorkCard(props: { icon: ReactNode; label: string; title: ReactNode; detail?: ReactNode; tone?: string; onClick: () => void }) {
  const { icon, label, title, detail, tone, onClick } = props;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2 min-w-0 p-4 rounded-xl border border-border bg-bg text-left hover:border-control-border hover:bg-bg-secondary transition-colors cursor-pointer"
    >
      <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <span className={cn('flex items-center justify-center w-6 h-6 rounded-md bg-fill', tone ?? 'text-text-secondary')}>{icon}</span>
        {label}
      </span>
      <span className="w-full text-[13px] font-medium leading-5 text-text line-clamp-2">{title}</span>
      {detail && <span className="w-full text-xs text-text-muted truncate">{detail}</span>}
    </button>
  );
}

function syncLine(status: { upstream: string | null; ahead: number; behind: number } | undefined) {
  if (!status?.upstream) {
    return null;
  }
  if (status.ahead === 0 && status.behind === 0) {
    return `up to date with ${status.upstream}`;
  }
  const parts: string[] = [];
  if (status.ahead > 0) {
    parts.push(`${status.ahead} to push`);
  }
  if (status.behind > 0) {
    parts.push(`${status.behind} to pull`);
  }
  return parts.join(', ');
}

function prState(details: { pr?: { state: string; isDraft: boolean } | null }) {
  const pr = details.pr;
  if (!pr) {
    return { label: 'Open', tone: 'text-added' };
  }
  if (pr.state === 'MERGED') {
    return { label: 'Merged', tone: 'text-[#8250df]' };
  }
  if (pr.state === 'CLOSED') {
    return { label: 'Closed', tone: 'text-deleted' };
  }
  return pr.isDraft ? { label: 'Draft', tone: 'text-text-secondary' } : { label: 'Open', tone: 'text-added' };
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const nav = useRepoNav();
  const { theme, toggleTheme } = useTheme();
  const { data: info } = useInfo();
  const { data: status } = useGitStatus();
  const { details } = useGitHubPr();
  const { data: repoThreads } = useRepoThreads();
  const branch = status?.branch ?? info?.branch ?? null;
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const showBranch = !details && base && branch && branch !== base && `origin/${branch}` !== base;
  const openThreads = (repoThreads ?? []).filter(isOpenThread);
  const claudeOpen = openThreads.filter((thread) => thread.authorType === 'agent').length;
  const sync = syncLine(status);
  const pr = details ? prState(details) : null;

  const uncommittedDetail = status
    ? [status.staged ? `${status.staged} staged` : null, status.unstaged ? `${status.unstaged} unstaged` : null, status.untracked ? `${status.untracked} new` : null].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="flex flex-col h-screen bg-frame text-text font-sans">
      <TitleBar sidebarToggle={false}>
        <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
          <RepoTitle name={info?.name} />
          <RefMenu diffRef={HOME_REF} branch={branch} />
        </div>
        <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
        <div className="flex items-center gap-2 shrink-0">
          <CommentsButton />
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      <Workspace>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="max-w-[1120px] mx-auto px-8 pt-8 pb-12">
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-[18px] leading-6 font-semibold text-text truncate">{info?.name ?? 'Repository'}</h1>
                <p className="mt-1 text-[13px] text-text-secondary">
                  {branch ? <>On <span className="font-mono text-xs text-text">{branch}</span>{sync ? `, ${sync}` : ''}</> : 'Detached HEAD'}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => nav.toTree()} className={buttonOutline}>
                  <FolderSimpleIcon size="sm" className="text-text-secondary" />
                  Browse files
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
              <WorkCard
                icon={<ChangesIcon size="sm" />}
                label="Uncommitted changes"
                title={uncommitted > 0 ? `${uncommitted} file${uncommitted === 1 ? '' : 's'} changed` : 'Working tree is clean'}
                detail={uncommitted > 0 ? uncommittedDetail : 'New edits show up here as you make them'}
                tone={uncommitted > 0 ? 'text-modified' : undefined}
                onClick={() => onNavigate('work')}
              />
              {details && pr && (
                <WorkCard
                  icon={<GitPullRequestIcon size="sm" />}
                  label={`Pull request #${details.prNumber} · ${pr.label}`}
                  title={details.prTitle}
                  detail={`${branch ?? ''} → ${details.baseRef}`}
                  tone={pr.tone}
                  onClick={() => onNavigate(prDiffRef(details))}
                />
              )}
              {showBranch && base && (
                <WorkCard
                  icon={<GitCompareIcon size="sm" />}
                  label="This branch"
                  title={`${branch} vs ${base.replace(/^origin\//, '')}`}
                  detail="Every commit since the branches split"
                  onClick={() => onNavigate(`${base}...HEAD`)}
                />
              )}
              <WorkCard
                icon={<CommentIcon size="sm" />}
                label="Open comments"
                title={openThreads.length > 0 ? `${openThreads.length} open comment${openThreads.length === 1 ? '' : 's'}` : 'No open comments'}
                detail={claudeOpen > 0 ? `${claudeOpen} from Claude` : 'Across every view of this repository'}
                tone={claudeOpen > 0 ? 'text-claude' : undefined}
                onClick={openComments}
              />
            </div>

            <div className="mt-10 flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-text">History</h2>
              <span className="flex-1" />
              <div className="relative w-[280px] max-w-[40vw]">
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
              <ComparePopover onNavigate={onNavigate} defaultBase={base} />
            </div>
            <div className="mt-2 -mx-3">
              <CommitList
                search={search}
                onFetchingChange={setSearching}
                onOpen={(commit) => onNavigate(commitRef(commit.hash))}
                onCompareFrom={(hash) => onNavigate(`${hash}..HEAD`)}
              />
            </div>
          </div>
        </main>
      </Workspace>
      <StatusBar />
    </div>
  );
}
