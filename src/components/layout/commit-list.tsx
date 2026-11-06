import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { infiniteQueryOptions, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type Commit, fetchCommits } from '../../lib/api';
import { Spinner } from '../icons/spinner';
import { EllipsisIcon, GitCommitIcon, GitCompareIcon } from '../ui/icon';
import { ContextMenu, MenuItem, Popover, useMenu } from '../ui/popover';
import { Skeleton, useRevealClass } from '../ui/skeleton';
import { useHasGitHubRemote } from '../../hooks/use-repo-state';
import { cn } from '../../lib/cn';

interface CommitListProps {
  search: string;
  header?: ReactNode;
  onOpen: (commit: Commit) => void;
  onCompareFrom: (hash: string) => void;
  onFetchingChange?: (fetching: boolean) => void;
  onLoaded?: (commits: Commit[]) => void;
}

const PAGE_SIZE = 40;

const AVATAR_COLORS = ['#4a7fc1', '#4d8a5f', '#a07f3c', '#8069b8', '#b0628c', '#b35f5f', '#3f8a91', '#7a8591'];

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function dayLabel(date: string) {
  const day = dayjs(date).startOf('day');
  const today = dayjs().startOf('day');
  if (day.isSame(today)) {
    return 'Today';
  }
  if (day.isSame(today.subtract(1, 'day'))) {
    return 'Yesterday';
  }
  if (day.year() === today.year()) {
    return day.format('ddd, MMM D');
  }
  return day.format('MMM D, YYYY');
}

const NOREPLY_EMAIL = /^(?:(\d+)\+)?([^@]+)@users\.noreply\.github\.com$/i;

function githubAvatarUrl(email: string, hasGitHubRemote: boolean): string | null {
  const noreply = NOREPLY_EMAIL.exec(email);
  if (noreply) {
    return noreply[1] ? `https://avatars.githubusercontent.com/u/${noreply[1]}?s=40` : `https://github.com/${noreply[2]}.png?size=40`;
  }
  if (!hasGitHubRemote || !email.includes('@')) {
    return null;
  }
  return `https://avatars.githubusercontent.com/u/e?email=${encodeURIComponent(email)}&s=40`;
}

export function AuthorAvatar(props: { name: string; email?: string }) {
  const { name, email } = props;
  const hasGitHubRemote = useHasGitHubRemote();
  const avatarUrl = email ? githubAvatarUrl(email, hasGitHubRemote) : null;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        aria-hidden
        className={cn('w-5 h-5 rounded-full shrink-0 bg-fill', loadedUrl !== avatarUrl && 'opacity-0')}
        onError={() => setFailedUrl(avatarUrl)}
        onLoad={(event) => {
          // GitHub answers unknown emails with a full-size identicon, ignoring the size param
          if (event.currentTarget.naturalWidth > 100) {
            setFailedUrl(avatarUrl);
            return;
          }
          setLoadedUrl(avatarUrl);
        }}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];

  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold shrink-0"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {initial}
    </span>
  );
}

/** One line per commit: hash, message, author, line counts. Right-click or ⋯ for more. */
function CommitRow(props: { commit: Commit; onOpen: () => void; onCompareFrom: () => void }) {
  const { commit, onOpen, onCompareFrom } = props;
  const menu = useMenu();
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(null);
  const renderItems = (close: () => void) => (
    <>
      <MenuItem icon={<GitCommitIcon size="sm" />} label="View commit" onSelect={() => {
        close();
        onOpen();
      }} />
      <MenuItem icon={<GitCompareIcon size="sm" />} label="View changes since this commit" onSelect={() => {
        close();
        onCompareFrom();
      }} />
    </>
  );

  return (
    <li className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onOpen();
          }
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setContextAt({ x: event.clientX, y: event.clientY });
        }}
        title={`${commit.message}\n${commit.author} · ${dayjs(commit.date).format('YYYY-MM-DD HH:mm')}`}
        className="grid grid-cols-[64px_minmax(0,1fr)_auto_auto_28px] items-center gap-3 h-9 pl-3.5 pr-1.5 text-left hover:bg-hover focus-visible:bg-hover outline-none transition-colors cursor-pointer"
      >
        <code className="font-mono text-[11px] text-text-muted">{commit.shortHash}</code>
        <span className="truncate text-[13px] text-text">{commit.message}</span>
        <span className="hidden @[560px]/commits:flex items-center gap-1.5 min-w-0 max-w-[180px] text-xs text-text-muted">
          <AuthorAvatar name={commit.author} email={commit.authorEmail} />
          <span className="truncate">{commit.author}</span>
        </span>
        <span className="inline-flex justify-end gap-1.5 min-w-[64px] font-mono text-[11px] tabular-nums whitespace-nowrap">
          {commit.additions > 0 && <span className="text-diff-added">+{commit.additions}</span>}
          {commit.deletions > 0 && <span className="text-diff-deleted">−{commit.deletions}</span>}
        </span>
        <button
          ref={menu.anchorRef}
          onClick={(event) => {
            event.stopPropagation();
            menu.toggle();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-text-secondary hover:text-text hover:bg-active opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
          title="More actions"
          aria-label="More actions"
        >
          <EllipsisIcon size="md" />
        </button>
      </div>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={240}>
        {renderItems(menu.close)}
      </Popover>
      <ContextMenu position={contextAt} onClose={() => setContextAt(null)}>
        {renderItems(() => setContextAt(null))}
      </ContextMenu>
    </li>
  );
}

