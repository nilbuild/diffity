import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import { useDismiss } from '../../hooks/use-dismiss';
import { useBaseBranch, useGitHubPr, useGitStatus, useHasGitHubRemote, useRecentCommits } from '../../hooks/use-repo-state';
import { openPullRequests } from '../../lib/ui-store';
import { commitRef, descriptionForRef, parseCommitRef, type GitHubDetails } from '../../lib/api';
import { cn } from '../../lib/cn';
import { ChevronDownIcon } from '../icons/chevron-down-icon';
import { CheckIcon } from '../icons/check-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { GitCommitIcon } from '../icons/git-commit-icon';
import { GitCompareIcon } from '../icons/git-compare-icon';
import { GitPullRequestIcon } from '../icons/git-pull-request-icon';
import { PencilIcon } from '../icons/pencil-icon';
import { Spinner } from '../icons/spinner';

interface RefMenuProps {
  diffRef: string;
  branch: string | null;
}

export function prDiffRef(details: GitHubDetails): string {
  return `origin/${details.baseRef}...HEAD`;
}

function shortBase(base: string): string {
  return base.replace(/^origin\//, '');
}

/** Short, human label for what is being reviewed. */
export function useTargetLabel(diffRef: string, branch: string | null): { label: string; icon: ReactNode } {
  const { details } = useGitHubPr();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  if (details && diffRef === prDiffRef(details)) {
    return { label: `Pull request #${details.prNumber}`, icon: <GitPullRequestIcon className="w-3.5 h-3.5" /> };
  }
  if (base && branch && diffRef === `${base}...HEAD`) {
    return { label: `${branch} vs ${shortBase(base)}`, icon: <GitCompareIcon className="w-3.5 h-3.5" /> };
  }
  if (parseCommitRef(diffRef)) {
    return { label: descriptionForRef(diffRef), icon: <GitCommitIcon className="w-3.5 h-3.5" /> };
  }
  if (diffRef.includes('..')) {
    return { label: diffRef, icon: <GitCompareIcon className="w-3.5 h-3.5" /> };
  }
  return { label: descriptionForRef(diffRef), icon: <PencilIcon className="w-3.5 h-3.5" /> };
}

const sectionClass = 'px-3 pt-2 pb-1 text-[10px] font-semibold text-text-muted uppercase tracking-widest';

interface ItemProps {
  selected: boolean;
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  meta?: ReactNode;
  onClick: () => void;
}

function Item(props: ItemProps) {
  const { selected, icon, title, hint, meta, onClick } = props;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-start gap-2.5 w-full px-3 py-1.5 text-left transition-colors cursor-pointer hover:bg-hover',
        selected && 'bg-hover',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', selected ? 'text-accent' : 'text-text-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('text-xs truncate', selected ? 'text-text font-medium' : 'text-text-secondary')}>{title}</span>
          {selected && <CheckIcon className="w-3 h-3 text-accent shrink-0" />}
        </span>
        {hint && <span className="block text-[11px] text-text-muted truncate">{hint}</span>}
      </span>
      {meta && <span className="shrink-0 text-[11px] text-text-muted tabular-nums mt-0.5">{meta}</span>}
    </button>
  );
}

function count(n: number | undefined) {
  if (n === undefined) {
    return null;
  }
  return n === 0 ? 'none' : `${n} file${n === 1 ? '' : 's'}`;
}

export function RefMenu(props: RefMenuProps) {
  const { diffRef, branch } = props;
  const nav = useRepoNav();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const target = useTargetLabel(diffRef, branch);

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-1.5 max-w-full h-7 px-2 rounded-md text-xs transition-colors cursor-pointer',
          open ? 'bg-hover text-text' : 'bg-bg-tertiary text-text-secondary hover:bg-hover hover:text-text',
        )}
        title="Choose what to review"
      >
        <span className="shrink-0 text-text-muted">{target.icon}</span>
        <span className="truncate font-medium">{target.label}</span>
        <ChevronDownIcon className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <RefMenuPanel
          diffRef={diffRef}
          branch={branch}
          onPick={(next) => {
            close();
            nav.toDiff(next);
          }}
          onOverview={() => {
            close();
            nav.toOverview();
          }}
          onPullRequests={() => {
            close();
            openPullRequests();
          }}
        />
      )}
    </div>
  );
}

