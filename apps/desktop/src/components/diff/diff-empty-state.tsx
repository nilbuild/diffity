import type { ReactNode } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import { useBaseBranch, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { commitRef, parseCommitRef } from '../../lib/api';
import { CheckCircleIcon } from '../icons/check-circle-icon';
import { ChevronRightIcon } from '../icons/chevron-right-icon';
import { FolderOpenIcon } from '../icons/folder-open-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { GitCompareIcon } from '../icons/git-compare-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { PencilIcon } from '../icons/pencil-icon';
import { CommentIcon } from '../icons/comment-icon';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openComments } from '../../lib/ui-store';

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

function Card(props: { title: string; action?: ReactNode; children: ReactNode }) {
  const { title, action, children } = props;

  return (
    <section className="rounded-lg border border-border bg-bg overflow-hidden">
      <div className="flex items-center justify-between h-10 px-3.5 bg-bg-secondary border-b border-border-muted">
        <h3 className="text-[13px] font-medium text-text">{title}</h3>
        {action}
      </div>
      <div className="p-1">{children}</div>
    </section>
  );
}

function CleanOverview(props: { branch: string | null }) {
  const { branch } = props;
  const nav = useRepoNav();
  const { details } = useGitHubPr();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const { data: recent, isLoading } = useRecentCommits(8);
  const { data: repoThreads } = useRepoThreads();
  const openThreads = (repoThreads ?? []).filter(isOpenThread);
  const views = new Map<string, { label: string; count: number }>();
  for (const thread of openThreads) {
    const view = views.get(thread.ref) ?? { label: thread.refLabel, count: 0 };
    view.count += 1;
    views.set(thread.ref, view);
  }
  const showBranch = !details && base && branch && `origin/${branch}` !== base && branch !== base;

  return (
    <div className="flex-1 overflow-y-auto font-sans">
      <div className="max-w-[960px] mx-auto px-6 pt-10 pb-12">
        <div className="flex items-center gap-3.5">
          <EmptyIcon>
            <CheckCircleIcon />
          </EmptyIcon>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text">No uncommitted changes</h2>
            <p className="text-[13px] text-text-secondary">
              {branch ? <>Working tree on <span className="font-mono text-xs">{branch}</span> is clean. </> : 'Working tree is clean. '}
              Edit files and they show up here, or review something already committed.
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-4 items-start">
          <Card
            title="Recent commits"
            action={
              <button onClick={nav.toOverview} className="h-6 px-2 -mr-1.5 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer">
                All history
              </button>
            }
          >
            {isLoading && <div className="h-9 px-2.5 flex items-center text-xs text-text-secondary">Loading commits…</div>}
            {recent && recent.commits.length === 0 && <div className="h-9 px-2.5 flex items-center text-xs text-text-secondary">No commits yet</div>}
            {recent?.commits.map((commit) => (
              <button
                key={commit.hash}
                onClick={() => nav.toDiff(commitRef(commit.hash))}
                title={`${commit.message}\n${commit.author} · ${commit.relativeDate}`}
                className="flex items-center gap-2.5 w-full h-9 px-2.5 rounded-md text-left hover:bg-hover transition-colors cursor-pointer"
              >
                <code className="shrink-0 w-[52px] font-mono text-[11px] text-text-muted">{commit.shortHash}</code>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{commit.message}</span>
                <span className="shrink-0 text-xs text-text-muted">{commit.relativeDate}</span>
              </button>
            ))}
          </Card>

          <div className="flex flex-col gap-4">
            {(details || showBranch) && (
              <Card title={details ? 'Pull request' : 'This branch'}>
                {details && (
                  <ActionRow
                    action={{
                      label: `#${details.prNumber}`,
                      detail: details.prTitle,
                      icon: <GitPullRequestIcon className="w-3.5 h-3.5" />,
                      onClick: () => nav.toDiff(`origin/${details.baseRef}...HEAD`),
                    }}
                  />
                )}
                {showBranch && base && (
                  <ActionRow
                    action={{
                      label: `${branch} vs ${base.replace(/^origin\//, '')}`,
                      detail: 'every commit on this branch',
                      icon: <GitCompareIcon className="w-3.5 h-3.5" />,
                      onClick: () => nav.toDiff(`${base}...HEAD`),
                    }}
                  />
                )}
              </Card>
            )}
            {views.size > 0 && (
              <Card
                title={`Open comments · ${openThreads.length}`}
                action={
                  <button onClick={openComments} className="h-6 px-2 -mr-1.5 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer">
                    Show all
                  </button>
                }
              >
                {[...views.entries()].slice(0, 5).map(([ref, view]) => (
                  <ActionRow
                    key={ref}
                    action={{
                      label: view.label,
                      detail: `${view.count}`,
                      icon: <CommentIcon className="w-3.5 h-3.5" />,
                      onClick: () => nav.toDiff(ref),
                    }}
                  />
                ))}
              </Card>
            )}
            <Card title="Quick actions">
              <ActionRow action={{ label: 'Compare branches or commits', icon: <GitBranchIcon className="w-3.5 h-3.5" />, onClick: nav.toOverview }} />
              <ActionRow action={{ label: 'Browse files', icon: <FolderOpenIcon className="w-3.5 h-3.5" />, onClick: () => nav.toTree() }} />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiffEmptyState(props: DiffEmptyStateProps) {
  const { diffRef, branch, hideWhitespace } = props;
  const nav = useRepoNav();
  const { data: meta } = useRepoMeta();
  const { data: status } = useGitStatus();
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
    return <CleanOverview branch={branch} />;
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
