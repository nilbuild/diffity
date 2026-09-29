import { useState, useCallback, useMemo } from 'react';
import type { ParsedDiff } from '@diffity/parser';
import { getFilePath } from '../../lib/diff-utils';
import { UnifiedViewIcon } from '../icons/unified-view-icon';
import { SplitViewIcon } from '../icons/split-view-icon';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { EyeIcon } from '../icons/eye-icon';
import { EyeOffIcon } from '../icons/eye-off-icon';
import { KeyboardIcon } from '../icons/keyboard-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { GitHubIcon } from '../icons/github-icon';
import { DiffStats } from '../diff/diff-stats';
import { GitHubDialog } from './github-dialog';
import { CommentToolbarActions } from '../comments/comment-toolbar-actions';
import { OptionsMenu, menuItemClass } from './options-menu';
import { GENERAL_THREAD_FILE_PATH } from '../comments/types';
import type { ViewMode } from '../../lib/diff-utils';
import type { CommentThread } from '../comments/types';
import { isThreadResolved } from '../comments/types';
import { TitleBar } from './title-bar';
import { PageSwitcher } from './page-switcher';
import { RefMenu } from './ref-menu';
import { GitSyncActions } from './git-sync-actions';
import { ClaudeToolbar } from '../../features/claude/claude-toolbar';
import { FinishReview } from '../../features/review/finish-review';
import { useRepoNav } from '../../hooks/use-repo';
import type { GitHubDetails } from '../../lib/api';

interface ToolbarProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  hideWhitespace: boolean;
  onHideWhitespaceChange: (hide: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onShowHelp: () => void;
  diff?: ParsedDiff;
  diffRef?: string;
  threads: CommentThread[];
  onDeleteAllComments: () => void;
  onScrollToThread: (threadId: string, filePath: string) => void;
  repoName: string | null;
  branch: string | null;
  description: string | null;
  githubDetails?: GitHubDetails | null;
  hasGitHubRemote?: boolean;
  sessionId?: string | null;
  onGitHubPulled?: () => void;
}

function extractCodeContext(diff: ParsedDiff | undefined, filePath: string, side: 'old' | 'new', startLine: number, endLine: number): string[] {
  if (!diff) {
    return [];
  }

  const file = diff.files.find(f => getFilePath(f) === filePath);
  if (!file) {
    return [];
  }

  const lines: string[] = [];
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const lineNum = side === 'old' ? line.oldLineNumber : line.newLineNumber;
      if (lineNum !== null && lineNum >= startLine && lineNum <= endLine) {
        const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';
        lines.push(`${prefix} ${line.content}`);
      }
    }
  }

  return lines;
}

function formatThreadsForCopy(threads: CommentThread[], diff?: ParsedDiff, diffRef?: string): string {
  const unresolvedThreads = threads.filter(t => !isThreadResolved(t));
  if (unresolvedThreads.length === 0) {
    return '';
  }

  const parts: string[] = [];

  if (diffRef) {
    parts.push(`Diff ref: ${diffRef}`);
    parts.push('');
  }

  for (const thread of unresolvedThreads) {
    if (thread.filePath === GENERAL_THREAD_FILE_PATH) {
      parts.push('## General comment');
    } else {
      const lineRange = thread.startLine === thread.endLine
        ? `${thread.startLine}`
        : `${thread.startLine}-${thread.endLine}`;
      const sideDesc = thread.side === 'old' ? 'before change' : 'after change';
      parts.push(`## ${thread.filePath}:${lineRange} (${sideDesc})`);
    }

    const codeLines = extractCodeContext(diff, thread.filePath, thread.side, thread.startLine, thread.endLine);
    if (codeLines.length > 0) {
      parts.push('```diff');
      parts.push(...codeLines);
      parts.push('```');
    }

    const uniqueAuthors = new Set(thread.comments.map(c => c.author.name));
    const singleAuthor = uniqueAuthors.size === 1;

    for (const comment of thread.comments) {
      if (singleAuthor) {
        parts.push(comment.body);
      } else {
        const authorName = comment.author.name === 'You' ? 'User' : comment.author.name;
        parts.push(`**${authorName}:** ${comment.body}`);
      }
    }
    parts.push('');
  }

  return parts.join('\n');
}

