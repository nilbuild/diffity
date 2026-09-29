import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router';
import { diffOptions } from '../../queries/diff';
import { repoBase, useRepoNav } from '../../hooks/use-repo';
import { getFilePath } from '../../lib/diff-utils';
import { cn } from '../../lib/cn';
import type { Commit } from '../../lib/api';
import { buttonOutline, buttonPrimary } from '../ui/button-styles';
import { StatusLetter } from '../tree/file-tree-item';
import { DiffStats } from '../diff/diff-stats';
import { AuthorAvatar } from './commit-list';
import { useCopy } from '../../hooks/use-copy';
import { CheckIcon, CopyIcon, GitCompareIcon } from '../ui/icon';

export interface HistoryTarget {
  ref: string;
  title: string;
  icon: ReactNode;
  commit?: Commit;
  meta?: ReactNode;
}

function FileList(props: { diffRef: string }) {
  const { diffRef } = props;
  const navigate = useNavigate();
  const nav = useRepoNav();
  const { data, isLoading, error } = useQuery(diffOptions(false, diffRef));

  if (isLoading) {
    return (
      <div className="space-y-2 px-2 py-2">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-4 rounded bg-fill animate-pulse" style={{ width: `${40 + ((index * 17) % 45)}%` }} />
        ))}
      </div>
    );
  }
  if (error || !data) {
    return <p className="px-2 py-3 text-[13px] text-text-secondary">Could not load the changed files.</p>;
  }
  if (data.files.length === 0) {
    return <p className="px-2 py-3 text-[13px] text-text-secondary">No files changed.</p>;
  }
  return (
    <ul>
      {data.files.map((file) => {
        const path = getFilePath(file);
        const slash = path.lastIndexOf('/');
        return (
          <li key={path}>
            <button
              onClick={() => navigate(`${repoBase(nav.repoPath)}/diff?${new URLSearchParams({ ref: diffRef, file: path }).toString()}`)}
              className="flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-left hover:bg-hover transition-colors cursor-pointer"
              title={`Review ${path}`}
            >
              <StatusLetter status={file.status} />
              <span className="min-w-0 flex-1 flex items-baseline gap-1.5 overflow-hidden">
                <span className="shrink-0 max-w-full truncate text-[13px] text-text">{path.slice(slash + 1)}</span>
                {slash > 0 && <span className="min-w-0 truncate text-xs text-text-muted" dir="rtl"><bdi>{path.slice(0, slash)}</bdi></span>}
              </span>
              <DiffStats additions={file.additions} deletions={file.deletions} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function HistoryDetail(props: { target: HistoryTarget | null; onOpen: (ref: string) => void }) {
  const { target, onOpen } = props;
  const { copied, copy } = useCopy();

  if (!target) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-text-secondary">
        Select a commit to see what it changed
      </div>
    );
  }

  const commit = target.commit;

  return (
    <div className="max-w-[860px] px-8 pt-6 pb-10">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-full bg-fill text-text-secondary shrink-0">{target.icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-6 text-text break-words">{target.title}</h2>
          {commit ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary">
              <AuthorAvatar name={commit.author} />
              <span>{commit.author}</span>
              <span className="text-text-muted">·</span>
              <span title={dayjs(commit.date).format('YYYY-MM-DD HH:mm')}>{dayjs(commit.date).format('MMM D, YYYY [at] HH:mm')}</span>
              <span className="text-text-muted">·</span>
              <button
                onClick={() => copy(commit.hash)}
                className="inline-flex items-center gap-1 font-mono text-[11px] text-text-secondary hover:text-text cursor-pointer"
                title="Copy full commit hash"
              >
                {commit.shortHash}
                {copied ? <CheckIcon className="w-3 h-3 text-added" /> : <CopyIcon className="w-3 h-3" />}
              </button>
            </div>
          ) : (
            target.meta && <div className="mt-1 text-xs text-text-secondary">{target.meta}</div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <button onClick={() => onOpen(target.ref)} className={buttonPrimary}>
          Review {commit ? 'commit' : 'changes'}
        </button>
        {commit && (
          <button onClick={() => onOpen(`${commit.hash}..HEAD`)} className={buttonOutline} title="Review every change made after this commit, up to HEAD">
            <GitCompareIcon className="w-3.5 h-3.5 text-text-secondary" />
            Changes since
          </button>
        )}
        {commit && (commit.additions > 0 || commit.deletions > 0) && (
          <span className={cn('ml-auto text-xs text-text-secondary')}>
            {commit.filesChanged} file{commit.filesChanged === 1 ? '' : 's'} · <DiffStats additions={commit.additions} deletions={commit.deletions} />
          </span>
        )}
      </div>

      <div className="mt-6">
        <h3 className="px-2 mb-1 text-xs font-medium text-text-secondary">Changed files</h3>
        <div className="rounded-lg border border-border p-1">
          <FileList diffRef={target.ref} />
        </div>
      </div>
    </div>
  );
}
