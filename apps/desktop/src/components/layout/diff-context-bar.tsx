import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fetchCommit, parseCommitRef } from '../../lib/api';
import { useRepoNav } from '../../hooks/use-repo';
import { useCopy } from '../../hooks/use-copy';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { ArrowLeftIcon } from '../icons/arrow-left-icon';
import { CheckIcon } from '../icons/check-icon';
import { ExternalLinkIcon } from '../icons/external-link-icon';
import { prDiffRef } from './ref-menu';

interface DiffContextBarProps {
  diffRef: string;
}

function useBack() {
  const navigate = useNavigate();
  const nav = useRepoNav();
  return () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) {
      navigate(-1);
      return;
    }
    nav.toOverview();
  };
}

function CommitSummary(props: { sha: string }) {
  const { sha } = props;
  const { copied, copy } = useCopy();
  const { data: commit, isLoading } = useQuery({
    queryKey: ['commit', sha],
    queryFn: () => fetchCommit(sha),
    staleTime: Infinity,
  });

  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="text-text-secondary shrink-0">Commit</span>
      <button
        onClick={() => copy(sha)}
        className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-fill text-accent hover:bg-fill-hover shrink-0 cursor-pointer"
        title="Copy full commit hash"
      >
        {copied ? <CheckIcon className="inline w-3 h-3 text-added" /> : sha.slice(0, 7)}
      </button>
      {isLoading && <span className="w-40 h-3 rounded bg-bg-tertiary animate-pulse" />}
      {commit && (
        <>
          <span className="font-medium text-text truncate" title={commit.message}>
            {commit.message}
          </span>
          <span className="text-text-muted shrink-0 hidden lg:inline">
            {commit.author} · <span title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>{commit.relativeDate}</span>
          </span>
        </>
      )}
    </span>
  );
}

export function DiffContextBar(props: DiffContextBarProps) {
  const { diffRef } = props;
  const back = useBack();
  const { details } = useGitHubPr();
  const commitSha = parseCommitRef(diffRef);
  const isPr = details !== null && diffRef === prDiffRef(details);
  const isRange = !isPr && diffRef.includes('..');

  const renderSummary = () => {
    if (commitSha) {
      return <CommitSummary sha={commitSha} />;
    }
    if (isPr && details) {
      return (
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-text truncate">{details.prTitle}</span>
          <a href={details.prUrl} className="inline-flex items-center gap-1 text-text-muted hover:text-accent shrink-0" title="Open on GitHub">
            #{details.prNumber}
            <ExternalLinkIcon className="w-3 h-3" />
          </a>
          <span className="text-text-muted shrink-0 hidden lg:inline font-mono text-[11px]">
            {details.headRef} → {details.baseRef}
          </span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-text-muted shrink-0">Comparing</span>
        <span className="font-mono text-[11px] text-text truncate">{diffRef}</span>
      </span>
    );
  };

  if (isPr) {
    return null;
  }

  if (!commitSha && !isPr && !isRange) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 h-9 shrink-0 px-3 bg-bg-secondary border-b border-border font-sans text-[13px]">
      {!isPr && (
        <button
          onClick={back}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0"
          title="Back"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back
        </button>
      )}
      <div className="min-w-0 flex-1">{renderSummary()}</div>
    </div>
  );
}
