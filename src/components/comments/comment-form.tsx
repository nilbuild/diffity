import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { SubmitOptions } from './types';
import { MentionTextarea } from './mention-textarea';
import { useReviewState } from '../../features/review/review-state';
import { modKey } from '../../lib/platform';
import { getRepoPathOrNull } from '../../lib/api';
import { mentionedAgent, mentionsAgent } from '../../lib/mentions';
import { agentMeta } from '../../features/claude/agents';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { buttonGhost, buttonIconSmall, buttonOutline, buttonPrimary } from '../ui/button-styles';
import { insertSuggestion } from '../../features/suggestions/suggestion';
import { cn } from '../../lib/cn';
import { PlusMinusIcon, TrashIcon } from '../ui/icon';

interface CommentFormProps {
  onSubmit: (body: string, options: SubmitOptions) => void;
  onCancel: () => void;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  lineLabel?: string;
  reviewable?: boolean;
  threadPending?: boolean;
  /** Name of the agent that wrote the thread's last comment: a reply goes to it unless the user opts out. */
  replyAgent?: string | null;
  /** Persists unsent text (per repo) so it survives refreshes, reloads and Cancel; cleared on submit or Discard. */
  draftKey?: string;
  isReply?: boolean;
  /** The commented new-side lines: shows "Suggest change", which inserts them as a ```suggestion block to edit. */
  suggestionCode?: string;
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

/** Said only when it isn't obvious: a draft waits for the review, and a mentioned agent will reply. */
function destinationHint(input: { reviewMode: boolean; prNumber: number | null; mentioned: string | null }): string | null {
  const { reviewMode, prNumber, mentioned } = input;
  if (reviewMode && prNumber) {
    return mentioned ? `${mentioned} will reply` : `Posted to #${prNumber} when you submit`;
  }
  return mentioned ? `${mentioned} will reply` : null;
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
    replyAgent = null,
    suggestionCode,
  } = props;
  const [sendToClaude, setSendToClaude] = useState(true);
  const reviewState = useReviewState();
  const storageKey = draftKey ? `${reviewState.sessionId ?? 'none'}:${draftKey}` : undefined;
  const [body, setBodyState] = useState(() => readDraft(storageKey));
  const mentioned = mentionedAgent(body);
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

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [body]);

  const submit = (pending: boolean) => {
    const trimmed = body.trim();
    if (!trimmed) {
      return;
    }
    onSubmit(trimmed, { pending, askClaude: !pending && !!replyAgent && sendToClaude });
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

  const suggestChange = () => {
    const textarea = textareaRef.current;
    if (suggestionCode === undefined || !textarea) {
      return;
    }
    const next = insertSuggestion(body, textarea.selectionStart ?? body.length, suggestionCode);
    setBody(next.body);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const discard = () => {
    setBody('');
    onCancel();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit(reviewMode);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const renderButtons = () => {
    if (!reviewMode) {
      const ownPr = review.ownPrNumber;
      return (
        <>
          {ownPr && !isReply && (
            <button
              onClick={() => {
                const trimmed = body.trim();
                if (!trimmed) {
                  return;
                }
                onSubmit(trimmed, { pending: false, postToGitHub: ownPr });
                setBody('');
              }}
              disabled={!body.trim()}
              className={secondaryClass}
              title={`Also post this comment to your pull request #${ownPr} on GitHub`}
            >
              Comment & post to GitHub
            </button>
          )}
          <button onClick={() => submit(false)} disabled={!body.trim()} className={primaryClass}>
            {submitLabel}
          </button>
        </>
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
          title="Save as a private draft; submit all drafts together when you are done (to an agent or a GitHub PR)"
        >
          {hasPendingReview ? 'Add to review' : 'Start a review'}
        </button>
      </>
    );
  };

  const hint = !review.enabled
    ? null
    : replyAgent && !mentionsAgent(body)
      ? (
        <>
          {sendToClaude ? `${replyAgent} will reply` : `Not sent to ${replyAgent}`}
          {' · '}
          <button
            type="button"
            onClick={() => setSendToClaude(!sendToClaude)}
            className="underline decoration-text-muted/50 underline-offset-2 hover:text-text cursor-pointer"
          >
            {sendToClaude ? 'don’t send' : 'send'}
          </button>
        </>
      )
      : destinationHint({ reviewMode, prNumber, mentioned: mentioned ? agentMeta(mentioned).short : null });

  return (
    <div className="rounded-lg border border-border bg-bg transition-colors focus-within:border-focus">
      <MentionTextarea
        ref={textareaRef}
        value={body}
        onChange={setBody}
        onKeyDown={handleKeyDown}
        placeholder={lineLabel ? `${lineLabel}…` : placeholder}
        rows={2}
        className="block w-full max-h-80 px-3 pt-2.5 pb-1.5 text-[13px] leading-5 bg-transparent text-text border-0 resize-none outline-none placeholder:text-text-muted min-h-[64px] overflow-y-auto"
      />
      <div className="flex items-center gap-2 px-3 pb-2">
        {suggestionCode !== undefined && (
          <button
            type="button"
            onClick={suggestChange}
            className={cn(buttonIconSmall, '-ml-1.5')}
            title="Suggest a change: inserts these lines for you to edit. Applies in one click, and shows as a suggestion on GitHub."
            aria-label="Suggest a change"
          >
            <PlusMinusIcon className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="min-w-0 flex-1 truncate text-xs text-text-muted" title={`${modKey}Enter submits`}>
          {hint}
        </div>
        {body.trim() && storageKey && (
          <button
            type="button"
            onClick={discard}
            className={cn(buttonIconSmall, 'hover:text-deleted')}
            title="Discard this comment"
            aria-label="Discard this comment"
          >
            <TrashIcon size="sm" />
          </button>
        )}
        <button onClick={onCancel} className={buttonGhost} title={body.trim() && storageKey ? 'Close. Your text is kept for next time.' : undefined}>
          Cancel
        </button>
        {renderButtons()}
      </div>
    </div>
  );
}
