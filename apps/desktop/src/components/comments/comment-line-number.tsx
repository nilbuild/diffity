import { cn } from '../../lib/cn';
import { PlusIcon } from '../icons/plus-icon';

interface CommentLineNumberProps {
  lineNumber: number | null;
  className?: string;
  isSelected?: boolean;
  onMouseDown?: () => void;
  onMouseEnter?: () => void;
  onCommentClick?: () => void;
  showCommentButton?: boolean;
  forceShowButton?: boolean;
}

const baseClass = 'w-12.5 min-w-12.5 px-2 text-right text-text-muted select-none cursor-pointer align-top text-xs leading-6 relative group/line';

export function CommentLineNumber(props: CommentLineNumberProps) {
  const { lineNumber, className, isSelected, onMouseDown, onMouseEnter, onCommentClick, showCommentButton, forceShowButton } = props;

  return (
    <td
      className={cn(
        baseClass,
        className,
        isSelected && 'bg-diff-comment-gutter',
      )}
      onMouseDown={(e) => {
        if (onMouseDown && lineNumber !== null) {
          e.preventDefault();
          onMouseDown();
        }
      }}
      onMouseEnter={() => {
        if (onMouseEnter && lineNumber !== null) {
          onMouseEnter();
        }
      }}
    >
      {showCommentButton && lineNumber !== null && (
        <button
          className={cn(
            'absolute right-[-2px] top-0.5 w-5 h-5 flex items-center justify-center rounded bg-accent text-white cursor-pointer z-10 hover:bg-accent-hover',
            forceShowButton ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 group-hover/line:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            if (onCommentClick) {
              onCommentClick();
            }
          }}
          title="Add comment"
        >
          <PlusIcon className="w-2.5 h-2.5" />
        </button>
      )}
      {lineNumber ?? ''}
    </td>
  );
}
