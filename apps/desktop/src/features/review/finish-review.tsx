import { useCallback, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import type { ReviewVerdict } from '../../lib/types';
import type { GitHubDetails } from '../../lib/api';
import { useDismiss } from '../../hooks/use-dismiss';
import { ChevronDownIcon } from '../../components/icons/chevron-down-icon';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { useReviewActions, useReviewState } from './review-state';

interface FinishReviewProps {
  githubDetails: GitHubDetails | null;
}

const VERDICTS: { value: ReviewVerdict; label: string; description: string }[] = [
  { value: 'comment', label: 'Comment', description: 'Submit general feedback without explicit approval.' },
  { value: 'approve', label: 'Approve', description: 'Give your approval to merge these changes.' },
  { value: 'requestChanges', label: 'Request changes', description: 'Submit feedback that must be addressed.' },
];

export function FinishReview(props: FinishReviewProps) {
  const { githubDetails } = props;
  const { enabled, sessionId, pendingReview } = useReviewState();
  const { submit, discard } = useReviewActions(sessionId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [verdict, setVerdict] = useState<ReviewVerdict>('comment');
  const [sendToClaude, setSendToClaude] = useState(false);
  const [postToGitHub, setPostToGitHub] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  if (!enabled) {
    return null;
  }

  const pendingCount = pendingReview?.pendingCount ?? 0;
  const canSubmit = pendingCount > 0 || body.trim().length > 0 || verdict !== 'comment';

  const handleSubmit = () => {
    submit.mutate(
      {
        body,
        verdict,
        sendToClaude,
        prNumber: postToGitHub && githubDetails ? githubDetails.prNumber : null,
      },
      {
        onSuccess: () => {
          setBody('');
          setVerdict('comment');
          setOpen(false);
        },
      },
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer',
          pendingCount > 0 ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-bg-tertiary text-text-secondary hover:bg-hover hover:text-text',
        )}
      >
        Finish your review
        {pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-white/25 text-[10px] font-semibold tabular-nums">
            {pendingCount}
          </span>
        )}
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[420px] bg-bg-secondary rounded-lg shadow-lg ring-1 ring-border z-50 font-sans">
          <div className="flex items-center justify-between px-3 pt-3 pb-2">
            <span className="text-sm font-semibold text-text">Finish your review</span>
            {pendingCount > 0 && (
              <span className="text-[11px] text-text-muted">
                {pendingCount} pending comment{pendingCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="px-3">
            <MentionTextarea
              value={body}
              onChange={setBody}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Leave a comment"
              rows={4}
              className="block w-full px-3 py-2 text-sm bg-bg text-text border border-border rounded-md resize-y outline-none focus:border-accent placeholder:text-text-muted min-h-[90px]"
            />
          </div>
          <div className="px-3 pt-2.5 space-y-1.5">
            {VERDICTS.map((option) => (
              <label key={option.value} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="review-verdict"
                  checked={verdict === option.value}
                  onChange={() => setVerdict(option.value)}
                  className="mt-0.5 accent-accent cursor-pointer"
                />
                <span>
                  <span className="block text-xs font-medium text-text">{option.label}</span>
                  <span className="block text-[11px] text-text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="mx-3 mt-3 pt-2.5 border-t border-border space-y-1.5">
            <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">Send to</div>
            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={sendToClaude}
                onChange={(e) => setSendToClaude(e.target.checked)}
                className="accent-accent cursor-pointer"
              />
              Send to Claude
              <span className="text-[11px] text-text-muted">— Claude addresses every comment</span>
            </label>
            {githubDetails && (
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={postToGitHub}
                  onChange={(e) => setPostToGitHub(e.target.checked)}
                  className="accent-accent cursor-pointer"
                />
                Post to GitHub PR #{githubDetails.prNumber}
              </label>
            )}
          </div>
          <div className="flex items-center gap-2 px-3 py-3">
            {pendingReview && (
              <button
                onClick={() => discard.mutate(undefined, { onSuccess: close })}
                disabled={discard.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-deleted hover:bg-hover transition-colors cursor-pointer disabled:opacity-50"
              >
                Discard review
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={close}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-text-secondary hover:bg-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submit.isPending}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submit.isPending ? 'Submitting…' : 'Submit review'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