export function SectionHeader(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <div className="px-3.5 py-1.5 text-xs font-medium text-text-muted bg-bg-secondary border-b border-border-muted [section+section_&]:border-t">
      {children}
    </div>
  );
}

export function commitListOptions(term: string) {
  return infiniteQueryOptions({
    queryKey: ['commits', 'list', term],
    queryFn: ({ pageParam }) => fetchCommits(pageParam, PAGE_SIZE, term || undefined),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((sum, page) => sum + page.commits.length, 0) : undefined),
  });
}

export function CommitList(props: CommitListProps) {
  const { search, header, onOpen, onCompareFrom, onFetchingChange, onLoaded } = props;
  const term = useDebounced(search.trim(), 250);
  const sentinel = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({ ...commitListOptions(term), placeholderData: keepPreviousData });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const commits = useMemo(() => query.data?.pages.flatMap((page) => page.commits) ?? [], [query.data]);
  const refetching = query.isFetching && !query.isLoading && !isFetchingNextPage;
  const reveal = useRevealClass(query.isLoading);

  useEffect(() => {
    onFetchingChange?.(refetching);
  }, [refetching, onFetchingChange]);

  useEffect(() => {
    onLoaded?.(commits);
  }, [commits, onLoaded]);

  const groups = useMemo(() => {
    const result: { label: string; commits: Commit[] }[] = [];
    for (const commit of commits) {
      const label = dayLabel(commit.date);
      const last = result[result.length - 1];
      if (last && last.label === label) {
        last.commits.push(commit);
        continue;
      }
      result.push({ label, commits: [commit] });
    }
    return result;
  }, [commits]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasNextPage) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage();
      }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderBody = () => {
    if (query.isLoading) {
      return (
        <section aria-busy>
          <div className="px-3 pt-3 pb-1 h-[30px] flex items-end">
            <Skeleton className="w-16 h-2.5 mb-1" />
          </div>
          <ul>
            {Array.from({ length: 8 }, (_, index) => (
              <li key={index} className="flex items-center gap-3 h-8 px-3">
                <Skeleton className="w-14 h-2.5" />
                <Skeleton className="h-3" style={{ width: `${[52, 38, 60, 44, 56, 34, 48, 40][index]}%` }} />
              </li>
            ))}
          </ul>
        </section>
      );
    }
    if (query.isError) {
      return (
        <div className="px-3 py-4 text-[13px] text-deleted flex items-center gap-3">
          Could not load commits.
          <button onClick={() => void query.refetch()} className="text-text underline decoration-text-muted/50 underline-offset-2 cursor-pointer">
            Try again
          </button>
        </div>
      );
    }
    if (commits.length === 0) {
      return <p className="text-[13px] text-text-secondary px-3 py-6">{term ? `No commits match “${term}”` : 'No commits yet'}</p>;
    }
    return groups.map((group) => (
      <section key={group.label}>
        <SectionHeader>{group.label}</SectionHeader>
        <ul>
          {group.commits.map((commit) => (
            <CommitRow
              key={commit.hash}
              commit={commit}
              onOpen={() => onOpen(commit)}
              onCompareFrom={() => onCompareFrom(commit.hash)}
            />
          ))}
        </ul>
      </section>
    ));
  };

  return (
    <div className="@container/commits">
      {!term && header}
      <div className={reveal}>{renderBody()}</div>
      <div ref={sentinel} />
      {hasNextPage && !isFetchingNextPage && (
        <div className="px-3 py-3">
          <button onClick={() => void fetchNextPage()} className="text-[13px] text-text-secondary hover:text-text cursor-pointer">
            Load more commits
          </button>
        </div>
      )}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-text-secondary">
          <Spinner className="w-3 h-3" />
          Loading more commits…
        </div>
      )}
    </div>
  );
}
