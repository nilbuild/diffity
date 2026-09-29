import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { type Commit, fetchCommits } from '../../lib/api';
import { SearchIcon } from '../icons/search-icon';
import { Spinner } from '../icons/spinner';
import { GitCompareIcon } from '../icons/git-compare-icon';

interface CommitListProps {
  onCommitClick: (hash: string) => void;
  onCompareFrom: (hash: string) => void;
}

const PAGE_SIZE = 30;

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function CommitRow(props: { commit: Commit; onClick: () => void; onCompareFrom: () => void }) {
  const { commit, onClick, onCompareFrom } = props;

  return (
    <li className="group relative">
      <button
        onClick={onClick}
        className="w-full text-left h-9 px-3 hover:bg-hover transition-colors flex items-center gap-3 cursor-pointer"
        title="Review this commit"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-text">{commit.message}</span>
        <span className="shrink-0 flex items-center gap-3 text-xs text-text-muted group-hover:invisible">
          <span className="hidden md:flex items-center gap-1 font-mono text-[11px] tabular-nums w-24 justify-end">
            {commit.additions > 0 && <span className="text-added">+{commit.additions}</span>}
            {commit.deletions > 0 && <span className="text-deleted">-{commit.deletions}</span>}
          </span>
          <span className="truncate max-w-[120px] hidden sm:inline">{commit.author}</span>
          <span className="min-w-20 text-right whitespace-nowrap" title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>
            {commit.relativeDate}
          </span>
          <code className="font-mono text-[11px] text-accent w-14 text-right">{commit.shortHash}</code>
        </span>
      </button>
      <button
        onClick={onCompareFrom}
        className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:inline-flex items-center gap-1 h-6 px-2 rounded-md bg-raised border border-border text-[11px] text-text-secondary hover:text-text cursor-pointer"
        title="Review every change made after this commit, up to HEAD"
      >
        <GitCompareIcon className="w-3 h-3" />
        Changes since
      </button>
    </li>
  );
}

export function CommitList(props: CommitListProps) {
  const { onCommitClick, onCompareFrom } = props;
  const [search, setSearch] = useState('');
  const term = useDebounced(search.trim(), 250);
  const sentinel = useRef<HTMLDivElement>(null);

  const query = useInfiniteQuery({
    queryKey: ['commits', 'list', term],
    queryFn: ({ pageParam }) => fetchCommits(pageParam, PAGE_SIZE, term || undefined),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.reduce((sum, page) => sum + page.commits.length, 0) : undefined),
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const commits = query.data?.pages.flatMap((page) => page.commits) ?? [];

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
        <ul className="divide-y divide-border">
          {Array.from({ length: 5 }, (_, i) => (
            <li key={i} className="flex items-center h-9 px-3">
              <div className="h-3 w-2/3 rounded bg-bg-tertiary animate-pulse" />
            </li>
          ))}
        </ul>
      );
    }
    if (query.isError) {
      return (
        <div className="px-3 py-2.5 text-xs text-deleted flex items-center gap-3">
          Could not load commits.
          <button onClick={() => void query.refetch()} className="text-accent hover:underline cursor-pointer">
            Try again
          </button>
        </div>
      );
    }
    if (commits.length === 0) {
      return <p className="text-xs text-text-muted px-3 py-2.5">{term ? `No commits match “${term}”` : 'No commits yet'}</p>;
    }
    return (
      <ul className="divide-y divide-border">
        {commits.map((commit) => (
          <CommitRow key={commit.hash} commit={commit} onClick={() => onCommitClick(commit.hash)} onCompareFrom={() => onCompareFrom(commit.hash)} />
        ))}
      </ul>
    );
  };

  return (
    <div>
      <div className="p-1.5 border-b border-border bg-bg-secondary">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by message, author or hash"
            className="w-full h-7 text-xs bg-bg border border-border rounded-md pl-8 pr-3 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          {query.isFetching && !query.isLoading && !isFetchingNextPage && <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3" />}
        </div>
      </div>
      {renderBody()}
      <div ref={sentinel} />
      {hasNextPage && !isFetchingNextPage && (
        <div className="px-3 py-2 border-t border-border">
          <button onClick={() => void fetchNextPage()} className="text-xs text-accent hover:underline cursor-pointer">
            Load more commits
          </button>
        </div>
      )}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-border text-xs text-text-muted">
          <Spinner className="w-3 h-3" />
          Loading more commits…
        </div>
      )}
    </div>
  );
}
