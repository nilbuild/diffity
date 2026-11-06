import type { ParsedDiff } from '@/lib/diff-parser';
import { getFilePath } from '../../lib/diff-utils';
import { OptionsMenu } from './options-menu';
import { GENERAL_THREAD_FILE_PATH } from '../comments/types';
import type { CommentThread } from '../comments/types';
import { isThreadResolved } from '../comments/types';
import { Breadcrumb, TitleBar } from './title-bar';
import { CommentsButton } from '../../features/comments/comments-button';
import { ClaudeToolbar } from '../../features/claude/claude-toolbar';
import { FinishReview } from '../../features/review/finish-review';
import { usePrLookupExpected, useRepoMeta } from '../../hooks/use-repo-state';
import { Skeleton, useElapsed } from '../ui/skeleton';
import { PR_LOOKUP_BUDGET, isPrShapedRef } from './ref-menu';
import { OwnPrAction, PrMenuItems } from '../../features/pr/pr-session';
import { ShipMenu } from '../../features/tasks/ship-menu';
import { useTaskForPath } from '../../features/tasks/tasks';
import { useRepoPath } from '../../hooks/use-repo';
import type { GitHubDetails } from '../../lib/api';

interface ToolbarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onShowHelp: () => void;
  diff?: ParsedDiff;
  diffRef?: string;
  threads: CommentThread[];
  repoName: string | null;
  branch: string | null;
  githubDetails?: GitHubDetails | null;
  hasGitHubRemote?: boolean;
  sessionId?: string | null;
  focusedFile?: string | null;
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

export function formatThreadsForCopy(threads: CommentThread[], diff?: ParsedDiff, diffRef?: string): string {
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
    theme,
    onToggleTheme,
    onShowHelp,
    diff,
    diffRef,
    threads,
    repoName,
    sessionId,
  } = props;
  const { data: meta } = useRepoMeta();
  const hasChanges = !diff || diff.files.length > 0;
  const inTask = !!useTaskForPath(useRepoPath());
  const prExpected = usePrLookupExpected();
  const prBudgetSpent = useElapsed(PR_LOOKUP_BUDGET);
  // Holds the review button's place while GitHub answers, so it doesn't push the other buttons aside when it lands.
  const reserveReview = !!diffRef && isPrShapedRef(diffRef) && prExpected && !prBudgetSpent && !props.githubDetails;

  return (
    <TitleBar>
      <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
        <Breadcrumb name={repoName} path={meta?.path} />
      </div>
      <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
      <div className="flex items-center gap-2 shrink-0">
        <CommentsButton />
        {inTask ? <ShipMenu /> : <OwnPrAction diffRef={diffRef ?? null} />}
        {(hasChanges || threads.length > 0) && (
          <>
            <ClaudeToolbar
              diffRef={diffRef ?? null}
              sessionId={sessionId ?? null}
              hasChanges={hasChanges}
              focusedFile={props.focusedFile ?? null}
              threads={threads}
              formatForCopy={() => formatThreadsForCopy(threads, diff, diffRef)}
            />
            {reserveReview ? <Skeleton className="w-[150px] @max-3xl/titlebar:w-[72px] h-7 rounded-md" /> : <FinishReview githubDetails={props.githubDetails ?? null} threads={threads} />}
          </>
        )}
        <OptionsMenu
          theme={theme}
          onToggleTheme={onToggleTheme}
          onShowHelp={onShowHelp}
          showAgentHistory
          renderExtraItems={(close) => <PrMenuItems diffRef={diffRef ?? null} close={close} />}
        />
      </div>
    </TitleBar>
  );
}
