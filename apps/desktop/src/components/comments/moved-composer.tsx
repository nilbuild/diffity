import type { ParsedDiff } from '@diffity/parser';
import { getFilePath } from '../../lib/diff-utils';
import { CommentForm } from './comment-form';
import { DEFAULT_AUTHOR, type LineSelection, type SubmitOptions } from './types';
import type { CommentActions } from '../../hooks/use-comment-actions';

export function selectionInDiff(diff: ParsedDiff, selection: LineSelection): boolean {
  const file = diff.files.find((item) => getFilePath(item) === selection.filePath);
  if (!file) {
    return false;
  }
  return file.hunks.some((hunk) => hunk.lines.some((line) => {
    const number = selection.side === 'old' ? line.oldLineNumber : line.newLineNumber;
    return number === selection.endLine;
  }));
}

interface MovedComposerProps {
  selection: LineSelection;
  onSubmit: CommentActions['addThread'];
  onCancel: () => void;
}

/** Keeps an unsent comment visible when the lines it was written for changed or left the diff. */
export function MovedComposer(props: MovedComposerProps) {
  const { selection, onSubmit, onCancel } = props;
  const range = selection.startLine === selection.endLine ? `line ${selection.startLine}` : `lines ${selection.startLine}–${selection.endLine}`;

  return (
    <div className="mx-5 mt-4 max-w-[760px]">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-text-secondary">
        <span className="w-1.5 h-1.5 rounded-full bg-modified" />
        <span>
          Your unsent comment on <code className="font-mono text-text">{selection.filePath}</code> {range}. The code there changed, so it is kept here.
        </span>
      </div>
      <CommentForm
        onSubmit={(body: string, options: SubmitOptions) => onSubmit(selection.filePath, selection.side, selection.startLine, selection.endLine, body, DEFAULT_AUTHOR, undefined, options)}
        onCancel={onCancel}
        reviewable
        draftKey={`line:${selection.filePath}:${selection.side}:${selection.startLine}-${selection.endLine}`}
        lineLabel={`Comment on ${range} (moved)`}
      />
    </div>
  );
}
