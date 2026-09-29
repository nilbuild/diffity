import { useEffect, useState, type ReactNode } from 'react';
import { useOverview } from '../../hooks/use-overview';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useRepoNav } from '../../hooks/use-repo';
import {
  useBaseBranch,
  useBranches,
  useGitHubAuth,
  useGitHubPr,
  useGitStatus,
  useRecentCommits,
  useRepoMeta,
} from '../../hooks/use-repo-state';
import { OverviewFileList } from './overview-file-list';
import { CommitList } from './commit-list';
import { CheckCircleIcon } from '../icons/check-circle-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { GitCommitIcon } from '../icons/git-commit-icon';
import { GitCompareIcon } from '../icons/git-compare-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { PencilIcon } from '../icons/pencil-icon';
import { FolderOpenIcon } from '../icons/folder-open-icon';
import { GitHubIcon } from '../icons/github-icon';
import { ExternalLinkIcon } from '../icons/external-link-icon';
import { AlertCircleIcon } from '../icons/alert-circle-icon';
import { hideStaticSplash } from './skeleton';
import { TitleBar } from './title-bar';
import { PageSwitcher } from './page-switcher';
import { GitSyncActions } from './git-sync-actions';
import { OptionsMenu } from './options-menu';
import { CommentsButton } from '../../features/comments/comments-button';
import { commitRef, parseGitHubRemote } from '../../lib/api';
import { openSettings } from '../../lib/ui-store';
import { prDiffRef } from './ref-menu';

interface DashboardProps {
  onNavigate: (ref: string) => void;
}

const cardClass = 'border border-border rounded-lg bg-bg-secondary overflow-hidden';

