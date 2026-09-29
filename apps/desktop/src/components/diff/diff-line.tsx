import type { DiffLine as DiffLineType } from '@diffity/parser';
import { cn } from '../../lib/cn';
import { getLineBg } from '../../lib/diff-utils';
import { renderContent } from '../../lib/render-content';
import type { SyntaxToken } from '../../lib/syntax-token';
import { CommentLineNumber } from '../comments/comment-line-number';
import type { CommentSide } from '../comments/types';

export type { SyntaxToken };

interface DiffLineProps {
  line: DiffLineType;
  syntaxTokens?: SyntaxToken[];
  expanded?: boolean;
  isSelected?: boolean;
  onLineMouseDown?: (line: number, side: CommentSide) => void;
  onLineMouseEnter?: (line: number, side: CommentSide) => void;
  onCommentClick?: (line: number, side: CommentSide) => void;
}

function getPrefix(type: string): string {
  switch (type) {
    case 'add':
      return '+';
    case 'delete':
      return '-';
    default:
      return ' ';
  }
}

function getPrefixColor(type: string): string {
  switch (type) {
    case 'add':
      return 'text-added';
    case 'delete':
      return 'text-deleted';
    default:
      return 'text-text-muted';
  }
}

export function DiffLine(props: DiffLineProps) {
  const { line, syntaxTokens, expanded, isSelected, onLineMouseDown, onLineMouseEnter, onCommentClick } = props;

  const side: CommentSide = line.type === 'delete' ? 'old' : 'new';
  const gutterBg = expanded ? 'bg-diff-expanded-gutter' : '';

  return (
    <tr className={cn('group/row font-mono text-sm leading-6 hover:brightness-[0.97]', expanded ? 'bg-diff-expanded-bg' : getLineBg(line.type))}>
      <CommentLineNumber
        lineNumber={line.oldLineNumber}
        className={cn('border-r border-border-muted', gutterBg)}
        showCommentButton={!!onCommentClick && line.type === 'delete' && line.oldLineNumber !== null}
        isSelected={isSelected && side === 'old'}
        onMouseDown={line.oldLineNumber !== null ? () => onLineMouseDown?.(line.oldLineNumber!, line.type === 'delete' ? 'old' : 'new') : undefined}
        onMouseEnter={line.oldLineNumber !== null ? () => onLineMouseEnter?.(line.oldLineNumber!, line.type === 'delete' ? 'old' : 'new') : undefined}
        onCommentClick={line.oldLineNumber !== null && line.type === 'delete' ? () => onCommentClick?.(line.oldLineNumber!, 'old') : undefined}
      />
      <CommentLineNumber
        lineNumber={line.newLineNumber}
        className={cn('border-r border-border-muted', gutterBg)}
        showCommentButton={!!onCommentClick && line.type !== 'delete' && line.newLineNumber !== null}
        isSelected={isSelected && side === 'new'}
        onMouseDown={line.newLineNumber !== null ? () => onLineMouseDown?.(line.newLineNumber!, line.type === 'delete' ? 'old' : 'new') : undefined}
        onMouseEnter={line.newLineNumber !== null ? () => onLineMouseEnter?.(line.newLineNumber!, line.type === 'delete' ? 'old' : 'new') : undefined}
        onCommentClick={line.newLineNumber !== null && line.type !== 'delete' ? () => onCommentClick?.(line.newLineNumber!, 'new') : undefined}
      />
      <td className={cn('w-5 min-w-5 px-1 text-center select-none align-top', getPrefixColor(line.type), isSelected && 'bg-diff-comment-bg')}>
        {getPrefix(line.type)}
      </td>
      <td className={cn('px-3 whitespace-pre-wrap break-all', isSelected && 'bg-diff-comment-bg')}>
        <span className="inline">{renderContent(line, syntaxTokens)}</span>
      </td>
    </tr>
  );
}
