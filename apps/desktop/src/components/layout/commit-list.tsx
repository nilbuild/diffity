import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type Commit, fetchCommits } from '../../lib/api';
import { Spinner } from '../icons/spinner';
import { GitCommitIcon, GitCompareIcon } from '../ui/icon';

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

export function AuthorAvatar(props: { name: string }) {
  const { name } = props;
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

function CommitStat(props: { commit: Commit }) {
  const { commit } = props;

  if (commit.additions === 0 && commit.deletions === 0) {
    return null;
  }
  return (
    <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums">
      {commit.additions > 0 && <span className="text-added">+{commit.additions}</span>}
      {commit.deletions > 0 && <span className="text-deleted">−{commit.deletions}</span>}
    </span>
  );
}

function CommitRow(props: { commit: Commit; onOpen: () => void; onCompareFrom: () => void }) {
  const { commit, onOpen, onCompareFrom } = props;

  return (
    <li className="group relative">
      <button
        onClick={onOpen}
        title={`${commit.message}\nReview this commit`}
        className="grid grid-cols-[minmax(0,1fr)_minmax(0,180px)_64px_96px_84px] items-center gap-4 w-full h-11 px-3 rounded-lg text-left hover:bg-hover transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-3 min-w-0">
          <GitCommitIcon size="sm" className="text-text-muted" />
          <span className="truncate text-[13px] text-text">{commit.message}</span>
        </span>
        <span className="flex items-center gap-2 min-w-0 text-xs text-text-secondary">
          <AuthorAvatar name={commit.author} />
          <span className="truncate">{commit.author}</span>
        </span>
        <code className="font-mono text-[11px] text-text-muted">{commit.shortHash}</code>
        <span className="text-xs text-text-muted whitespace-nowrap" title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>
          {commit.relativeDate}
        </span>
        <span className="group-hover:invisible"><CommitStat commit={commit} /></span>
      </button>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex">
        <button
          onClick={onCompareFrom}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-raised border border-control-border text-xs text-text hover:bg-control-hover cursor-pointer"
          title="Review every change made after this commit, up to HEAD"
        >
          <GitCompareIcon size="sm" className="text-text-secondary" />
          Changes since
        </button>
      </span>
    </li>
  );
}

export function SectionHeader(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <div className="sticky top-0 z-10 bg-bg px-3 pt-4 pb-1.5 text-xs font-medium text-text-secondary">
      {children}
    </div>
  );
}

export function CommitList(props: CommitListProps) {
  const { search, header, onOpen, onCompareFrom, onFetchingChange, onLoaded } = props;
  const term = useDebounced(search.trim(), 250);
  const sentinel = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    queryKey: ['commits', 'list', term],
    queryFn: ({ pageParam }) => fetchCommits(pageParam, PAGE_SIZE, term || undefined),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((sum, page) => sum + page.commits.length, 0) : undefined),
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const commits = useMemo(() => query.data?.pages.flatMap((page) => page.commits) ?? [], [query.data]);
  const refetching = query.isFetching && !query.isLoading && !isFetchingNextPage;

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
        <ul>
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 h-11 px-3">
              <div className="h-3 flex-1 max-w-[50%] rounded bg-fill animate-pulse" />
              <div className="h-3 w-32 rounded bg-fill animate-pulse" />
              <div className="h-3 w-16 rounded bg-fill animate-pulse" />
            </li>
          ))}
        </ul>
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
    <div>
      {!term && header}
      {renderBody()}
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