export function Toolbar(props: ToolbarProps) {
  const {
    viewMode,
    onViewModeChange,
    hideWhitespace,
    onHideWhitespaceChange,
    theme,
    onToggleTheme,
    onShowHelp,
    diff,
    diffRef,
    threads,
    onDeleteAllComments,
    onScrollToThread,
    repoName,
    branch,
    description,
    githubDetails,
    hasGitHubRemote,
    sessionId,
    onGitHubPulled,
  } = props;
  const [showGitHub, setShowGitHub] = useState(false);
  const nav = useRepoNav();

  const formatForCopy = useCallback(() => {
    return formatThreadsForCopy(threads, diff, diffRef);
  }, [threads, diff, diffRef]);

  const viewModeOptions = useMemo(() => [
    { value: 'unified' as ViewMode, label: 'Unified', icon: <UnifiedViewIcon className="w-3.5 h-3.5" /> },
    { value: 'split' as ViewMode, label: 'Split', icon: <SplitViewIcon className="w-3.5 h-3.5" /> },
  ], []);

  return (
    <TitleBar>
      <div className="flex items-center gap-2.5 min-w-0 shrink">
        {repoName && (
          <button
            onClick={nav.toOverview}
            className="font-semibold text-text text-sm truncate max-w-[220px] shrink-0 hover:text-accent transition-colors cursor-pointer"
            title="Repository overview"
          >
            {repoName}
          </button>
        )}
        {branch && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-diff-hunk-bg text-diff-hunk-text rounded font-mono text-[11px] shrink-0">
            <GitBranchIcon className="w-3 h-3" />
            {branch}
          </span>
        )}
        <PageSwitcher current="diff" />
        {description && diffRef && <RefMenu diffRef={diffRef} description={description} />}
        {diff && (
          <span className="hidden 2xl:inline-flex items-center bg-bg-tertiary rounded-md overflow-hidden text-text-muted shrink-0">
            <span className="px-2 py-0.5">{diff.stats.filesChanged} file{diff.stats.filesChanged !== 1 ? 's' : ''} changed</span>
            <span className="px-2 py-0.5">
              <DiffStats additions={diff.stats.totalAdditions} deletions={diff.stats.totalDeletions} />
            </span>
          </span>
        )}
        {(githubDetails || hasGitHubRemote) && (
          <button
            onClick={() => setShowGitHub(true)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-bg-tertiary rounded-md font-mono text-[11px] text-text-muted hover:text-text transition-colors cursor-pointer shrink-0"
            title={githubDetails ? githubDetails.prTitle : 'GitHub'}
          >
            <GitHubIcon className="w-3 h-3" />
            {githubDetails ? `#${githubDetails.prNumber}` : 'GitHub'}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <GitSyncActions />
        <SegmentedToggle options={viewModeOptions} value={viewMode} onChange={onViewModeChange} labelClassName="hidden 2xl:inline" />
        <CommentToolbarActions
          threads={threads}
          onScrollToThread={onScrollToThread}
          onDeleteAllComments={onDeleteAllComments}
          formatForCopy={formatForCopy}
        />
        <ClaudeToolbar diffRef={diffRef ?? null} sessionId={sessionId ?? null} threads={threads} />
        <FinishReview githubDetails={githubDetails ?? null} />
        <OptionsMenu
          theme={theme}
          onToggleTheme={onToggleTheme}
          renderExtraItems={(close) => (
            <>
              <button
                className={menuItemClass}
                onClick={() => {
                  onHideWhitespaceChange(!hideWhitespace);
                  close();
                }}
              >
                {hideWhitespace ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                {hideWhitespace ? 'Show whitespace' : 'Hide whitespace'}
                {hideWhitespace && <span className="ml-auto text-accent text-[10px]">On</span>}
              </button>
              <button
                className={menuItemClass}
                onClick={() => {
                  onShowHelp();
                  close();
                }}
              >
                <KeyboardIcon className="w-3.5 h-3.5" />
                Keyboard shortcuts
                <span className="ml-auto text-text-muted">?</span>
              </button>
            </>
          )}
        />
      </div>
      {showGitHub && (
        <GitHubDialog
          details={githubDetails ?? null}
          currentRef={diffRef}
          onPulled={() => onGitHubPulled?.()}
          onClose={() => setShowGitHub(false)}
        />
      )}
    </TitleBar>
  );
}