function RefMenuPanel(props: { diffRef: string; branch: string | null; onPick: (ref: string) => void; onOverview: () => void; onPullRequests: () => void }) {
  const { diffRef, branch, onPick, onOverview, onPullRequests } = props;
  const hasGitHubRemote = useHasGitHubRemote();
  const { data: status } = useGitStatus();
  const { details, loading: prLoading } = useGitHubPr();
  const base = useBaseBranch(details?.baseRef ?? null, branch);
  const { data: recent, isLoading: commitsLoading } = useRecentCommits(6);
  const unstagedCount = status ? status.unstaged + status.untracked : undefined;
  const allCount = status ? status.staged + status.unstaged + status.untracked : undefined;
  const branchRef = base ? `${base}...HEAD` : null;

  return (
    <div className="absolute left-0 top-full mt-1 w-[360px] max-h-[70vh] overflow-y-auto py-1 bg-bg-secondary rounded-md shadow-lg ring-1 ring-border z-50 font-sans">
      <div className={sectionClass}>Uncommitted</div>
      <Item
        selected={diffRef === 'work'}
        icon={<PencilIcon className="w-3.5 h-3.5" />}
        title="Uncommitted changes"
        hint="Staged, unstaged and new files together"
        meta={count(allCount)}
        onClick={() => onPick('work')}
      />
      <Item
        selected={diffRef === 'staged'}
        icon={<PencilIcon className="w-3.5 h-3.5" />}
        title="Staged only"
        hint="What the next commit will contain"
        meta={count(status?.staged)}
        onClick={() => onPick('staged')}
      />
      <Item
        selected={diffRef === 'unstaged'}
        icon={<PencilIcon className="w-3.5 h-3.5" />}
        title="Unstaged only"
        hint="Edits not added to the index yet, plus new files"
        meta={count(unstagedCount)}
        onClick={() => onPick('unstaged')}
      />

      {(details || prLoading || hasGitHubRemote || (branchRef && branch)) && <div className={sectionClass}>Branch</div>}
      {prLoading && !details && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-muted">
          <Spinner className="w-3 h-3" />
          Looking for a pull request…
        </div>
      )}
      {details && (
        <Item
          selected={diffRef === prDiffRef(details)}
          icon={<GitPullRequestIcon className="w-3.5 h-3.5" />}
          title={`Pull request #${details.prNumber}`}
          hint={details.prTitle}
          meta={`into ${details.baseRef}`}
          onClick={() => onPick(prDiffRef(details))}
        />
      )}
      {!details && branchRef && branch && (
        <Item
          selected={diffRef === branchRef}
          icon={<GitCompareIcon className="w-3.5 h-3.5" />}
          title={`${branch} vs ${shortBase(base ?? '')}`}
          hint={`Every commit on ${branch} that is not on ${shortBase(base ?? '')}`}
          onClick={() => onPick(branchRef)}
        />
      )}

      {hasGitHubRemote && (
        <Item
          selected={false}
          icon={<GitPullRequestIcon className="w-3.5 h-3.5" />}
          title="Pull requests…"
          hint="Check out an open pull request, or paste a URL or number"
          onClick={onPullRequests}
        />
      )}

      <div className={sectionClass}>Recent commits</div>
      {commitsLoading && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-muted">
          <Spinner className="w-3 h-3" />
          Loading commits…
        </div>
      )}
      {recent && recent.commits.length === 0 && <div className="px-3 py-1.5 text-[11px] text-text-muted">No commits yet</div>}
      {recent?.commits.map((commit) => (
        <Item
          key={commit.hash}
          selected={parseCommitRef(diffRef) === commit.hash}
          icon={<GitCommitIcon className="w-3.5 h-3.5" />}
          title={commit.message}
          hint={
            <>
              <span className="font-mono">{commit.shortHash}</span> · {commit.author} · {commit.relativeDate}
            </>
          }
          onClick={() => onPick(commitRef(commit.hash))}
        />
      ))}
      <div className="border-t border-border my-1" />
      <button className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-text-secondary hover:bg-hover hover:text-text transition-colors cursor-pointer" onClick={onOverview}>
        <GitBranchIcon className="w-3.5 h-3.5" />
        All commits, ranges and branches…
      </button>
    </div>
  );
}
