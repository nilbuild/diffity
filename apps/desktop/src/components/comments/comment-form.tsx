import { useState, useRef, useEffect } from 'react';
import type { SubmitOptions } from './types';
import { MentionTextarea } from './mention-textarea';
import { useReviewState } from '../../features/review/review-state';
import { modKey } from '../../lib/platform';
import { buttonGhost, buttonOutline, buttonPrimary } from '../ui/button-styles';

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

const primaryClass = buttonPrimary;
const secondaryClass = buttonOutline;

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
  const reviewMode = reviewable && review.enabled && review.prMode;
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
        <button onClick={() => submit(true)} disabled={!body.trim()} className={primaryClass} title="Saved as a draft with the rest of your review">
          Add draft reply
        </button>
      );
    }
    return (
      <>
        <button
          onClick={() => submit(false)}
          disabled={!body.trim()}
          className={secondaryClass}
          title="Publish this comment right away (an @claude mention is answered immediately)"
        >
          {submitLabel === 'Reply' ? 'Reply now' : 'Comment now'}
        </button>
        <button
          onClick={() => submit(true)}
          disabled={!body.trim()}
          className={primaryClass}
          title="Save as a private draft; submit all drafts together when you are done (to Claude or a GitHub PR)"
        >
          {hasPendingReview ? 'Add to review' : 'Start a review'}
        </button>
      </>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-bg-secondary pt-2">
      {lineLabel && (
        <div className="px-3 pb-1.5">
          <span className="text-xs text-text-secondary font-medium">{lineLabel}</span>
        </div>
      )}
      <div className="mx-2 mb-2">
        <MentionTextarea
          ref={textareaRef}
          value={body}
          onChange={setBody}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="block w-full px-3 py-2 text-[13px] leading-5 bg-bg text-text rounded-md border border-border focus:border-focus resize-y outline-none placeholder:text-text-muted min-h-[72px]"
        />
      </div>
      <div className="flex items-center gap-2 px-2 pb-2">
        <span className="flex-1 pl-1 text-xs text-text-muted truncate" title={`${modKey}Enter submits`}>
          {review.enabled ? '@claude to ask Claude' : ''}
        </span>
        <button onClick={onCancel} className={buttonGhost}>
          Cancel
        </button>
        {renderButtons()}
      </div>
    </div>
  );
}
