import { useState } from 'react';
import { useCopy } from '../../hooks/use-copy';
import { useThreadNavigation } from '../../hooks/use-thread-navigation';
import type { CommentThread } from './types';
import { CopyIcon } from '../icons/copy-icon';
import { CheckIcon } from '../icons/check-icon';
import { ChevronUpIcon } from '../icons/chevron-up-icon';
import { ChevronDownIcon } from '../icons/chevron-down-icon';
import { TrashIcon } from '../icons/trash-icon';
import { ConfirmDialog } from '../ui/confirm-dialog';

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
      <div className="flex items-stretch bg-bg-tertiary rounded-md overflow-hidden">
        <span className="flex items-center text-xs text-text-muted px-2 py-1">
          {currentIndex >= 0
            ? `${currentIndex + 1} of ${unresolvedCount} ${unresolvedCount === 1 ? 'comment' : 'comments'}`
            : `${unresolvedCount} ${unresolvedCount === 1 ? 'comment' : 'comments'}`}
        </span>
        <button
          onClick={goToPrevious}
          className="flex items-center px-1.5 text-text-muted hover:bg-hover hover:text-text transition-colors cursor-pointer"
          title="Previous comment"
        >
          <ChevronUpIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={goToNext}
          className="flex items-center px-1.5 text-text-muted hover:bg-hover hover:text-text transition-colors cursor-pointer"
          title="Next comment"
        >
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex items-stretch bg-bg-tertiary rounded-md overflow-hidden">
        <button
          onClick={() => copy(formatForCopy())}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-text-secondary hover:bg-hover hover:text-text transition-colors cursor-pointer"
          title="Copy unresolved comments to clipboard"
        >
          {copied ? (
            <>
              <CheckIcon className="w-3 h-3 text-added" />
              Copied
            </>
          ) : (
            <>
              <CopyIcon className="w-3 h-3" />
              Copy comments
            </>
          )}
        </button>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center px-2 text-text-muted hover:bg-hover hover:text-red-500 transition-colors cursor-pointer"
          title="Delete all comments"
        >
          <TrashIcon className="w-3.5 h-3.5" />
        </button>
      </div>
      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete all comments"
          message="Are you sure you want to delete all comments? This action cannot be undone."
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