function Card(props: { title: ReactNode; action?: ReactNode; children: ReactNode; id?: string }) {
  const { title, action, children, id } = props;

  return (
    <div id={id} className={cardClass}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <h3 className="font-medium text-text text-sm">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

interface TargetProps {
  icon: ReactNode;
  title: string;
  detail: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}

function Target(props: TargetProps) {
  const { icon, title, detail, disabled, onClick } = props;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 text-left p-3 rounded-lg border border-border bg-bg hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-bg min-w-0"
    >
      <span className="mt-0.5 text-accent shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{title}</span>
        <span className="block text-xs text-text-muted mt-0.5 line-clamp-2 break-words">{detail}</span>
      </span>
    </button>
  );
}

function StatusCard() {
  const { data: status } = useGitStatus();
  const { data: meta } = useRepoMeta();
  const { details } = useGitHubPr();
  const { data: auth } = useGitHubAuth();
  const remote = parseGitHubRemote(meta?.remoteUrl ?? null);

  const renderTracking = () => {
    if (!status) {
      return <span className="inline-block w-40 h-3 rounded bg-bg-tertiary animate-pulse" />;
    }
    if (!status.branch) {
      return <span className="text-modified">Detached HEAD — you are not on a branch</span>;
    }
    if (!meta?.remoteUrl) {
      return <span>No remote configured — local only</span>;
    }
    if (!status.upstream) {
      return <span>No upstream branch — Push (↑) in the toolbar publishes it</span>;
    }
    const parts = [`tracking ${status.upstream}`];
    if (status.ahead === 0 && status.behind === 0) {
      parts.push('up to date');
    }
    if (status.ahead > 0) {
      parts.push(`${status.ahead} to push`);
    }
    if (status.behind > 0) {
      parts.push(`${status.behind} to pull`);
    }
    return <span>{parts.join(' · ')}</span>;
  };

  const renderPr = () => {
    if (!remote) {
      return null;
    }
    if (details) {
      return (
        <a href={details.prUrl} className="inline-flex items-center gap-1.5 text-text-secondary hover:text-accent min-w-0">
          <GitPullRequestIcon className="w-3.5 h-3.5 text-added shrink-0" />
          <span className="truncate">
            #{details.prNumber} {details.prTitle}
          </span>
          <ExternalLinkIcon className="w-3 h-3 shrink-0" />
        </a>
      );
    }
    if (auth && !auth.authenticated) {
      return (
        <button onClick={openSettings} className="inline-flex items-center gap-1.5 text-text-muted hover:text-accent cursor-pointer">
          <GitHubIcon className="w-3.5 h-3.5" />
          Sign in to GitHub to see pull requests
        </button>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-text-muted">
        <GitHubIcon className="w-3.5 h-3.5" />
        {remote.owner}/{remote.repo} · no open pull request for this branch
      </span>
    );
  };

  return (
    <div className={`${cardClass} px-4 py-3 space-y-1.5`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base font-semibold text-text shrink-0">{meta?.name}</span>
        {status?.branch && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-diff-hunk-bg text-diff-hunk-text rounded font-mono text-[11px] shrink-0">
            <GitBranchIcon className="w-3 h-3" />
            {status.branch}
          </span>
        )}
        <span className="ml-auto min-w-0 text-xs text-text-muted font-mono truncate" title={meta?.path}>
          {meta?.path.replace(/^\/Users\/[^/]+/, '~')}
        </span>
      </div>
      <div className="text-xs text-text-muted">{renderTracking()}</div>
      <div className="text-xs">{renderPr()}</div>
    </div>
  );
}

function CompareCard(props: { onNavigate: (ref: string) => void; defaultBase: string | null }) {
  const { onNavigate, defaultBase } = props;
  const { data: branches } = useBranches();
  const [base, setBase] = useState('');
  const [head, setHead] = useState('HEAD');
  const effectiveBase = base.trim() || defaultBase || '';

  return (
    <Card title="Compare two refs" id="compare">
      <form
        className="px-4 py-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!effectiveBase) {
            return;
          }
          onNavigate(`${effectiveBase}...${head.trim() || 'HEAD'}`);
        }}
      >
        <div className="flex items-center gap-2">
          <input
            type="text"
            list="diffity-branches"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder={defaultBase ? `base (${defaultBase})` : 'base: branch, tag or commit'}
            className="flex-1 min-w-0 text-sm font-mono bg-bg border border-border rounded-md px-3 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <span className="text-text-muted text-xs font-mono">...</span>
          <input
            type="text"
            list="diffity-branches"
            value={head}
            onChange={(e) => setHead(e.target.value)}
            placeholder="head"
            className="flex-1 min-w-0 text-sm font-mono bg-bg border border-border rounded-md px-3 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!effectiveBase}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
          >
            Compare
          </button>
        </div>
        <p className="text-[11px] text-text-muted">Shows what changed on head since it split from base (like a pull request).</p>
        <datalist id="diffity-branches">
          <option value="HEAD" />
          {branches?.map((branch) => <option key={branch.name} value={branch.name} />)}
        </datalist>
      </form>
    </Card>
  );
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const { theme, toggleTheme } = useTheme();
  const nav = useRepoNav();
  const { data: overview, loading: overviewLoading, error } = useOverview();
  const { data: info } = useInfo();
  const { data: status } = useGitStatus();
  const { details } = useGitHubPr();
  const branch = status?.branch ?? info?.branch ?? null;
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const { data: recent } = useRecentCommits(6);
  const lastCommit = recent?.commits[0] ?? null;

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommittedCount = status ? status.staged + status.unstaged + status.untracked : overview?.files.length ?? 0;
  const uncommittedDetail = () => {
    if (!status) {
      return 'Checking…';
    }
    if (uncommittedCount === 0) {
      return 'Working tree is clean';
    }
    const parts: string[] = [];
    if (status.staged > 0) {
      parts.push(`${status.staged} staged`);
    }
    if (status.unstaged > 0) {
      parts.push(`${status.unstaged} modified`);
    }
    if (status.untracked > 0) {
      parts.push(`${status.untracked} new`);
    }
    return parts.join(' · ');
  };
  const showBranchTarget = !details && base && branch && branch !== base && `origin/${branch}` !== base;

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans">
      <TitleBar>
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          {info?.name && <span className="font-semibold text-text text-sm truncate">{info.name}</span>}
          {info?.branch && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-diff-hunk-bg text-diff-hunk-text rounded font-mono text-[11px] shrink-0">
              <GitBranchIcon className="w-3 h-3" />
              {info.branch}
            </span>
          )}
          <PageSwitcher current="overview" />
          <span className="text-text-muted truncate hidden lg:inline">Overview</span>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0">
          <GitSyncActions />
          <CommentsButton />
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
          <StatusCard />

          <div>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">What do you want to review?</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              <Target
                icon={<PencilIcon className="w-4 h-4" />}
                title="Uncommitted changes"
                detail={uncommittedDetail()}
                disabled={status !== undefined && uncommittedCount === 0}
                onClick={() => onNavigate('work')}
              />
              <Target
                icon={<GitCommitIcon className="w-4 h-4" />}
                title="Last commit"
                detail={lastCommit ? `${lastCommit.shortHash} ${lastCommit.message}` : 'No commits yet'}
                disabled={!lastCommit}
                onClick={() => lastCommit && onNavigate(commitRef(lastCommit.hash))}
              />
              {details ? (
                <Target
                  icon={<GitPullRequestIcon className="w-4 h-4" />}
                  title={`Pull request #${details.prNumber}`}
                  detail={details.prTitle}
                  onClick={() => onNavigate(prDiffRef(details))}
                />
              ) : (
                <Target
                  icon={<GitCompareIcon className="w-4 h-4" />}
                  title={showBranchTarget ? 'This branch' : 'Branch vs base'}
                  detail={showBranchTarget && base ? `${branch} vs ${base.replace(/^origin\//, '')}` : 'You are on the base branch'}
                  disabled={!showBranchTarget}
                  onClick={() => base && onNavigate(`${base}...HEAD`)}
                />
              )}
              <Target icon={<FolderOpenIcon className="w-4 h-4" />} title="Browse files" detail="Read and comment on any file" onClick={() => nav.toTree()} />
            </div>
          </div>

          {error && (
            <div className={`${cardClass} px-4 py-3 flex items-center gap-3 text-sm text-deleted`}>
              <AlertCircleIcon className="w-4 h-4 shrink-0" />
              <span className="flex-1">Could not read uncommitted files: {error}</span>
            </div>
          )}
          {!error && overviewLoading && <div className={`${cardClass} h-24 animate-pulse`} />}
          {!error && overview && overview.files.length > 0 && <OverviewFileList files={overview.files} onViewAll={() => onNavigate('work')} />}
          {!error && overview && overview.files.length === 0 && (
            <div className={`${cardClass} flex items-center gap-3 px-4 py-3`}>
              <span className="text-added opacity-60 shrink-0 [&_svg]:w-5 [&_svg]:h-5">
                <CheckCircleIcon />
              </span>
              <span className="text-sm text-text-secondary">Working tree is clean — nothing uncommitted. Pick a commit below to review it.</span>
            </div>
          )}

          <Card title="Commits" action={<span className="text-[11px] text-text-muted">Click a commit to review it</span>}>
            <CommitList onCommitClick={(hash) => onNavigate(commitRef(hash))} onCompareFrom={(hash) => onNavigate(`${hash}..HEAD`)} />
          </Card>

          <CompareCard onNavigate={onNavigate} defaultBase={base} />
        </div>
      </div>
    </div>
  );
}
