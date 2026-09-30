import { useGitHubPr, useGitStatus, useRepoMeta } from '../../hooks/use-repo-state';
import { BranchSwitcher } from '../../features/pr/branch-switcher';
import { GitSyncActions } from './git-sync-actions';
import { prDiffRef } from './ref-menu';
import { useRepoNav } from '../../hooks/use-repo';
import { StaleNotice } from './stale-notice';
import { shortPath } from '../../features/welcome/recent-repos';
import { OtherViewsNotice } from '../../features/comments/other-views-notice';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { toast } from 'sonner';
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener';
import { CopyIcon, EditorIcon, GitPullRequestIcon, RevealIcon, TerminalIcon } from '../ui/icon';
import { ContextMenu, MenuItem, MenuSeparator } from '../ui/popover';
import { useEditorName } from '../../hooks/use-editor-name';
import { errorMessage, openInEditor } from '../../lib/api';
import { Skeleton, useRevealClass } from '../ui/skeleton';

interface StatusBarProps {
  diffRef?: string;
  sessionId?: string | null;
  stale?: { onRefresh: () => void; message?: string } | null;
}

const itemClass = 'inline-flex items-center gap-1.5 h-5 px-1.5 rounded min-w-0';

function Tracking() {
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();

  if (!status || !meta) {
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

function RepoPathButton(props: { label: string; path: string }) {
  const { label, path } = props;
  const editor = useEditorName();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const reveal = () => {
    revealItemInDir(path).catch((error) => toast.error('Could not reveal the folder', { description: String(error) }));
  };
  const run = (action: () => void) => () => {
    setMenu(null);
    action();
  };

  return (
    <>
      <button
        onClick={reveal}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
        }}
        className="hidden lg:inline-flex items-center h-5 min-w-0 px-1.5 rounded font-mono text-[11px] text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer"
        title={`${path}\nReveal in Finder (right-click for more)`}
      >
        <span className="truncate">{label}</span>
      </button>
      <ContextMenu position={menu} onClose={() => setMenu(null)}>
        <MenuItem icon={<RevealIcon size="sm" />} label="Reveal in Finder" onSelect={run(reveal)} />
        <MenuItem
          icon={<TerminalIcon size="sm" />}
          label="Open in Terminal"
          onSelect={run(() => {
            openPath(path, 'Terminal').catch((error) => toast.error('Could not open Terminal', { description: String(error) }));
          })}
        />
        <MenuItem
          icon={<EditorIcon size="sm" />}
          label={`Open in ${editor}`}
          onSelect={run(() => {
            openInEditor('').catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }));
          })}
        />
        <MenuSeparator />
        <MenuItem
          icon={<CopyIcon size="sm" />}
          label="Copy path"
          onSelect={run(() => {
            void navigator.clipboard.writeText(path);
            toast.success('Path copied');
          })}
        />
      </ContextMenu>
    </>
  );
}

export function StatusBar(props: StatusBarProps) {
  const { diffRef, sessionId, stale } = props;
  const nav = useRepoNav();
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();
  const { details, loading: prLoading } = useGitHubPr();
  const prReveal = useRevealClass(prLoading);
  const branch = status?.branch ?? meta?.branch ?? null;
  const fullPath = meta?.path ?? nav.repoPath;
  const path = shortPath(fullPath);
  const loading = !status || !meta;
  const reveal = useRevealClass(loading);

  return (
    <div data-tauri-drag-region className="group/status flex items-center gap-1.5 h-8 shrink-0 pl-1.5 pr-2.5 bg-frame text-xs text-text-secondary font-sans select-none">
      {loading ? (
        <span aria-busy className="flex items-center gap-1.5">
          <span className={itemClass}><Skeleton className="w-24 h-2.5" /></span>
          <span className={itemClass}><Skeleton className="w-28 h-2.5" /></span>
          <Skeleton className="w-[168px] h-6 rounded-md" />
        </span>
      ) : (
        <span className={cn('flex items-center gap-1.5 min-w-0', reveal)}>
          <BranchSwitcher branch={branch} className={`${itemClass} text-text-secondary`} />
          <span className={itemClass}>
            <Tracking />
          </span>
          <GitSyncActions />
        </span>
      )}
      {stale && <StaleNotice onRefresh={stale.onRefresh} message={stale.message} />}
      {sessionId && <OtherViewsNotice sessionId={sessionId} />}
      <span className="flex-1" />
      {details && diffRef !== prDiffRef(details) && (
        <button
          onClick={() => nav.toDiff(prDiffRef(details))}
          className={`${itemClass} hover:bg-hover hover:text-text cursor-pointer ${prReveal}`}
          title={`Review pull request #${details.prNumber}: ${details.prTitle}`}
        >
          <GitPullRequestIcon className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[280px]">
            <span className="tabular-nums">#{details.prNumber}</span> {details.prTitle}
          </span>
        </button>
      )}
      <RepoPathButton label={path} path={fullPath} />
    </div>
  );
}
