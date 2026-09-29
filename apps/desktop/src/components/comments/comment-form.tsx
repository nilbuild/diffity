import { useState, useRef, useEffect } from 'react';
import type { SubmitOptions } from './types';
import { MentionTextarea } from './mention-textarea';
import { useReviewState } from '../../features/review/review-state';
import { modKey } from '../../lib/platform';
import { getRepoPathOrNull } from '../../lib/api';
import { mentionsAgent } from '../../lib/mentions';
import { useGitHubPr } from '../../hooks/use-repo-state';
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
  /** Persists unsent text (per repo) so it survives refreshes and reloads; cleared on submit or cancel. */
  draftKey?: string;
  isReply?: boolean;
}

const DRAFT_PREFIX = 'diffity-draft:';

function draftStorageKey(key: string) {
  return `${DRAFT_PREFIX}${getRepoPathOrNull() ?? ''}:${key}`;
}

function readDraft(key: string | undefined): string {
  if (!key) {
    return '';
  }
  try {
    return localStorage.getItem(draftStorageKey(key)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(key: string | undefined, value: string) {
  if (!key) {
    return;
  }
  try {
    if (value.trim()) {
      localStorage.setItem(draftStorageKey(key), value);
      return;
    }
    localStorage.removeItem(draftStorageKey(key));
  } catch {
    return;
  }
}

export function hasDraft(sessionId: string | null, key: string): boolean {
  return readDraft(`${sessionId ?? 'none'}:${key}`).trim().length > 0;
}

function destinationHint(input: { reviewMode: boolean; prNumber: number | null; mentions: boolean }): string {
  const { reviewMode, prNumber, mentions } = input;
  if (reviewMode && prNumber) {
    return mentions ? `Goes into your review on PR #${prNumber} · Claude will reply` : `Goes into your review on PR #${prNumber}, posted when you submit`;
  }
  if (mentions) {
    return 'Saved in Diffity · Claude will reply';
  }
  return 'Saved in Diffity only · @claude asks Claude';
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
    draftKey,
    isReply = false,
  } = props;
  const reviewState = useReviewState();
  const storageKey = draftKey ? `${reviewState.sessionId ?? 'none'}:${draftKey}` : undefined;
  const [body, setBodyState] = useState(() => readDraft(storageKey));
  const setBody = (value: string) => {
    setBodyState(value);
    writeDraft(storageKey, value);
  };
  const { details } = useGitHubPr();
  const prNumber = details?.prNumber ?? null;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const review = reviewState;
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

  const postNow = () => {
    const trimmed = body.trim();
    if (!trimmed || !prNumber) {
      return;
    }
    onSubmit(trimmed, { pending: false, postToGitHub: prNumber });
    setBody('');
  };

  const cancel = () => {
    writeDraft(storageKey, '');
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(reviewMode && (threadPending || hasPendingReview));
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
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
        {!isReply && prNumber && (
          <button
            onClick={postNow}
            disabled={!body.trim()}
            className={secondaryClass}
            title={`Post this comment to pull request #${prNumber} on GitHub right away, outside your review`}
          >
            Post to GitHub now
          </button>
        )}
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
      {review.enabled && (
        <div className="px-3 pb-2 text-xs text-text-muted" title={`${modKey}Enter submits`}>
          {destinationHint({ reviewMode, prNumber, mentions: mentionsAgent(body) })}
        </div>
      )}
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        <button onClick={cancel} className={buttonGhost}>
          Cancel
        </button>
        {renderButtons()}
      </div>
    </div>
  );
}
