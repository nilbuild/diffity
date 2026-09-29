import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ParsedDiff } from '@diffity/parser';
import { fetchCommit, parseCommitRef } from '../../lib/api';
import type { ViewMode } from '../../lib/diff-utils';
import { useRepoNav } from '../../hooks/use-repo';
import { useCopy } from '../../hooks/use-copy';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { cn } from '../../lib/cn';
import { DiffStats } from '../diff/diff-stats';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { UnifiedViewIcon } from '../icons/unified-view-icon';
import { SplitViewIcon } from '../icons/split-view-icon';
import { ArrowLeftIcon } from '../icons/arrow-left-icon';
import { CheckIcon } from '../icons/check-icon';
import { EyeOffIcon } from '../icons/eye-off-icon';
import { ExternalLinkIcon } from '../icons/external-link-icon';
import { useTargetLabel, prDiffRef } from './ref-menu';

interface DiffContextBarProps {
  diffRef: string;
  branch: string | null;
  diff: ParsedDiff | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hideWhitespace: boolean;
  onHideWhitespaceChange: (hide: boolean) => void;
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
      <span className="text-text-muted shrink-0">Commit</span>
      <button
        onClick={() => copy(sha)}
        className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-bg-tertiary text-accent hover:bg-hover shrink-0 cursor-pointer"
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
  const { diffRef, branch, diff, viewMode, onViewModeChange, hideWhitespace, onHideWhitespaceChange } = props;
  const back = useBack();
  const target = useTargetLabel(diffRef, branch);
  const { details } = useGitHubPr();
  const commitSha = parseCommitRef(diffRef);
  const isPr = details !== null && diffRef === prDiffRef(details);
  const showBack = commitSha !== null || diffRef.includes('..');

  const viewModeOptions = useMemo(() => [
    { value: 'unified' as ViewMode, label: 'Unified', icon: <UnifiedViewIcon className="w-3.5 h-3.5" /> },
    { value: 'split' as ViewMode, label: 'Split', icon: <SplitViewIcon className="w-3.5 h-3.5" /> },
  ], []);

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
    if (diffRef.includes('..')) {
      return (
        <span className="flex items-center gap-2 min-w-0">
          <span className="text-text-muted shrink-0">Comparing</span>
          <span className="font-mono text-[11px] text-text truncate">{diffRef}</span>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-text truncate">{target.label}</span>
        {branch && <span className="text-text-muted truncate">on {branch}</span>}
      </span>
    );
  };

  return (
    <div className="flex items-center gap-3 h-9 shrink-0 px-4 bg-bg border-b border-border font-sans text-xs">
      {showBack && (
        <button
          onClick={back}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 -ml-1.5 rounded-md text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0"
          title="Back"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Back
        </button>
      )}
      <div className="min-w-0 flex-1">{renderSummary()}</div>
      {diff && (
        <span className="flex items-center gap-2 text-text-muted shrink-0">
          {diff.stats.filesChanged} file{diff.stats.filesChanged !== 1 ? 's' : ''} changed
          <DiffStats additions={diff.stats.totalAdditions} deletions={diff.stats.totalDeletions} />
        </span>
      )}
      <button
        onClick={() => onHideWhitespaceChange(!hideWhitespace)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors cursor-pointer shrink-0',
          hideWhitespace ? 'bg-accent/10 text-accent' : 'text-text-muted hover:text-text hover:bg-hover',
        )}
        title={hideWhitespace ? 'Whitespace changes are hidden' : 'Hide whitespace-only changes'}
      >
        <EyeOffIcon className="w-3.5 h-3.5" />
        <span className="hidden xl:inline">{hideWhitespace ? 'Whitespace hidden' : 'Hide whitespace'}</span>
      </button>
      <div className="shrink-0">
        <SegmentedToggle options={viewModeOptions} value={viewMode} onChange={onViewModeChange} />
      </div>
    </div>
  );
}
