import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type Commit, fetchCommits } from '../../lib/api';
import { Spinner } from '../icons/spinner';
import { cn } from '../../lib/cn';
import { GitCommitIcon, GitCompareIcon } from '../ui/icon';

interface CommitListProps {
  search: string;
  header?: ReactNode;
  selectedHash: string | null;
  onSelect: (commit: Commit) => void;
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
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-semibold shrink-0"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`, color }}
    >
      {initial}
    </span>
  );
}

export function HistoryRow(props: {
  icon: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  trailing?: ReactNode;
  hoverAction?: ReactNode;
  selected?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  tooltip?: string;
}) {
  const { icon, title, meta, trailing, hoverAction, selected = false, onClick, onDoubleClick, tooltip } = props;

  return (
    <li className="group relative">
      <button
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        data-selected={selected || undefined}
        className={cn(
          'flex items-center gap-3 w-full min-h-[52px] px-3 py-2 rounded-lg text-left transition-colors cursor-pointer',
          selected ? 'bg-selected' : 'hover:bg-hover',
        )}
        title={tooltip}
      >
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-raised ring-1 ring-border text-text-secondary shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-5 text-text font-medium truncate">{title}</span>
          <span className="flex items-center gap-1.5 text-xs leading-5 text-text-secondary min-w-0">{meta}</span>
        </span>
        {trailing && <span className={hoverAction ? 'shrink-0 group-hover:invisible' : 'shrink-0'}>{trailing}</span>}
      </button>
      {hoverAction && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:flex">{hoverAction}</span>
      )}
    </li>
  );
}

function CommitStat(props: { commit: Commit }) {
  const { commit } = props;

  if (commit.additions === 0 && commit.deletions === 0) {
    return null;
  }
  return (
    <span className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
      {commit.additions > 0 && <span className="text-added">+{commit.additions}</span>}
      {commit.deletions > 0 && <span className="text-deleted">−{commit.deletions}</span>}
    </span>
  );
}

function CommitRow(props: { commit: Commit; selected: boolean; onClick: () => void; onDoubleClick: () => void; onCompareFrom: () => void }) {
  const { commit, selected, onClick, onDoubleClick, onCompareFrom } = props;

  return (
    <HistoryRow
      selected={selected}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      tooltip="Double-click to review this commit"
      icon={<GitCommitIcon className="w-3.5 h-3.5" />}
      title={commit.message}
      meta={
        <>
          <code className="font-mono text-[11px] text-text-secondary shrink-0">{commit.shortHash}</code>
          <span className="text-text-muted">·</span>
          <AuthorAvatar name={commit.author} />
          <span className="truncate">{commit.author}</span>
          <span className="text-text-muted">·</span>
          <span className="shrink-0 whitespace-nowrap" title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>
            {commit.relativeDate}
          </span>
        </>
      }
      trailing={<CommitStat commit={commit} />}
      hoverAction={
        <button
          onClick={onCompareFrom}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-overlay ring-1 ring-overlay-border text-xs text-text hover:bg-fill cursor-pointer"
          title="Review every change made after this commit, up to HEAD"
        >
          <GitCompareIcon className="w-3.5 h-3.5 text-text-secondary" />
          Changes since
        </button>
      }
    />
  );
}

export function SectionHeader(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <div className="sticky top-0 z-10 bg-bg-secondary px-3 pt-3 pb-1.5 text-xs font-medium text-text-secondary">
      {children}
    </div>
  );
}

export function CommitList(props: CommitListProps) {
  const { search, header, selectedHash, onSelect, onOpen, onCompareFrom, onFetchingChange, onLoaded } = props;
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
            <li key={i} className="flex items-center gap-3 h-[52px] px-3">
              <div className="w-7 h-7 rounded-full bg-fill animate-pulse" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-2/3 rounded bg-fill animate-pulse" />
                <div className="h-2.5 w-1/3 rounded bg-fill animate-pulse" />
              </div>
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
              selected={selectedHash === commit.hash}
              onClick={() => onSelect(commit)}
              onDoubleClick={() => onOpen(commit)}
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
