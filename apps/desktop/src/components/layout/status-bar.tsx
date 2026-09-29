import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGitHubPr, useGitStatus, useRepoMeta } from '../../hooks/use-repo-state';
import { BranchSwitcher } from '../../features/pr/branch-switcher';
import { GitHubIcon } from '../icons/github-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { GitSyncActions } from './git-sync-actions';
import { GitHubDialog } from './github-dialog';
import { StaleNotice } from './stale-notice';
import { OtherViewsNotice } from '../../features/comments/other-views-notice';

interface StatusBarProps {
  diffRef?: string;
  sessionId?: string | null;
  stale?: { onRefresh: () => void; message?: string } | null;
}

const itemClass = 'inline-flex items-center gap-1.5 h-5 px-1.5 rounded min-w-0';

function Tracking() {
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();

  if (!status) {
    return null;
  }
  if (!status.branch) {
    return <span className="text-modified">Detached HEAD</span>;
  }
  if (!meta?.remoteUrl) {
    return <span>Local only</span>;
  }
  if (!status.upstream) {
    return <span>Not published</span>;
  }
  return (
    <span className="truncate font-mono text-[11px] text-text-muted" title={`Tracking ${status.upstream}`}>
      {status.upstream}
    </span>
  );
}

export function StatusBar(props: StatusBarProps) {
  const { diffRef, sessionId, stale } = props;
  const queryClient = useQueryClient();
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();
  const { details, hasRemote } = useGitHubPr();
  const [showGitHub, setShowGitHub] = useState(false);
  const branch = status?.branch ?? meta?.branch ?? null;
  const path = meta?.path.replace(/^\/Users\/[^/]+/, '~');

  return (
    <div className="flex items-center gap-1.5 h-7 shrink-0 px-2.5 border-t border-border-muted bg-bg-secondary text-xs text-text-secondary font-sans select-none">
      {(branch || status) && <BranchSwitcher branch={branch} className={`${itemClass} text-text-secondary`} />}
      <span className={itemClass}>
        <Tracking />
      </span>
      <GitSyncActions />
      {stale && <StaleNotice onRefresh={stale.onRefresh} message={stale.message} />}
      {sessionId && <OtherViewsNotice sessionId={sessionId} />}
      <span className="flex-1" />
      {path && <span className="truncate font-mono text-[11px] text-text-muted hidden lg:inline min-w-0 px-1.5" title={meta?.path}>{path}</span>}
      {hasRemote && (
        <button
          onClick={() => setShowGitHub(true)}
          className={`${itemClass} hover:bg-hover hover:text-text cursor-pointer`}
          title={details ? `Pull request #${details.prNumber}: ${details.prTitle}` : 'GitHub: sign in, push and pull PR comments'}
        >
          {details ? <GitPullRequestIcon className="w-3 h-3 text-added shrink-0" /> : <GitHubIcon className="w-3 h-3 shrink-0" />}
          {details ? (
            <span className="truncate max-w-[280px]">
              <span className="font-mono">#{details.prNumber}</span> {details.prTitle}
            </span>
          ) : (
            'GitHub'
          )}
        </button>
      )}
      {showGitHub && (
        <GitHubDialog
          details={details}
          currentRef={diffRef}
          onPulled={() => queryClient.invalidateQueries({ queryKey: ['threads'] })}
          onClose={() => setShowGitHub(false)}
        />
      )}
    </div>
  );
}
