import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useRepoNav } from '../../hooks/use-repo';
import { useBaseBranch, useGitHubPr, useGitStatus, useHasGitHubRemote } from '../../hooks/use-repo-state';
import { openPullRequests } from '../../lib/ui-store';
import { commitRef, descriptionForRef, fetchCommits, parseCommitRef, type Commit, type GitHubDetails } from '../../lib/api';
import { cn } from '../../lib/cn';
import { buttonOutline, inputField } from '../ui/button-styles';
import { Spinner } from '../icons/spinner';
import { useCommitDetails } from './diff-context-bar';
import { CheckIcon, ChevronDownIcon, GitBranchIcon, GitCommitIcon, GitCompareIcon, GitPullRequestIcon, HomeIcon, PencilIcon, SearchIcon, XIcon } from '../ui/icon';
import { Popover } from '../ui/popover';

interface RefMenuProps {
  diffRef: string;
  branch: string | null;
}

export const HOME_REF = '__home__';

export function prDiffRef(details: GitHubDetails): string {
  return `origin/${details.baseRef}...HEAD`;
}

function shortBase(base: string): string {
  return base.replace(/^origin\//, '');
}

function shortRef(ref: string): string {
  const name = shortBase(ref);
  return /^[0-9a-f]{8,40}$/i.test(name) ? name.slice(0, 7) : name;
}

export function rangeParts(diffRef: string): { base: string; head: string } {
  const [base, head] = diffRef.split(/\.{2,3}/);
  return { base: shortRef(base.replace(/~1$/, '')), head: shortRef(head || 'HEAD') };
}

/** Short, human label for what is being reviewed. */
export function useTargetLabel(diffRef: string, branch: string | null): { label: string; icon: ReactNode } {
  const { details } = useGitHubPr();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const commitSha = parseCommitRef(diffRef);
  const { data: commit } = useCommitDetails(commitSha);
  if (diffRef === HOME_REF) {
    return { label: 'Home', icon: <HomeIcon className="w-3.5 h-3.5" /> };
  }
  if (details && diffRef === prDiffRef(details)) {
    return { label: `PR #${details.prNumber} · ${details.prTitle}`, icon: <GitPullRequestIcon className="w-3.5 h-3.5" /> };
  }
  if (base && branch && diffRef === `${base}...HEAD`) {
    return { label: `${branch} vs ${shortBase(base)}`, icon: <GitCompareIcon className="w-3.5 h-3.5" /> };
  }
  if (commitSha) {
    const short = commitSha.slice(0, 7);
    return { label: commit ? `Commit ${short} · ${commit.message}` : `Commit ${short}`, icon: <GitCommitIcon className="w-3.5 h-3.5" /> };
  }
  if (diffRef.includes('..')) {
    const { base: from, head: to } = rangeParts(diffRef);
    return { label: `${from} → ${to}`, icon: <GitCompareIcon className="w-3.5 h-3.5" /> };
  }
  return { label: descriptionForRef(diffRef), icon: <PencilIcon className="w-3.5 h-3.5" /> };
}

const sectionClass = 'px-2.5 pt-2.5 pb-1 text-[11px] font-medium text-text-secondary';

interface ItemProps {
  selected: boolean;
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  meta?: ReactNode;
  tooltip?: string;
  onClick: () => void;
}

function Item(props: ItemProps) {
  const { selected, icon, title, hint, meta, tooltip, onClick } = props;

  return (
    <button
      onClick={onClick}
      title={tooltip}
      className={cn(
        'flex items-center gap-2.5 w-full min-h-8 px-2.5 py-1 rounded-md text-left transition-colors cursor-pointer',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
    >
      <span className={cn('flex items-center shrink-0', selected ? 'text-text' : 'text-text-secondary')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] leading-5 truncate text-text">{title}</span>
        {hint && <span className="block text-xs leading-4 text-text-secondary truncate">{hint}</span>}
      </span>
      {meta && <span className="shrink-0 text-xs text-text-secondary tabular-nums">{meta}</span>}
      <span className="w-3.5 shrink-0 flex items-center">{selected && <CheckIcon className="w-3.5 h-3.5 text-text-secondary" />}</span>
    </button>
  );
}

function CommitItem(props: { commit: Commit; selected: boolean; onClick: () => void }) {
  const { commit, selected, onClick } = props;

  return (
    <button
      onClick={onClick}
      title={`${commit.message}\n${commit.author} · ${commit.relativeDate}`}
      className={cn(
        'flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-left transition-colors cursor-pointer',
        selected ? 'bg-selected' : 'hover:bg-hover',
      )}
    >
      <code className={cn('shrink-0 font-mono text-[11px] w-[52px]', selected ? 'text-text-secondary' : 'text-text-muted')}>{commit.shortHash}</code>
      <span className="min-w-0 flex-1 truncate text-[13px] text-text">{commit.message}</span>
      <span className="shrink-0 text-xs text-text-muted whitespace-nowrap">{shortRelative(commit.date)}</span>
      <span className="w-3.5 shrink-0 flex items-center">{selected && <CheckIcon className="w-3.5 h-3.5 text-text-secondary" />}</span>
    </button>
  );
}

function shortRelative(date: string): string {
  const minutes = Math.max(0, dayjs().diff(dayjs(date), 'minute'));
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d`;
  }
  return dayjs(date).format('MMM D');
}

const WORK_SEGMENTS: { value: string; label: string; tooltip: string }[] = [
  { value: 'work', label: 'All', tooltip: 'Staged, unstaged and new files together' },
  { value: 'staged', label: 'Staged', tooltip: 'What the next commit will contain' },
  { value: 'unstaged', label: 'Unstaged', tooltip: 'Edits not added to the index yet, plus new files' },
];

function looksLikeRef(text: string) {
  return /\.\./.test(text) || /^[0-9a-f]{7,40}$/i.test(text) || /^(HEAD|origin\/)/.test(text);
}

export function RefMenu(props: RefMenuProps) {
  const { diffRef, branch } = props;
  const nav = useRepoNav();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const target = useTargetLabel(diffRef, branch);

  const isDefault = diffRef === 'work' || diffRef === HOME_REF;

  return (
    <div className="relative min-w-0 flex items-center" ref={ref}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(!open);
          }
        }}
        className={cn(buttonOutline, 'max-w-[460px] min-w-0 pl-2.5 gap-1.5', isDefault ? 'pr-2' : 'pr-1', open && 'bg-control-hover')}
        title="Choose what to review"
      >
        <span className="shrink-0 text-text-secondary">{target.icon}</span>
        <span className="truncate font-medium">{target.label}</span>
        <ChevronDownIcon size="xs" className="shrink-0 text-text-secondary" />
        {!isDefault && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              nav.toDiff('work');
            }}
            className="ml-0.5 flex items-center justify-center w-5 h-5 rounded-full text-text-muted hover:text-text hover:bg-fill-hover transition-colors cursor-pointer"
            title="Back to uncommitted changes"
            aria-label="Back to uncommitted changes"
          >
            <XIcon size={10} />
          </button>
        )}
      </div>
      <Popover open={open} onClose={close} anchorRef={ref} width={440} className="p-0 overflow-hidden flex flex-col">
        <RefMenuPanel
          diffRef={diffRef}
          branch={branch}
          onPick={(next) => {
            close();
            nav.toDiff(next);
          }}
          onOverview={() => {
            close();
            nav.toOverview();
          }}
          onPullRequests={() => {
            close();
            openPullRequests();
          }}
        />
      </Popover>
    </div>
  );
}

function RefMenuPanel(props: { diffRef: string; branch: string | null; onPick: (ref: string) => void; onOverview: () => void; onPullRequests: () => void }) {
  const { diffRef, branch, onPick, onOverview, onPullRequests } = props;
  const hasGitHubRemote = useHasGitHubRemote();
  const { data: status } = useGitStatus();
  const { details, loading: prLoading } = useGitHubPr();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const sentinel = useRef<HTMLDivElement>(null);
  const branchRef = base ? `${base}...HEAD` : null;
  const trimmed = search.trim();

  useEffect(() => {
    const timer = setTimeout(() => setTerm(trimmed), 200);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const commitsQuery = useInfiniteQuery({
    queryKey: ['commits', 'list', term],
    queryFn: ({ pageParam }) => fetchCommits(pageParam, 30, term || undefined),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((sum, page) => sum + page.commits.length, 0) : undefined),
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = commitsQuery;
  const commits = commitsQuery.data?.pages.flatMap((page) => page.commits) ?? [];

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const counts: Record<string, number | undefined> = {
    work: status ? status.staged + status.unstaged + status.untracked : undefined,
    staged: status?.staged,
    unstaged: status ? status.unstaged + status.untracked : undefined,
  };
  const workSelected = diffRef === 'work' || diffRef === 'staged' || diffRef === 'unstaged';
  const showWork = !trimmed;

  return (
    <div className="max-h-[min(560px,75vh)] flex flex-col font-sans overflow-hidden">
      <div className="shrink-0 p-1.5 border-b border-overlay-border">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && trimmed && looksLikeRef(trimmed)) {
                onPick(trimmed);
              }
            }}
            placeholder="Search commits, or type a sha or range"
            className={cn(inputField, 'pl-8 border-transparent bg-transparent hover:border-transparent focus:border-transparent focus:hover:border-transparent')}
          />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-1">
        {trimmed && looksLikeRef(trimmed) && (
          <Item
            selected={false}
            icon={<GitCompareIcon className="w-3.5 h-3.5" />}
            title={<>Open <span className="font-mono text-xs">{trimmed}</span></>}
            hint={trimmed.includes('..') ? 'Compare this range' : 'Review this commit or ref'}
            onClick={() => onPick(trimmed)}
          />
        )}
        {showWork && (
          <div
            className={cn(
              'flex items-center gap-2.5 w-full h-8 pl-2.5 pr-1 rounded-md transition-colors',
              workSelected ? 'bg-selected' : 'hover:bg-hover',
            )}
          >
            <button
              onClick={() => onPick('work')}
              className="flex items-center gap-2.5 min-w-0 flex-1 h-full text-left cursor-pointer"
              title="Staged, unstaged and new files together"
            >
              <PencilIcon className={cn('w-3.5 h-3.5 shrink-0', workSelected ? 'text-text' : 'text-text-secondary')} />
              <span className={cn('text-[13px] truncate', counts.work === 0 ? 'text-text-secondary' : 'text-text')}>
                {counts.work === 0 ? 'No uncommitted changes' : 'Uncommitted changes'}
              </span>
              {!!counts.work && <span className="text-xs text-text-muted shrink-0 tabular-nums">{counts.work}</span>}
            </button>
            {!!counts.work && (
              <div className="flex items-center gap-0.5 shrink-0">
                {WORK_SEGMENTS.map((segment) => {
                  const count = counts[segment.value];
                  const empty = segment.value !== 'work' && count === 0;
                  const active = diffRef === segment.value;
                  return (
                    <button
                      key={segment.value}
                      disabled={empty}
                      title={empty ? `${segment.tooltip} (nothing right now)` : segment.tooltip}
                      onClick={() => onPick(segment.value)}
                      className={cn(
                        'h-6 px-1.5 rounded text-xs transition-colors',
                        active ? 'bg-active text-text font-medium' : 'text-text-secondary hover:text-text hover:bg-hover cursor-pointer',
                        empty && 'text-text-muted/60 hover:text-text-muted/60 hover:bg-transparent cursor-default',
                      )}
                    >
                      {segment.label}
                    </button>
                  );
                })}
              </div>
            )}
            <span className="w-3.5 shrink-0 flex items-center">{diffRef === 'work' && <CheckIcon className="w-3.5 h-3.5 text-text-secondary" />}</span>
          </div>
        )}

        {showWork && (details || prLoading || hasGitHubRemote || (branchRef && branch)) && <div className={sectionClass}>Branch</div>}
        {showWork && prLoading && !details && (
          <div className="flex items-center gap-2 px-2.5 h-8 text-xs text-text-secondary">
            <Spinner className="w-3 h-3" />
            Looking for a pull request…
          </div>
        )}
        {showWork && details && (
          <Item
            selected={diffRef === prDiffRef(details)}
            icon={<GitPullRequestIcon className="w-3.5 h-3.5" />}
            title={`#${details.prNumber} ${details.prTitle}`}
            meta={`into ${details.baseRef}`}
            onClick={() => onPick(prDiffRef(details))}
          />
        )}
        {showWork && !details && branchRef && branch && (
          <Item
            selected={diffRef === branchRef}
            icon={<GitCompareIcon className="w-3.5 h-3.5" />}
            title={`${branch} vs ${shortBase(base ?? '')}`}
            tooltip={`Every commit on ${branch} that is not on ${shortBase(base ?? '')}`}
            onClick={() => onPick(branchRef)}
          />
        )}
        {showWork && hasGitHubRemote && (
          <Item
            selected={false}
            icon={<GitPullRequestIcon className="w-3.5 h-3.5" />}
            title="Pull requests…"
            tooltip="Check out an open pull request, or paste a URL or number"
            onClick={onPullRequests}
          />
        )}

        <div className={sectionClass}>{trimmed ? 'Matching commits' : 'Commits'}</div>
        {commitsQuery.isLoading && (
          <div className="flex items-center gap-2 px-2.5 h-8 text-xs text-text-secondary">
            <Spinner className="w-3 h-3" />
            Loading commits…
          </div>
        )}
        {!commitsQuery.isLoading && commits.length === 0 && (
          <div className="px-2.5 h-8 flex items-center text-xs text-text-secondary">{trimmed ? `No commits match “${trimmed}”` : 'No commits yet'}</div>
        )}
        {commits.map((commit) => (
          <CommitItem
            key={commit.hash}
            commit={commit}
            selected={parseCommitRef(diffRef) === commit.hash}
            onClick={() => onPick(commitRef(commit.hash))}
          />
        ))}
        <div ref={sentinel} />
        {isFetchingNextPage && (
          <div className="flex items-center justify-center gap-2 h-8 text-xs text-text-secondary">
            <Spinner className="w-3 h-3" />
          </div>
        )}
      </div>
      <div className="shrink-0 p-1 border-t border-overlay-border">
        <button className="flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-[13px] text-text hover:bg-hover transition-colors cursor-pointer" onClick={onOverview}>
          <GitBranchIcon className="w-3.5 h-3.5 text-text-secondary" />
          All commits, ranges and branches…
        </button>
      </div>
    </div>
  );
}
