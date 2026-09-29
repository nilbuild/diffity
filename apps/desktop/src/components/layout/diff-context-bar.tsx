import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fetchCommit, parseCommitRef } from '../../lib/api';
import { useCopy } from '../../hooks/use-copy';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { AuthorAvatar } from './commit-list';
import { prDiffRef, rangeParts } from './ref-menu';
import { CheckIcon, CopyIcon, GitCompareIcon } from '../ui/icon';

export function useCommitDetails(sha: string | null) {
  return useQuery({
    queryKey: ['commit', sha],
    queryFn: () => fetchCommit(sha ?? ''),
    enabled: !!sha,
    staleTime: Infinity,
  });
}

function CommitHeader(props: { sha: string }) {
  const { sha } = props;
  const { copied, copy } = useCopy();
  const { data: commit, isLoading } = useCommitDetails(sha);

  if (isLoading) {
    return <div className="h-10 w-2/3 rounded bg-fill animate-pulse" />;
  }
  return (
    <div className="min-w-0">
      <h2 className="text-[15px] font-semibold leading-6 text-text break-words">{commit?.message ?? `Commit ${sha.slice(0, 7)}`}</h2>
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
        {commit && (
          <>
            <AuthorAvatar name={commit.author} />
            <span>{commit.author}</span>
            <span className="text-text-muted">·</span>
            <span title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>{commit.relativeDate}</span>
            <span className="text-text-muted">·</span>
          </>
        )}
        <button
          onClick={() => copy(sha)}
          className="inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary hover:text-text cursor-pointer"
          title="Copy full commit hash"
        >
          {sha.slice(0, 7)}
          {copied ? <CheckIcon className="w-3 h-3 text-added" /> : <CopyIcon className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
}

/** A light header at the top of the diff for a commit or a compared range (not a sticky bar). */
export function DiffContextHeader(props: { diffRef: string }) {
  const { diffRef } = props;
  const { details } = useGitHubPr();
  const commitSha = parseCommitRef(diffRef);
  const isPr = details !== null && diffRef === prDiffRef(details);

  if (commitSha) {
    return <CommitHeader sha={commitSha} />;
  }
  if (isPr || !diffRef.includes('..')) {
    return null;
  }
  const { base, head } = rangeParts(diffRef);
  return (
    <div className="flex items-center gap-2 min-w-0 text-xs text-text-secondary">
      <GitCompareIcon size="sm" className="text-text-muted" />
      <span className="truncate">
        {diffRef.includes('...')
          ? <>Changes on <code className="font-mono text-text">{head}</code> since it split from <code className="font-mono text-text">{base}</code></>
          : <>Every change after <code className="font-mono text-text">{base}</code>, up to <code className="font-mono text-text">{head}</code></>}
      </span>
    </div>
  );
}
