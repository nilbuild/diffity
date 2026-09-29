import { useState, useRef, useEffect } from 'react';
import type { SubmitOptions } from './types';
import { MentionTextarea } from './mention-textarea';
import { useReviewState } from '../../features/review/review-state';

interface CommentFormProps {
  onSubmit: (body: string, options: SubmitOptions) => void;
  onCancel: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  lineLabel?: string;
  reviewable?: boolean;
  threadPending?: boolean;
}

const primaryClass = 'px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const secondaryClass = 'px-3 py-1.5 text-xs font-medium rounded-md bg-bg text-text-secondary hover:text-text hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

export function CommentForm(props: CommentFormProps) {
  const {
    onSubmit,
    onCancel,
    placeholder = 'Leave a comment',
    submitLabel = 'Comment',
    autoFocus = true,
    lineLabel,
    reviewable = false,
    threadPending = false,
  } = props;
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const review = useReviewState();
  const reviewMode = reviewable && review.enabled;
  const hasPendingReview = review.pendingReview !== null;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const submit = (pending: boolean) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed, { pending });
    setBody('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(reviewMode && (threadPending || hasPendingReview));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const renderButtons = () => {
    if (!reviewMode) {
      return (
        <button onClick={() => submit(false)} disabled={!body.trim()} className={primaryClass}>
          {submitLabel}
        </button>
      );
    }
    if (threadPending) {
      return (
        <button onClick={() => submit(true)} disabled={!body.trim()} className={primaryClass}>
          Add review comment
        </button>
      );
    }
    return (
      <>
        <button onClick={() => submit(false)} disabled={!body.trim()} className={secondaryClass}>
          Add single comment
        </button>
        <button onClick={() => submit(true)} disabled={!body.trim()} className={primaryClass}>
          {hasPendingReview ? 'Add review comment' : 'Start a review'}
        </button>
      </>
    );
  };

  return (
    <div className="rounded-lg bg-bg-tertiary pt-2">
      {lineLabel && (
        <div className="px-3 pb-1.5 -mt-0.5">
          <span className="text-xs text-text-secondary font-medium">{lineLabel}</span>
        </div>
      )}
      <div className="mx-1.5 mb-0.5 rounded-md">
        <MentionTextarea
          ref={textareaRef}
          value={body}
          onChange={setBody}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="block w-full px-3 py-2 text-sm bg-bg text-text rounded-md resize-y outline-none placeholder:text-text-muted min-h-[80px]"
        />
      </div>
      <div className="flex items-center gap-2 px-1.5 pb-1.5">
        <span className="flex-1 pl-1.5 text-[11px] text-text-muted truncate">
          {review.enabled ? 'Type @claude to ask Claude Code' : ''}
        </span>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md text-text-secondary hover:bg-hover transition-colors cursor-pointer"
        >
          Cancel
        </button>
        {renderButtons()}
      </div>
    </div>
  );
}
