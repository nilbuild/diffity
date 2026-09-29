import { useCallback, useMemo } from 'react';
import type { ParsedDiff } from '@diffity/parser';
import { getFilePath, type ViewMode } from '../../lib/diff-utils';
import { EyeOffIcon } from '../icons/eye-off-icon';
import { UnifiedViewIcon } from '../icons/unified-view-icon';
import { SplitViewIcon } from '../icons/split-view-icon';
import { CommentToolbarActions } from '../comments/comment-toolbar-actions';
import { OptionsMenu } from './options-menu';
import { GENERAL_THREAD_FILE_PATH } from '../comments/types';
import type { CommentThread } from '../comments/types';
import { isThreadResolved } from '../comments/types';
import { RepoTitle, TitleBar, TitleBarDivider } from './title-bar';
import { PageSwitcher } from './page-switcher';
import { RefMenu } from './ref-menu';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { buttonIconOutline } from '../ui/button-styles';
import { ClaudeToolbar } from '../../features/claude/claude-toolbar';
import { FinishReview } from '../../features/review/finish-review';
import { CommentsButton } from '../../features/comments/comments-button';
import { useRepoMeta } from '../../hooks/use-repo-state';
import { cn } from '../../lib/cn';
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
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
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
    sessionId,
    viewMode,
    onViewModeChange,
  } = props;
  const { data: meta } = useRepoMeta();
  const hasChanges = !diff || diff.files.length > 0;

  const formatForCopy = useCallback(() => {
    return formatThreadsForCopy(threads, diff, diffRef);
  }, [threads, diff, diffRef]);

  const viewModeOptions = useMemo(() => [
    { value: 'unified' as ViewMode, label: 'Unified', icon: <UnifiedViewIcon className="w-3.5 h-3.5" /> },
    { value: 'split' as ViewMode, label: 'Split', icon: <SplitViewIcon className="w-3.5 h-3.5" /> },
  ], []);

  return (
    <TitleBar>
      <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
        <RepoTitle name={repoName} path={meta?.path} />
        <PageSwitcher current="diff" />
        {diffRef && <RefMenu diffRef={diffRef} branch={branch} />}
        {hasChanges && (
          <>
            <TitleBarDivider />
            <SegmentedToggle options={viewModeOptions} value={viewMode} onChange={onViewModeChange} iconOnly />
          </>
        )}
        {(hasChanges || hideWhitespace) && (
          <button
            onClick={() => onHideWhitespaceChange(!hideWhitespace)}
            className={cn(buttonIconOutline, hideWhitespace && 'bg-selected border-accent/40 text-accent hover:bg-selected hover:text-accent')}
            title={hideWhitespace ? 'Whitespace changes are hidden — show them' : 'Hide whitespace-only changes'}
            aria-pressed={hideWhitespace}
          >
            <EyeOffIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
      <div className="flex items-center gap-2 shrink-0">
        <CommentToolbarActions
          threads={threads}
          onScrollToThread={onScrollToThread}
          onDeleteAllComments={onDeleteAllComments}
          formatForCopy={formatForCopy}
        />
        <CommentsButton />
        {(hasChanges || threads.length > 0) && (
          <>
            <ClaudeToolbar diffRef={diffRef ?? null} sessionId={sessionId ?? null} threads={threads} hasChanges={hasChanges} />
            <FinishReview githubDetails={props.githubDetails ?? null} threads={threads} />
          </>
        )}
        <OptionsMenu theme={theme} onToggleTheme={onToggleTheme} onShowHelp={onShowHelp} />
      </div>
    </TitleBar>
  );
}
