import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useCopy } from '../../hooks/use-copy';
import { useThreadNavigation } from '../../hooks/use-thread-navigation';
import type { CommentThread } from './types';
import { CheckIcon } from '../icons/check-icon';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { buttonGroup } from '../ui/button-styles';

interface CommentToolbarActionsProps {
  threads: CommentThread[];
  onScrollToThread: (threadId: string, filePath: string) => void;
  onDeleteAllComments: () => void;
  formatForCopy: () => string;
}

export function CommentToolbarActions(props: CommentToolbarActionsProps) {
  const {
    threads,
    onScrollToThread,
    onDeleteAllComments,
    formatForCopy,
  } = props;

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { copied, copy } = useCopy();
  const { currentIndex, count: unresolvedCount, goToPrevious, goToNext } = useThreadNavigation(threads, onScrollToThread);

  if (unresolvedCount === 0) {
    return null;
  }

  return (
    <>
      <div className={buttonGroup}>
        <span className="flex items-center text-[13px] text-text-secondary px-2.5 whitespace-nowrap tabular-nums">
          {currentIndex >= 0
            ? `${currentIndex + 1}/${unresolvedCount} open`
            : `${unresolvedCount} open`}
        </span>
        <button
          onClick={goToPrevious}
          className="flex items-center px-1.5 text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer"
          title="Previous open comment"
        >
          <ChevronUp size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={goToNext}
          className="flex items-center px-1.5 text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer"
          title="Next open comment"
        >
          <ChevronDown size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => copy(formatForCopy())}
          className="flex items-center px-1.5 border-l border-control-border text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer"
          title="Copy open comments as Markdown (paste into any AI chat)"
        >
          {copied ? <CheckIcon className="w-3.5 h-3.5 text-added" /> : <Copy size={14} strokeWidth={1.75} />}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center px-1.5 text-text-secondary hover:bg-control-hover hover:text-deleted transition-colors cursor-pointer"
          title="Delete all comments"
        >
          <Trash2 size={14} strokeWidth={1.75} />
        </button>
      </div>
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete all comments"
          message="Delete every comment in this view, including resolved ones and drafts? This cannot be undone."
          confirmLabel="Delete all"
          onConfirm={() => {
            onDeleteAllComments();
            setShowDeleteConfirm(false);
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
