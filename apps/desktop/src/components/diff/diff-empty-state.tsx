import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { diffOptions } from '../../queries/diff';
import { useRepoNav } from '../../hooks/use-repo';
import { useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { commitRef, parseCommitRef } from '../../lib/api';
import { EyeIcon } from '../ui/icon';
import { CheckCircleIcon, ChevronRightIcon, FolderOpenIcon, GitBranchIcon, GitCommitIcon, HomeIcon, PencilIcon } from '../ui/icon';

interface DiffEmptyStateProps {
  diffRef: string;
  branch: string | null;
  hideWhitespace: boolean;
  onShowWhitespace: () => void;
}

interface Action {
  label: string;
  detail?: string;
  icon?: ReactNode;
  onClick: () => void;
}

function EmptyIcon(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <span className="flex items-center justify-center w-10 h-10 rounded-full bg-fill text-text-secondary shrink-0 [&_svg]:w-[18px] [&_svg]:h-[18px]">
      {children}
    </span>
  );
}

function ActionRow(props: { action: Action }) {
  const { action } = props;

  return (
    <button
      onClick={action.onClick}
      className="group flex items-center gap-2.5 w-full h-9 px-2.5 rounded-md text-left text-[13px] hover:bg-hover transition-colors cursor-pointer min-w-0"
    >
      <span className="w-4 flex justify-center text-text-secondary shrink-0">{action.icon}</span>
      <span className="text-text shrink-0 max-w-[65%] truncate">{action.label}</span>
      {action.detail && <span className="text-text-secondary truncate min-w-0">{action.detail}</span>}
      <ChevronRightIcon className="w-3 h-3 ml-auto text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
    </button>
  );
}

function Shell(props: { title: string; message: ReactNode; actions: Action[]; icon?: ReactNode }) {
  const { title, message, actions, icon } = props;

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-[12vh] pb-10 font-sans">
      <div className="w-full max-w-md flex flex-col items-center text-center">
        <EmptyIcon>{icon ?? <CheckCircleIcon />}</EmptyIcon>
        <h2 className="mt-3 text-[15px] font-semibold text-text">{title}</h2>
        <p className="mt-1 text-[13px] text-text-secondary leading-relaxed">{message}</p>
      </div>
      {actions.length > 0 && (
        <div className="mt-6 w-full max-w-md rounded-lg border border-border p-1">
          {actions.map((action) => <ActionRow key={action.label} action={action} />)}
        </div>
      )}
    </div>
  );
}

export function DiffEmptyState(props: DiffEmptyStateProps) {
  const { diffRef, branch, hideWhitespace, onShowWhitespace } = props;
  const nav = useRepoNav();
  const { data: meta } = useRepoMeta();
  const { data: status } = useGitStatus();
  const { data: recent } = useRecentCommits(1);
  const last = recent?.commits[0] ?? null;
  const unfiltered = useQuery({ ...diffOptions(false, diffRef), enabled: hideWhitespace });
  const browseFiles = { label: 'Browse files', icon: <FolderOpenIcon className="w-3.5 h-3.5" />, onClick: () => nav.toTree() };
  const browseCommits = { label: 'Pick a commit or compare branches', icon: <GitBranchIcon className="w-3.5 h-3.5" />, onClick: nav.toOverview };

  if (hideWhitespace && unfiltered.isLoading) {
    return null;
  }

  if (hideWhitespace && (unfiltered.data?.files.length ?? 0) > 0) {
    return (
      <Shell
        title="Only whitespace changed"
        message="Every change here only touches whitespace, and whitespace changes are hidden."
        actions={[{ label: 'Show whitespace changes', icon: <EyeIcon size="sm" />, onClick: onShowWhitespace }]}
      />
    );
  }

  if (meta && !meta.headSha && diffRef === 'work') {
    return (
      <Shell
        title="Nothing here yet"
        message="This repository has no commits and no files. Add some files and they show up here, ready for review."
        actions={[browseFiles]}
      />
    );
  }

  if (diffRef === 'staged') {
    const other = status ? status.unstaged + status.untracked : 0;
    return (
      <Shell
        title="Nothing is staged"
        message={other > 0 ? `You have ${other} unstaged or new file${other === 1 ? '' : 's'}. Stage with git add, or review everything that is uncommitted.` : 'Stage files with git add and they show up here.'}
        actions={[{ label: 'Review all uncommitted changes', icon: <PencilIcon className="w-3.5 h-3.5" />, onClick: () => nav.toDiff('work') }, browseCommits]}
      />
    );
  }

  if (diffRef === 'unstaged') {
    return (
      <Shell
        title="No unstaged changes"
        message={status && status.staged > 0 ? 'Everything you changed is already staged.' : 'Your working tree matches the index.'}
        actions={[{ label: 'Review all uncommitted changes', icon: <PencilIcon className="w-3.5 h-3.5" />, onClick: () => nav.toDiff('work') }, browseCommits]}
      />
    );
  }

  if (diffRef === 'work' || diffRef === '.') {
    return (
      <Shell
        title="No uncommitted changes"
        message={branch ? <>Everything on <span className="font-mono text-xs">{branch}</span> is committed. New edits show up here as you make them.</> : 'Everything is committed. New edits show up here as you make them.'}
        actions={[
          { label: 'Go to Home', detail: 'what to review next', icon: <HomeIcon size="sm" />, onClick: nav.toOverview },
          ...(last ? [{ label: 'Review last commit', detail: last.message, icon: <GitCommitIcon size="sm" />, onClick: () => nav.toDiff(commitRef(last.hash)) }] : []),
          browseFiles,
        ]}
      />
    );
  }

  if (parseCommitRef(diffRef)) {
    return <Shell title="This commit changes no files" message="It may be an empty or merge commit." actions={[browseCommits]} />;
  }

  return (
    <Shell
      title="No differences"
      message={`Nothing differs for ${diffRef}.`}
      actions={[{ label: 'Review uncommitted changes', icon: <PencilIcon className="w-3.5 h-3.5" />, onClick: () => nav.toDiff('work') }, browseCommits]}
    />
  );
}
