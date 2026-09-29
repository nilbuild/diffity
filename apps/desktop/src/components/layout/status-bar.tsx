import { useGitHubPr, useGitStatus, useRepoMeta } from '../../hooks/use-repo-state';
import { BranchSwitcher } from '../../features/pr/branch-switcher';
import { GitSyncActions } from './git-sync-actions';
import { prDiffRef } from './ref-menu';
import { useRepoNav } from '../../hooks/use-repo';
import { StaleNotice } from './stale-notice';
import { shortPath } from '../../features/welcome/recent-repos';
import { OtherViewsNotice } from '../../features/comments/other-views-notice';
import { GitPullRequestIcon } from '../ui/icon';

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
    return null;
  }
  return (
    <span className="truncate font-mono text-[11px] text-text-muted" title={`Tracking ${status.upstream}`}>
      {status.upstream}
    </span>
  );
}

export function StatusBar(props: StatusBarProps) {
  const { sessionId, stale } = props;
  const nav = useRepoNav();
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();
  const { details } = useGitHubPr();
  const branch = status?.branch ?? meta?.branch ?? null;
  const path = meta?.path ? shortPath(meta.path) : null;

  return (
    <div data-tauri-drag-region className="flex items-center gap-1.5 h-8 shrink-0 pl-1.5 pr-2.5 bg-frame text-xs text-text-secondary font-sans select-none">
      {(branch || status) && <BranchSwitcher branch={branch} className={`${itemClass} text-text-secondary`} />}
      <span className={itemClass}>
        <Tracking />
      </span>
      <GitSyncActions />
      {stale && <StaleNotice onRefresh={stale.onRefresh} message={stale.message} />}
      {sessionId && <OtherViewsNotice sessionId={sessionId} />}
      <span className="flex-1" />
      {path && <span className="truncate font-mono text-[11px] text-text-muted hidden lg:inline min-w-0 px-1.5" title={meta?.path}>{path}</span>}
      {details && (
        <button
          onClick={() => nav.toDiff(prDiffRef(details))}
          className={`${itemClass} hover:bg-hover hover:text-text cursor-pointer`}
          title={`Review pull request #${details.prNumber}: ${details.prTitle}`}
        >
          <GitPullRequestIcon className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[280px]">
            <span className="tabular-nums">#{details.prNumber}</span> {details.prTitle}
          </span>
        </button>
      )}
    </div>
  );
}
