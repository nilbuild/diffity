import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { infiniteQueryOptions, keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type Commit, fetchCommits } from '../../lib/api';
import { Spinner } from '../icons/spinner';
import { GitCommitIcon, GitCompareIcon } from '../ui/icon';
import { ListRow, ListRowSkeleton, StatCell } from '../ui/list-row';
import { Skeleton, useRevealClass } from '../ui/skeleton';
import { DiffStatBar } from '../ui/diff-stat-bar';

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

function CommitRow(props: { commit: Commit; onOpen: () => void; onCompareFrom: () => void }) {
  const { commit, onOpen, onCompareFrom } = props;

  return (
    <ListRow
      icon={<GitCommitIcon size="sm" className="text-text-muted" />}
      title={commit.message}
      tooltip={`${commit.message}\nView this commit`}
      meta={
        <>
          <AuthorAvatar name={commit.author} />
          <span className="truncate text-text-secondary">{commit.author}</span>
          <span aria-hidden>·</span>
          <code className="shrink-0 font-mono text-[11px]">{commit.shortHash}</code>
          <span aria-hidden>·</span>
          <span className="shrink-0 whitespace-nowrap" title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>{commit.relativeDate}</span>
        </>
      }
      stats={<StatCell additions={commit.additions} deletions={commit.deletions} bar={<DiffStatBar additions={commit.additions} deletions={commit.deletions} />} />}
      onClick={onOpen}
      actions={[
        { label: 'View commit', icon: <GitCommitIcon size="sm" />, onSelect: onOpen },
        { label: 'View changes since this commit', icon: <GitCompareIcon size="sm" />, onSelect: onCompareFrom },
      ]}
    />
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
          <div className="px-3 pt-4 pb-1.5 h-[38px] flex items-end">
            <Skeleton className="w-16 h-2.5 mb-1" />
          </div>
          <ul>
            {Array.from({ length: 6 }, (_, index) => <ListRowSkeleton key={index} index={index} avatar />)}
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
    <div>
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
