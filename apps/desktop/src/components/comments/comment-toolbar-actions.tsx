import { useState } from 'react';
import { useCopy } from '../../hooks/use-copy';
import { useThreadNavigation } from '../../hooks/use-thread-navigation';
import type { CommentThread } from './types';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { buttonGroup } from '../ui/button-styles';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, CopyIcon, TrashIcon } from '../ui/icon';

interface CommentToolbarActionsProps {
  threads: CommentThread[];
  onScrollToThread: (threadId: string, filePath: string) => void;
  onDeleteAllComments: () => void;
  formatForCopy: () => string;
  /** false: only the count and prev/next; copy and delete-all live in the surrounding ⋯ menu. */
  extras?: boolean;
}

export function CommentToolbarActions(props: CommentToolbarActionsProps) {
  const {
    threads,
    onScrollToThread,
    onDeleteAllComments,
    formatForCopy,
    extras = true,
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
          <ChevronUpIcon size="sm" />
        </button>
        <button
          onClick={goToNext}
          className="flex items-center px-1.5 text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer"
          title="Next open comment"
        >
          <ChevronDownIcon size="sm" />
        </button>
        {extras && (
          <>
            <button
              onClick={() => copy(formatForCopy())}
              className="flex items-center px-1.5 border-l border-control-border text-text-secondary hover:bg-control-hover hover:text-text transition-colors cursor-pointer"
              title="Copy open comments as Markdown (paste into any AI chat)"
            >
              {copied ? <CheckIcon className="w-3.5 h-3.5 text-added" /> : <CopyIcon size="sm" />}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center px-1.5 text-text-secondary hover:bg-control-hover hover:text-deleted transition-colors cursor-pointer"
              title="Delete all comments"
            >
              <TrashIcon size="sm" />
            </button>
          </>
        )}
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
