import { useMemo } from 'react';
import type { DiffHunk, DiffLine as DiffLineType } from '@/lib/diff-parser';
import type { SyntaxToken } from '../../lib/syntax-token';
import type { CommentSide, LineRenderProps } from '../comments/types';
import { getChangeGroups } from '../../lib/diff-utils';
import { DiffLine } from './diff-line';
import { HunkHeader, type ExpandControls } from './hunk-header';
import { CommentThread } from '../comments/comment-thread';
import { CommentFormRow } from '../comments/comment-form-row';
import { ChangeActionsRow, type ChangeActionsConfig } from './change-actions';
import { GuideLineNotes } from '../../features/guide/guide-notes';

interface HunkBlockProps extends LineRenderProps {
  hunk: DiffHunk;
  syntaxMap?: Map<string, SyntaxToken[]>;
  expandControls?: ExpandControls;
  topExpansionLines?: DiffLineType[];
  bottomExpansionLines?: DiffLineType[];
  expansionSyntaxMap?: Map<string, SyntaxToken[]>;
  changeActions?: ChangeActionsConfig;
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

  if (activeLine !== null) {
    result.push(<GuideLineNotes key={`notes-${key}`} filePath={props.filePath} side={side} line={activeLine} colSpan={4} />);
  }

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
        suggestionCode={props.getOriginalCode?.(props.pendingSelection.side, props.pendingSelection.startLine, props.pendingSelection.endLine)}
      />
    );
  }

  return result;
}

export function HunkBlock(props: HunkBlockProps) {
  const {
    hunk, syntaxMap, expandControls, topExpansionLines, bottomExpansionLines, expansionSyntaxMap, changeActions,
  } = props;

  const commentProps: LineRenderProps = props;

  const changeGroups = useMemo(() => {
    if (!changeActions) {
      return [];
    }
    return getChangeGroups(hunk.lines);
  }, [hunk.lines, changeActions]);

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
    if (isChangeGroup && changeActions) {
      const group = changeGroups[groupIdx];
      sections.push(
        <tbody key={`change-${groupIdx}`} className="group/undo">
          <ChangeActionsRow config={changeActions} hunk={hunk} startIndex={group.startIndex} endIndex={group.endIndex} />
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
      <tbody data-hunk>
        <HunkHeader hunk={hunk} expandControls={expandControls} />
        {expansionRows}
      </tbody>
      {sections}
    </>
  );
}
