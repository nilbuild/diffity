import { useEffect, useState } from 'react';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { useBaseBranch, useBranches, useGitHubPr, useGitStatus } from '../../hooks/use-repo-state';
import { CommitList } from './commit-list';
import { GitCompareIcon } from '../icons/git-compare-icon';
import { PencilIcon } from '../icons/pencil-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { hideStaticSplash } from './skeleton';
import { RepoTitle, TitleBar } from './title-bar';
import { PageSwitcher } from './page-switcher';
import { OptionsMenu } from './options-menu';
import { StatusBar } from './status-bar';
import { CommentsButton } from '../../features/comments/comments-button';
import { commitRef } from '../../lib/api';
import { prDiffRef } from './ref-menu';
import { buttonOutline } from '../ui/button-styles';

interface DashboardProps {
  onNavigate: (ref: string) => void;
}

const inputClass = 'flex-1 min-w-0 h-7 text-xs font-mono bg-bg border border-border rounded-md px-2.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent';

function CompareForm(props: { onNavigate: (ref: string) => void; defaultBase: string | null }) {
  const { onNavigate, defaultBase } = props;
  const { data: branches } = useBranches();
  const [base, setBase] = useState('');
  const [head, setHead] = useState('HEAD');
  const effectiveBase = base.trim() || defaultBase || '';

  return (
    <form
      id="compare"
      className="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!effectiveBase) {
          return;
        }
        onNavigate(`${effectiveBase}...${head.trim() || 'HEAD'}`);
      }}
      title="Shows what changed on head since it split from base, like a pull request"
    >
      <GitCompareIcon className="w-3.5 h-3.5 text-text-muted shrink-0" />
      <input
        type="text"
        list="diffity-branches"
        value={base}
        onChange={(event) => setBase(event.target.value)}
        placeholder={defaultBase ? `base (${defaultBase})` : 'base branch, tag or commit'}
        className={inputClass}
      />
      <span className="text-text-muted text-xs font-mono">...</span>
      <input
        type="text"
        list="diffity-branches"
        value={head}
        onChange={(event) => setHead(event.target.value)}
        placeholder="head"
        className={inputClass}
      />
      <button type="submit" disabled={!effectiveBase} className={buttonOutline}>
        Compare
      </button>
      <datalist id="diffity-branches">
        <option value="HEAD" />
        {branches?.map((branch) => <option key={branch.name} value={branch.name} />)}
      </datalist>
    </form>
  );
}

function Shortcut(props: { icon: React.ReactNode; label: string; detail?: string; onClick: () => void }) {
  const { icon, label, detail, onClick } = props;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full h-8 px-2 text-left text-xs rounded hover:bg-hover transition-colors cursor-pointer min-w-0"
    >
      <span className="text-text-muted shrink-0">{icon}</span>
      <span className="text-text font-medium shrink-0">{label}</span>
      {detail && <span className="text-text-muted truncate">{detail}</span>}
    </button>
  );
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const { theme, toggleTheme } = useTheme();
  const { data: info } = useInfo();
  const { data: status } = useGitStatus();
  const { details } = useGitHubPr();
  const branch = status?.branch ?? info?.branch ?? null;
  const base = useBaseBranch(details?.baseRef ?? null, branch);

  useEffect(() => {
    hideStaticSplash();
  }, []);

  const uncommitted = status ? status.staged + status.unstaged + status.untracked : 0;
  const showBranch = !details && base && branch && branch !== base && `origin/${branch}` !== base;

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans">
      <TitleBar>
        <div data-tauri-drag-region className="flex items-center gap-2 min-w-0 shrink">
          <RepoTitle name={info?.name} />
          <PageSwitcher current="overview" />
        </div>
        <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
        <div className="flex items-center gap-1.5 shrink-0">
          <CommentsButton />
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-4 space-y-2">
          {(uncommitted > 0 || details || showBranch) && (
            <div className="rounded-md border border-border p-1">
              {uncommitted > 0 && (
                <Shortcut
                  icon={<PencilIcon className="w-3.5 h-3.5" />}
                  label="Uncommitted changes"
                  detail={`${uncommitted} file${uncommitted === 1 ? '' : 's'}`}
                  onClick={() => onNavigate('work')}
                />
              )}
              {details && (
                <Shortcut
                  icon={<GitPullRequestIcon className="w-3.5 h-3.5 text-added" />}
                  label={`Pull request #${details.prNumber}`}
                  detail={details.prTitle}
                  onClick={() => onNavigate(prDiffRef(details))}
                />
              )}
              {showBranch && base && (
                <Shortcut
                  icon={<GitCompareIcon className="w-3.5 h-3.5" />}
                  label={`${branch} vs ${base.replace(/^origin\//, '')}`}
                  detail="every commit on this branch"
                  onClick={() => onNavigate(`${base}...HEAD`)}
                />
              )}
            </div>
          )}
          <CompareForm onNavigate={onNavigate} defaultBase={base} />
          <h2 className="text-xs font-medium text-text-muted pt-2">Commits</h2>
          <div className="border border-border rounded-md overflow-hidden">
            <CommitList onCommitClick={(hash) => onNavigate(commitRef(hash))} onCompareFrom={(hash) => onNavigate(`${hash}..HEAD`)} />
          </div>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}
