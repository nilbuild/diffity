import { useMemo } from 'react';
import type { DiffHunk, DiffLine as DiffLineType } from '@diffity/parser';
import type { SyntaxToken } from '../../lib/syntax-token';
import type { CommentThread as CommentThreadType, CommentAuthor, CommentSide, LineSelection, LineRenderProps, SubmitOptions } from '../comments/types';
import { getChangeGroups } from '../../lib/diff-utils';
import { DiffLine } from './diff-line';
import { HunkHeader, type ExpandControls } from './hunk-header';
import { CommentThread } from '../comments/comment-thread';
import { CommentFormRow } from '../comments/comment-form-row';
import { UndoIcon } from '../ui/icon';

interface HunkBlockProps {
  hunk: DiffHunk;
  syntaxMap?: Map<string, SyntaxToken[]>;
  expandControls?: ExpandControls;
  topExpansionLines?: DiffLineType[];
  bottomExpansionLines?: DiffLineType[];
  expansionSyntaxMap?: Map<string, SyntaxToken[]>;
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

export function renderLineWithComments(
  line: DiffLineType,
  index: number,
  expanded: boolean,
  syntaxMap: Map<string, SyntaxToken[]> | undefined,
  props: LineRenderProps,
): React.ReactNode[] {
  const side: CommentSide = line.type === 'delete' ? 'old' : 'new';
  const activeLine = side === 'old' ? line.oldLineNumber : line.newLineNumber;
  const num = activeLine;
  const key = num !== null ? `${expanded ? 'exp-' : ''}${line.type}-${num}` : `line-${index}`;
  const syntaxKey = num !== null ? `${line.type}-${num}` : '';
  const tokens = syntaxMap?.get(syntaxKey);

  const result: React.ReactNode[] = [];

  result.push(
    <DiffLine
      key={key}
      line={line}
      syntaxTokens={tokens}
      expanded={expanded}
      isSelected={activeLine !== null ? props.isLineSelected?.(activeLine, side) : false}
      onLineMouseDown={props.onLineMouseDown}
      onLineMouseEnter={props.onLineMouseEnter}
      onCommentClick={props.onCommentClick}
    />
  );

  if (activeLine !== null && props.threads) {
    const lineThreads = props.threads.filter(t => t.endLine === activeLine && t.side === side);
    for (const thread of lineThreads) {
      result.push(
        <CommentThread
          key={`thread-${thread.id}`}
          thread={thread}
          onReply={props.onReply!}
          onResolve={props.onResolve!}
          onUnresolve={props.onUnresolve!}
          onEditComment={props.onEditComment!}
          onDeleteComment={props.onDeleteComment!}
          onDeleteThread={props.onDeleteThread!}
          currentAuthor={props.currentAuthor!}
          colSpan={4}
          currentCode={props.getOriginalCode?.(thread.side, thread.startLine, thread.endLine)}
        />
      );
    }
  }

  if (activeLine !== null && props.pendingSelection && props.pendingSelection.endLine === activeLine && props.pendingSelection.side === side && props.filePath && props.currentAuthor && props.onAddThread && props.onCancelPending) {
    result.push(
      <CommentFormRow
        key="pending-comment"
        colSpan={4}
        filePath={props.filePath}
        side={props.pendingSelection.side}
        startLine={props.pendingSelection.startLine}
        endLine={props.pendingSelection.endLine}
        currentAuthor={props.currentAuthor}
        onSubmit={props.onAddThread}
        onCancel={props.onCancelPending}
      />
    );
  }

  return result;
}

export function HunkBlock(props: HunkBlockProps) {
  const {
    hunk, syntaxMap, expandControls, topExpansionLines, bottomExpansionLines, expansionSyntaxMap,
    threads, pendingSelection, currentAuthor, isLineSelected,
    onLineMouseDown, onLineMouseEnter, onCommentClick,
    onAddThread, onReply, onResolve, onUnresolve, onDeleteComment, onDeleteThread,
    onCancelPending, filePath, onRevertChange, getOriginalCode,
  } = props;

  const commentProps = {
    isLineSelected, onLineMouseDown, onLineMouseEnter, onCommentClick,
    threads, pendingSelection, currentAuthor,
    onAddThread, onReply, onResolve, onUnresolve, onDeleteComment, onDeleteThread,
    onCancelPending, filePath, getOriginalCode,
  };

  const changeGroups = useMemo(() => {
    if (!onRevertChange) {
      return [];
    }
    return getChangeGroups(hunk.lines);
  }, [hunk.lines, onRevertChange]);

  const changeGroupForLine = useMemo(() => {
    const map = new Map<number, number>();
    for (let g = 0; g < changeGroups.length; g++) {
      for (let i = changeGroups[g].startIndex; i <= changeGroups[g].endIndex; i++) {
        map.set(i, g);
      }
    }
    return map;
  }, [changeGroups]);

  const expansionRows: React.ReactNode[] = [];

  if (topExpansionLines) {
    for (let i = 0; i < topExpansionLines.length; i++) {
      expansionRows.push(...renderLineWithComments(topExpansionLines[i], i, true, expansionSyntaxMap, commentProps));
    }
  }

  if (bottomExpansionLines) {
    for (let i = 0; i < bottomExpansionLines.length; i++) {
      expansionRows.push(...renderLineWithComments(bottomExpansionLines[i], i, true, expansionSyntaxMap, commentProps));
    }
  }

  const sections: React.ReactNode[] = [];
  let currentGroupIndex = -1;
  let currentRows: React.ReactNode[] = [];

  const flushRows = (isChangeGroup: boolean, groupIdx: number) => {
    if (currentRows.length === 0) {
      return;
    }
    if (isChangeGroup && onRevertChange) {
      const group = changeGroups[groupIdx];
      sections.push(
        <tbody key={`change-${groupIdx}`} className="group/undo">
          <tr className="relative z-10" aria-hidden={false}>
            <td colSpan={4} className="relative h-0 p-0">
              <div className="absolute right-2 top-0.5 z-10 opacity-0 group-hover/undo:opacity-100 focus-within:opacity-100 pointer-events-none group-hover/undo:pointer-events-auto">
                <button
                  onClick={() => onRevertChange(hunk, group.startIndex, group.endIndex)}
                  className="flex items-center gap-1 h-5 px-1.5 text-[11px] rounded border border-control-border bg-raised text-text-secondary hover:text-deleted hover:border-deleted/40 transition-colors cursor-pointer"
                  title="Discard this change (restores these lines from the base)"
                >
                  <UndoIcon className="w-3 h-3" />
                  Discard change
                </button>
              </div>
            </td>
          </tr>
          {currentRows}
        </tbody>
      );
    } else {
      sections.push(
        <tbody key={`context-${sections.length}`}>
          {currentRows}
        </tbody>
      );
    }
    currentRows = [];
  };

  for (let i = 0; i < hunk.lines.length; i++) {
    const groupIdx = changeGroupForLine.get(i) ?? -1;
    const isChange = groupIdx !== -1;

    if (isChange && currentGroupIndex === -1) {
      flushRows(false, -1);
      currentGroupIndex = groupIdx;
    } else if (!isChange && currentGroupIndex !== -1) {
      flushRows(true, currentGroupIndex);
      currentGroupIndex = -1;
    }

    currentRows.push(...renderLineWithComments(hunk.lines[i], i, false, syntaxMap, commentProps));
  }

  if (currentGroupIndex !== -1) {
    flushRows(true, currentGroupIndex);
  } else {
    flushRows(false, -1);
  }


  return (
    <>
      <tbody>
        <HunkHeader hunk={hunk} expandControls={expandControls} />
        {expansionRows}
      </tbody>
      {sections}
    </>
  );
}
