import { useState, useCallback } from 'react';
import type { ParsedDiff } from '@diffity/parser';
import { getFilePath } from '../../lib/diff-utils';
import { EyeIcon } from '../icons/eye-icon';
import { EyeOffIcon } from '../icons/eye-off-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { GitHubIcon } from '../icons/github-icon';
import { GitHubDialog } from './github-dialog';
import { CommentToolbarActions } from '../comments/comment-toolbar-actions';
import { OptionsMenu, menuItemClass } from './options-menu';
import { GENERAL_THREAD_FILE_PATH } from '../comments/types';
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


  return (
    <TitleBar>
      <div className="flex items-center gap-2 min-w-0 shrink">
        {repoName && (
          <button
            onClick={nav.toOverview}
            className="font-semibold text-text text-sm truncate max-w-[180px] shrink-0 hover:text-accent transition-colors cursor-pointer"
            title="Repository overview"
          >
            {repoName}
          </button>
        )}
        {branch && (
          <span className="hidden min-[1180px]:inline-flex items-center gap-1 px-1.5 py-0.5 bg-diff-hunk-bg text-diff-hunk-text rounded font-mono text-[11px] shrink min-w-0 max-w-[180px]" title={branch}>
            <GitBranchIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">{branch}</span>
          </span>
        )}
        <PageSwitcher current="diff" />
        {diffRef && <RefMenu diffRef={diffRef} branch={branch} />}
      </div>
      <div className="flex items-center gap-2 ml-auto shrink-0">
        <GitSyncActions />
        {(githubDetails || hasGitHubRemote) && (
          <button
            onClick={() => setShowGitHub(true)}
            className="inline-flex items-center gap-1 px-2 py-1 bg-bg-tertiary rounded-md text-xs text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0"
            title={githubDetails ? `Pull request #${githubDetails.prNumber}: ${githubDetails.prTitle}` : 'GitHub: sign in, push and pull PR comments'}
          >
            <GitHubIcon className="w-3.5 h-3.5" />
            {githubDetails && <span className="font-mono">#{githubDetails.prNumber}</span>}
          </button>
        )}
        <CommentToolbarActions
          threads={threads}
          onScrollToThread={onScrollToThread}
          onDeleteAllComments={onDeleteAllComments}
          formatForCopy={formatForCopy}
        />
        <ClaudeToolbar diffRef={diffRef ?? null} sessionId={sessionId ?? null} threads={threads} hasChanges={!diff || diff.files.length > 0} />
        <FinishReview githubDetails={githubDetails ?? null} hasGitHubRemote={!!hasGitHubRemote} />
        <OptionsMenu
          theme={theme}
          onToggleTheme={onToggleTheme}
          onShowHelp={onShowHelp}
          renderExtraItems={(close) => (
            <button
              className={menuItemClass}
              onClick={() => {
                onHideWhitespaceChange(!hideWhitespace);
                close();
              }}
            >
              {hideWhitespace ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
              {hideWhitespace ? 'Show whitespace changes' : 'Hide whitespace changes'}
            </button>
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
