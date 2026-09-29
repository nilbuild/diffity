import { useState, useCallback, useRef } from 'react';
import { type Commit, fetchCommits } from '../../lib/api';

interface CommitListProps {
  initialCommits: Commit[];
  initialHasMore: boolean;
  onCommitClick: (hash: string) => void;
}

export function CommitList(props: CommitListProps) {
  const { initialCommits, initialHasMore, onCommitClick } = props;
  const [commits, setCommits] = useState(initialCommits);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    searchTimeout.current = setTimeout(async () => {
      setLoading(true);
      try {
        const trimmed = value.trim();
        const page = await fetchCommits(0, 10, trimmed || undefined);
        setCommits(page.commits);
        setHasMore(page.hasMore);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const loadMore = useCallback(async () => {
    setLoading(true);
    try {
      const trimmed = search.trim();
      const page = await fetchCommits(commits.length, 10, trimmed || undefined);
      setCommits((prev) => [...prev, ...page.commits]);
      setHasMore(page.hasMore);
    } finally {
      setLoading(false);
    }
  }, [commits.length, search]);

  return (
    <div>
      <div className="px-4 py-2 border-b border-border">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search commits..."
          className="w-full text-sm bg-bg border border-border rounded-md px-3 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
      </div>
      {commits.length === 0 ? (
        <p className="text-sm text-text-muted px-4 py-3">
          {search ? 'No matching commits' : 'No recent commits'}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {commits.map((commit) => (
            <li key={commit.hash}>
              <button
                onClick={() => onCommitClick(commit.hash)}
                className="w-full text-left px-4 py-3 hover:bg-bg-tertiary transition-colors flex items-center gap-3"
              >
                <code className="text-xs font-mono text-accent shrink-0">
                  {commit.shortHash}
                </code>
                <span className="text-sm text-text truncate flex-1">
                  {commit.message}
                </span>
                <span className="text-xs text-text-muted shrink-0">
                  {commit.relativeDate}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={loadMore}
            disabled={loading}
            className="text-sm text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
