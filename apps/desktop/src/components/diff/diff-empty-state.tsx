import type { ReactNode } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import { useBaseBranch, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { commitRef, parseCommitRef } from '../../lib/api';
import { CheckCircleIcon } from '../icons/check-circle-icon';
import { ChevronRightIcon } from '../icons/chevron-right-icon';
import { FolderOpenIcon } from '../icons/folder-open-icon';
import { GitCommitIcon } from '../icons/git-commit-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { GitCompareIcon } from '../icons/git-compare-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { PencilIcon } from '../icons/pencil-icon';

interface DiffEmptyStateProps {
  diffRef: string;
  branch: string | null;
  hideWhitespace: boolean;
}

interface Action {
  label: string;
  detail?: string;
  icon?: ReactNode;
  onClick: () => void;
}

function Shell(props: { title: string; message: ReactNode; actions: Action[] }) {
  const { title, message, actions } = props;

  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-[14vh] pb-10 font-sans">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-added [&_svg]:w-4 [&_svg]:h-4">
            <CheckCircleIcon />
          </span>
          <h2 className="text-sm font-medium text-text">{title}</h2>
        </div>
        <p className="text-xs text-text-muted leading-relaxed pl-6">{message}</p>
        {actions.length > 0 && (
          <div className="mt-4 rounded-md border border-border p-1">
            {actions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="group flex items-center gap-2 w-full h-8 px-2 rounded text-left text-xs hover:bg-hover transition-colors cursor-pointer min-w-0"
              >
                <span className="w-4 flex justify-center text-text-muted group-hover:text-text shrink-0">{action.icon}</span>
                <span className="text-text shrink-0">{action.label}</span>
                {action.detail && <span className="text-text-muted truncate min-w-0">{action.detail}</span>}
                <ChevronRightIcon className="w-3 h-3 ml-auto text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function DiffEmptyState(props: DiffEmptyStateProps) {
  const { diffRef, branch, hideWhitespace } = props;
  const nav = useRepoNav();
  const { data: meta } = useRepoMeta();
  const { data: status } = useGitStatus();
  const { details } = useGitHubPr();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const { data: recent } = useRecentCommits(6);
  const lastCommit = recent?.commits[0] ?? null;
  const browseFiles = { label: 'Browse files', icon: <FolderOpenIcon className="w-3.5 h-3.5" />, onClick: () => nav.toTree() };
  const browseCommits = { label: 'Pick a commit or compare branches', icon: <GitBranchIcon className="w-3.5 h-3.5" />, onClick: nav.toOverview };

  if (hideWhitespace) {
    return (
      <Shell
        title="Only whitespace changed"
        message="Every change here is whitespace. Turn “Hide whitespace” off in the bar above to see them."
        actions={[]}
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
    const actions: Action[] = [];
    if (details) {
      actions.push({ label: `Pull request #${details.prNumber}`, detail: details.prTitle, icon: <GitPullRequestIcon className="w-3.5 h-3.5 text-added" />, onClick: () => nav.toDiff(`origin/${details.baseRef}...HEAD`) });
    }
    if (!details && base && branch && `origin/${branch}` !== base && branch !== base) {
      actions.push({ label: `${branch} vs ${base.replace(/^origin\//, '')}`, detail: 'this branch', icon: <GitCompareIcon className="w-3.5 h-3.5" />, onClick: () => nav.toDiff(`${base}...HEAD`) });
    }
    if (lastCommit) {
      actions.push({ label: 'Last commit', detail: `${lastCommit.shortHash} ${lastCommit.message}`, icon: <GitCommitIcon className="w-3.5 h-3.5" />, onClick: () => nav.toDiff(commitRef(lastCommit.hash)) });
    }
    actions.push(browseCommits, browseFiles);
    return (
      <Shell
        title="No uncommitted changes"
        message="Edit files and they show up here as you work. Or review something already committed:"
        actions={actions}
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
