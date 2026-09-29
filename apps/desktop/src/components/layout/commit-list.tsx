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
        className="w-full text-left px-4 py-2.5 hover:bg-bg-tertiary transition-colors flex items-center gap-3 cursor-pointer"
        title="Review this commit"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-text truncate">{commit.message}</span>
          <span className="flex items-center gap-1.5 text-xs text-text-muted mt-0.5 min-w-0">
            <code className="font-mono text-accent shrink-0">{commit.shortHash}</code>
            <span>·</span>
            <span className="truncate">{commit.author}</span>
            <span>·</span>
            <span className="shrink-0" title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>
              {commit.relativeDate}
            </span>
          </span>
        </span>
        <span className="shrink-0 flex items-center gap-2 text-xs font-mono group-hover:invisible">
          {commit.filesChanged > 0 && (
            <span className="text-text-muted">
              {commit.filesChanged} file{commit.filesChanged === 1 ? '' : 's'}
            </span>
          )}
          {commit.additions > 0 && <span className="text-added font-semibold">+{commit.additions}</span>}
          {commit.deletions > 0 && <span className="text-deleted font-semibold">-{commit.deletions}</span>}
        </span>
      </button>
      <button
        onClick={onCompareFrom}
        className="absolute right-3 top-1/2 -translate-y-1/2 hidden group-hover:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-secondary ring-1 ring-border text-[11px] text-text-secondary hover:text-text cursor-pointer"
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
            <li key={i} className="px-4 py-3 space-y-1.5">
              <div className="h-3.5 w-2/3 rounded bg-bg-tertiary animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-bg-tertiary animate-pulse" />
            </li>
          ))}
        </ul>
      );
    }
    if (query.isError) {
      return (
        <div className="px-4 py-3 text-sm text-deleted flex items-center gap-3">
          Could not load commits.
          <button onClick={() => void query.refetch()} className="text-accent hover:underline cursor-pointer">
            Try again
          </button>
        </div>
      );
    }
    if (commits.length === 0) {
      return <p className="text-sm text-text-muted px-4 py-3">{term ? `No commits match “${term}”` : 'No commits yet'}</p>;
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
      <div className="px-4 py-2 border-b border-border">
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by message, author or hash"
            className="w-full text-sm bg-bg border border-border rounded-md pl-8 pr-3 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          {query.isFetching && !query.isLoading && !isFetchingNextPage && <Spinner className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3" />}
        </div>
      </div>
      {renderBody()}
      <div ref={sentinel} />
      {hasNextPage && !isFetchingNextPage && (
        <div className="px-4 py-2 border-t border-border">
          <button onClick={() => void fetchNextPage()} className="text-xs text-accent hover:underline cursor-pointer">
            Load more commits
          </button>
        </div>
      )}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-border text-xs text-text-muted">
          <Spinner className="w-3 h-3" />
          Loading more commits…
        </div>
      )}
    </div>
  );
}
