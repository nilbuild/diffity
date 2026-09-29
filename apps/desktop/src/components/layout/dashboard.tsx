import { useState } from 'react';
import { useOverview } from '../../hooks/use-overview';
import { useCommits } from '../../hooks/use-commits';
import { useInfo } from '../../hooks/use-info';
import { useTheme } from '../../hooks/use-theme';
import { OverviewFileList } from './overview-file-list';
import { CommitList } from './commit-list';
import { CheckCircleIcon } from '../icons/check-circle-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { PageLoader } from './skeleton';
import { TitleBar } from './title-bar';
import { PageSwitcher } from './page-switcher';
import { GitSyncActions } from './git-sync-actions';
import { OptionsMenu } from './options-menu';
import { commitRef } from '../../lib/api';

interface DashboardProps {
  onNavigate: (ref: string) => void;
}

const QUICK_REFS = [
  { ref: 'work', label: 'All changes' },
  { ref: 'staged', label: 'Staged' },
  { ref: 'unstaged', label: 'Unstaged' },
];

function CompareCard(props: { onNavigate: (ref: string) => void }) {
  const { onNavigate } = props;
  const [value, setValue] = useState('');

  return (
    <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-medium text-text">Compare</h3>
      </div>
      <div className="px-4 py-3 space-y-3">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const ref = value.trim();
            if (ref) {
              onNavigate(ref);
            }
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="main...HEAD, HEAD~3, a1b2c3d"
            className="flex-1 min-w-0 text-sm font-mono bg-bg border border-border rounded-md px-3 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            View diff
          </button>
        </form>
        <div className="flex items-center gap-2">
          {QUICK_REFS.map((item) => (
            <button
              key={item.ref}
              onClick={() => onNavigate(item.ref)}
              className="px-2.5 py-1 text-xs rounded-md bg-bg-tertiary text-text-secondary hover:bg-hover hover:text-text transition-colors cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Dashboard(props: DashboardProps) {
  const { onNavigate } = props;
  const { theme, toggleTheme } = useTheme();
  const { data: overview, loading: overviewLoading, error } = useOverview();
  const { data: commitsPage, loading: commitsLoading } = useCommits();
  const { data: info } = useInfo();

  const anyLoading = overviewLoading || commitsLoading;

  if (error) {
    return (
      <div className="flex flex-col min-h-screen bg-bg text-text font-sans">
        <div className="flex flex-col items-center justify-center p-12 text-deleted text-center">
          <h2 className="text-xl mb-2">Failed to load overview</h2>
          <p className="text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  if (anyLoading || !overview) {
    return <PageLoader />;
  }

  const isClean = overview.files.length === 0;

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
          <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
        </div>
      </TitleBar>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
          {isClean ? (
            <div className="flex flex-col items-center justify-center py-16 text-text-muted text-center gap-3">
              <div className="text-added opacity-50 mb-2">
                <CheckCircleIcon />
              </div>
              <h2 className="text-xl text-text-secondary">Working tree is clean</h2>
              <p>No changes to display.</p>
            </div>
          ) : (
            <OverviewFileList
              files={overview.files}
              onViewAll={() => onNavigate('work')}
            />
          )}

          <CompareCard onNavigate={onNavigate} />

          <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="font-medium text-text">Recent commits</h3>
            </div>
            <CommitList
              initialCommits={commitsPage?.commits ?? []}
              initialHasMore={commitsPage?.hasMore ?? false}
              onCommitClick={(hash) => onNavigate(commitRef(hash))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
