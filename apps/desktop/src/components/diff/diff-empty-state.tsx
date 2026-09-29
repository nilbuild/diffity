import type { ReactNode } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import { useBaseBranch, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { commitRef, parseCommitRef } from '../../lib/api';
import { CheckCircleIcon } from '../icons/check-circle-icon';

interface DiffEmptyStateProps {
  diffRef: string;
  branch: string | null;
  hideWhitespace: boolean;
}

const primaryClass = 'px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer';
const secondaryClass = 'px-3 py-1.5 text-xs font-medium rounded-md bg-bg-tertiary text-text-secondary hover:bg-hover hover:text-text transition-colors cursor-pointer';

interface Action {
  label: string;
  onClick: () => void;
}

function Shell(props: { title: string; message: ReactNode; actions: Action[] }) {
  const { title, message, actions } = props;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center font-sans">
      <div className="text-added opacity-40 mb-1">
        <CheckCircleIcon />
      </div>
      <h2 className="text-base font-medium text-text-secondary">{title}</h2>
      <p className="text-xs text-text-muted max-w-md leading-relaxed">{message}</p>
      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions.map((action, index) => (
            <button key={action.label} onClick={action.onClick} className={index === 0 ? primaryClass : secondaryClass}>
              {action.label}
            </button>
          ))}
        </div>
      )}
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
  const browseFiles = { label: 'Browse files', onClick: () => nav.toTree() };
  const browseCommits = { label: 'Browse commits', onClick: nav.toOverview };

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
        actions={[{ label: 'Review all uncommitted changes', onClick: () => nav.toDiff('work') }, browseCommits]}
      />
    );
  }

  if (diffRef === 'unstaged') {
    return (
      <Shell
        title="No unstaged changes"
        message={status && status.staged > 0 ? 'Everything you changed is already staged.' : 'Your working tree matches the index.'}
        actions={[{ label: 'Review all uncommitted changes', onClick: () => nav.toDiff('work') }, browseCommits]}
      />
    );
  }

  if (diffRef === 'work' || diffRef === '.') {
    const actions: Action[] = [];
    if (details) {
      actions.push({ label: `Review pull request #${details.prNumber}`, onClick: () => nav.toDiff(`origin/${details.baseRef}...HEAD`) });
    }
    if (lastCommit) {
      actions.push({ label: `Review last commit (${lastCommit.shortHash})`, onClick: () => nav.toDiff(commitRef(lastCommit.hash)) });
    }
    if (!details && base && branch && `origin/${branch}` !== base && branch !== base) {
      actions.push({ label: `Review ${branch} vs ${base.replace(/^origin\//, '')}`, onClick: () => nav.toDiff(`${base}...HEAD`) });
    }
    actions.push(browseCommits, browseFiles);
    return (
      <Shell
        title="No uncommitted changes"
        message="Your working tree matches the last commit. Edit files and they appear here automatically, or review something already committed."
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
      actions={[{ label: 'Review uncommitted changes', onClick: () => nav.toDiff('work') }, browseCommits]}
    />
  );
}
