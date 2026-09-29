import type { ReactNode } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import { useBaseBranch, useGitHubPr, useGitStatus, useRecentCommits, useRepoMeta } from '../../hooks/use-repo-state';
import { commitRef, parseCommitRef } from '../../lib/api';
import { isOpenThread, useRepoThreads } from '../../hooks/use-repo-threads';
import { openComments } from '../../lib/ui-store';
import { EyeIcon } from '../ui/icon';
import { CheckCircleIcon, ChevronRightIcon, CommentIcon, FolderOpenIcon, GitBranchIcon, GitCommitIcon, GitCompareIcon, GitPullRequestIcon, PencilIcon } from '../ui/icon';

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

function Tile(props: { icon: ReactNode; eyebrow: string; title: string; detail?: ReactNode; onClick: () => void }) {
  const { icon, eyebrow, title, detail, onClick } = props;

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-start gap-2 min-w-0 p-3.5 rounded-lg border border-border bg-bg text-left hover:border-control-border hover:bg-bg-secondary transition-colors cursor-pointer"
    >
      <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <span className="flex items-center justify-center w-6 h-6 rounded-md bg-fill text-text-secondary">{icon}</span>
        {eyebrow}
      </span>
      <span className="w-full text-[13px] font-medium text-text line-clamp-2">{title}</span>
      {detail && <span className="w-full text-xs text-text-muted truncate">{detail}</span>}
    </button>
  );
}

function syncLabel(status: { upstream: string | null; ahead: number; behind: number } | undefined) {
  if (!status?.upstream) {
    return null;
  }
  if (status.ahead === 0 && status.behind === 0) {
    return `up to date with ${status.upstream}`;
  }
  const parts: string[] = [];
  if (status.ahead > 0) {
    parts.push(`${status.ahead} to push`);
  }
  if (status.behind > 0) {
    parts.push(`${status.behind} to pull`);
  }
  return parts.join(', ');
}

function CleanOverview(props: { branch: string | null }) {
  const { branch } = props;
  const nav = useRepoNav();
  const { details } = useGitHubPr();
  const { data: status } = useGitStatus();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const { data: recent, isLoading } = useRecentCommits(8);
  const { data: repoThreads } = useRepoThreads();
  const openThreads = (repoThreads ?? []).filter(isOpenThread);
  const showBranch = !details && base && branch && `origin/${branch}` !== base && branch !== base;
  const last = recent?.commits[0];
  const sync = syncLabel(status);

  return (
    <div className="flex-1 overflow-y-auto font-sans">
      <div className="max-w-[760px] mx-auto px-6 pt-12 pb-12">
        <h2 className="text-[18px] leading-6 font-semibold text-text">Everything is committed</h2>
        <p className="mt-1 text-[13px] text-text-secondary">
          {branch ? <>On <span className="font-mono text-xs text-text">{branch}</span>{sync ? `, ${sync}` : ''}. </> : null}
          New edits show up here as you make them.
        </p>

        <div className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-3">
          {last && (
            <Tile
              icon={<GitCommitIcon size="sm" />}
              eyebrow="Review last commit"
              title={last.message}
              detail={`${last.shortHash} · ${last.author} · ${last.relativeDate}`}
              onClick={() => nav.toDiff(commitRef(last.hash))}
            />
          )}
          {details && (
            <Tile
              icon={<GitPullRequestIcon size="sm" />}
              eyebrow={`Pull request #${details.prNumber}`}
              title={details.prTitle}
              detail={`${details.headRef ?? branch ?? ''} → ${details.baseRef}`}
              onClick={() => nav.toDiff(`origin/${details.baseRef}...HEAD`)}
            />
          )}
          {showBranch && base && (
            <Tile
              icon={<GitCompareIcon size="sm" />}
              eyebrow="Review this branch"
              title={`${branch} vs ${base.replace(/^origin\//, '')}`}
              detail="Every commit since the branches split"
              onClick={() => nav.toDiff(`${base}...HEAD`)}
            />
          )}
          {openThreads.length > 0 && (
            <Tile
              icon={<CommentIcon size="sm" />}
              eyebrow="Open comments"
              title={`${openThreads.length} comment${openThreads.length === 1 ? '' : 's'} still open`}
              detail="Across all views of this repository"
              onClick={openComments}
            />
          )}
          {!details && !showBranch && openThreads.length === 0 && (
            <Tile
              icon={<GitBranchIcon size="sm" />}
              eyebrow="Compare"
              title="Compare branches or commits"
              detail="Pick any two points in history"
              onClick={nav.toOverview}
            />
          )}
        </div>

        <section className="mt-8">
          <div className="flex items-center justify-between h-8">
            <h3 className="text-[13px] font-semibold text-text">Recent commits</h3>
            <button onClick={nav.toOverview} className="h-7 px-2 -mr-2 rounded-md text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer">
              All history
            </button>
          </div>
          <div className="mt-1 rounded-lg border border-border bg-bg p-1">
            {isLoading && <div className="h-9 px-2.5 flex items-center text-xs text-text-secondary">Loading commits…</div>}
            {recent && recent.commits.length === 0 && <div className="h-9 px-2.5 flex items-center text-xs text-text-secondary">No commits yet</div>}
            {recent?.commits.map((commit) => (
              <button
                key={commit.hash}
                onClick={() => nav.toDiff(commitRef(commit.hash))}
                title={`${commit.message}\n${commit.author} · ${commit.relativeDate}`}
                className="group flex items-center gap-3 w-full h-9 px-2.5 rounded-md text-left hover:bg-hover transition-colors cursor-pointer"
              >
                <code className="shrink-0 w-[56px] pt-px font-mono text-[11px] text-text-muted">{commit.shortHash}</code>
                <span className="min-w-0 flex-1 truncate text-[13px] text-text">{commit.message}</span>
                <span className="shrink-0 text-xs text-text-muted truncate max-w-[140px]">{commit.author}</span>
                <span className="shrink-0 w-[92px] text-right text-xs text-text-muted">{commit.relativeDate}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export function DiffEmptyState(props: DiffEmptyStateProps) {
  const { diffRef, branch, hideWhitespace, onShowWhitespace } = props;
  const nav = useRepoNav();
  const { data: meta } = useRepoMeta();
  const { data: status } = useGitStatus();
  const browseFiles = { label: 'Browse files', icon: <FolderOpenIcon className="w-3.5 h-3.5" />, onClick: () => nav.toTree() };
  const browseCommits = { label: 'Pick a commit or compare branches', icon: <GitBranchIcon className="w-3.5 h-3.5" />, onClick: nav.toOverview };

  if (hideWhitespace) {
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
