import type { DiffHunk, DiffLine as DiffLineType } from '@diffity/parser';
import type { HighlightedTokens } from '../../hooks/use-highlighter';
import type { ViewMode } from '../../lib/diff-utils';
import type { SyntaxToken } from '../../lib/syntax-token';
import type { ExpandControls } from './hunk-header';
import type { CommentThread as CommentThreadType, CommentAuthor, CommentSide, LineSelection, SubmitOptions } from '../comments/types';
import { HunkBlock } from './hunk-block';
import { HunkBlockSplit } from './hunk-block-split';
import { buildExpansionSyntaxMap, renderExpansionRows } from './render-expansion-rows';

interface GapExpansion {
  fromTop: number;
  fromBottom: number;
  linesFromTop: DiffLineType[];
  linesFromBottom: DiffLineType[];
}

interface HunkWithGapProps {
  hunk: DiffHunk;
  viewMode: ViewMode;
  syntaxMap?: Map<string, SyntaxToken[]>;
  expandControls?: ExpandControls;
  topExpansionLines?: DiffLineType[];
  gapExpansion?: GapExpansion;
  gapId?: string;
  highlightLine?: (code: string) => HighlightedTokens[] | null;
  threads?: CommentThreadType[];
  pendingSelection?: LineSelection | null;
  currentAuthor?: CommentAuthor;
  isLineSelected?: (line: number, side: CommentSide) => boolean;
  onLineMouseDown?: (line: number, side: CommentSide) => void;
  onLineMouseEnter?: (line: number, side: CommentSide) => void;
  onCommentClick?: (line: number, side: CommentSide) => void;
  onAddThread?: (filePath: string, side: CommentSide, startLine: number, endLine: number, body: string, author: CommentAuthor, options?: SubmitOptions) => void;
  onReply?: (threadId: string, body: string, author: CommentAuthor, options?: SubmitOptions) => void;
  onResolve?: (threadId: string) => void;
  onUnresolve?: (threadId: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (threadId: string, commentId: string) => void;
  onDeleteThread?: (threadId: string) => void;
  onCancelPending?: () => void;
  filePath?: string;
  onRevertChange?: (hunk: DiffHunk, startIndex: number, endIndex: number) => void;
  getOriginalCode?: (side: CommentSide, startLine: number, endLine: number) => string;
}

export function HunkWithGap(props: HunkWithGapProps) {
  const {
    hunk, viewMode, syntaxMap, expandControls, topExpansionLines, gapExpansion, gapId, highlightLine,
    threads, pendingSelection, currentAuthor, isLineSelected,
    onLineMouseDown, onLineMouseEnter, onCommentClick,
    onAddThread, onReply, onResolve, onUnresolve, onEditComment, onDeleteComment, onDeleteThread,
    onCancelPending, filePath, onRevertChange, getOriginalCode,
  } = props;

  const HunkComponent = viewMode === 'split' ? HunkBlockSplit : HunkBlock;

  const allExpansionLines = [
    ...(topExpansionLines || []),
    ...(gapExpansion?.linesFromTop || []),
    ...(gapExpansion?.linesFromBottom || []),
  ];
  const expansionSyntaxMap = allExpansionLines.length > 0
    ? buildExpansionSyntaxMap(allExpansionLines, highlightLine)
    : undefined;

  const commentProps = {
    isLineSelected, onLineMouseDown, onLineMouseEnter, onCommentClick,
    threads, pendingSelection, currentAuthor,
    onAddThread, onReply, onResolve, onUnresolve, onEditComment, onDeleteComment, onDeleteThread,
    onCancelPending, filePath,
  };

  return (
    <>
      {gapExpansion && gapExpansion.linesFromTop.length > 0 && (
        <tbody>
          {renderExpansionRows(
            gapExpansion.linesFromTop,
            viewMode,
            `${gapId}-top`,
            expansionSyntaxMap,
            commentProps,
          )}
        </tbody>
      )}
      <HunkComponent
        hunk={hunk}
        syntaxMap={syntaxMap}
        expandControls={expandControls}
        topExpansionLines={topExpansionLines && topExpansionLines.length > 0 ? topExpansionLines : undefined}
        bottomExpansionLines={gapExpansion && gapExpansion.linesFromBottom.length > 0 ? gapExpansion.linesFromBottom : undefined}
        expansionSyntaxMap={expansionSyntaxMap}
        threads={threads}
        pendingSelection={pendingSelection}
        currentAuthor={currentAuthor}
        isLineSelected={isLineSelected}
        onLineMouseDown={onLineMouseDown}
        onLineMouseEnter={onLineMouseEnter}
        onCommentClick={onCommentClick}
        onAddThread={onAddThread}
        onReply={onReply}
        onResolve={onResolve}
        onUnresolve={onUnresolve}
        onEditComment={onEditComment}
        onDeleteComment={onDeleteComment}
        onDeleteThread={onDeleteThread}
        onCancelPending={onCancelPending}
        filePath={filePath}
        onRevertChange={onRevertChange}
        getOriginalCode={getOriginalCode}
      />
    </>
  );
}
