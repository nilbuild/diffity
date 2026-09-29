import type { CommentAuthor, CommentSide, SubmitOptions } from './types';
import { CommentForm } from './comment-form';

interface CommentFormRowProps {
  colSpan: number;
  filePath: string;
  side: CommentSide;
  startLine: number;
  endLine: number;
  currentAuthor: CommentAuthor;
  onSubmit: (filePath: string, side: CommentSide, startLine: number, endLine: number, body: string, author: CommentAuthor, options?: SubmitOptions) => void;
  onCancel: () => void;
  viewMode?: 'unified' | 'split';
}

export function CommentFormRow(props: CommentFormRowProps) {
  const { colSpan, filePath, side, startLine, endLine, currentAuthor, onSubmit, onCancel, viewMode } = props;

  const lineLabel = startLine === endLine
    ? `${startLine}`
    : `${startLine} to ${endLine}`;

  const formContent = (
    <div className="max-w-[700px]">
      <CommentForm
        onSubmit={(body, options) => onSubmit(filePath, side, startLine, endLine, body, currentAuthor, options)}
        onCancel={onCancel}
        reviewable
        draftKey={`line:${filePath}:${side}:${startLine}-${endLine}`}
        lineLabel={`Add a comment on line${startLine !== endLine ? 's' : ''} ${lineLabel}`}
      />
    </div>
  );

  if (viewMode === 'split') {
    return (
      <tr>
        {side === 'old' ? (
          <>
            <td colSpan={colSpan} className="px-3 py-2 font-sans bg-bg-secondary">{formContent}</td>
            <td colSpan={colSpan} className="bg-bg-secondary"></td>
          </>
        ) : (
          <>
            <td colSpan={colSpan} className="bg-bg-secondary"></td>
            <td colSpan={colSpan} className="px-3 py-2 font-sans bg-bg-secondary">{formContent}</td>
          </>
        )}
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-2 font-sans bg-bg-secondary">
        {formContent}
      </td>
    </tr>
  );
}
