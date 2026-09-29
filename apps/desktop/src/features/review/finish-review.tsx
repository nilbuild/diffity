import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import type { ReviewVerdict } from '../../lib/types';
import type { GitHubDetails } from '../../lib/api';
import { useDismiss } from '../../hooks/use-dismiss';
import { useGitHubAuth } from '../../hooks/use-repo-state';
import { openSettingsAt } from '../../lib/ui-store';
import { ChevronDownIcon } from '../../components/icons/chevron-down-icon';
import { SparkleIcon } from '../../components/icons/sparkle-icon';
import { GitHubIcon } from '../../components/icons/github-icon';
import { CheckIcon } from '../../components/icons/check-icon';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { useReviewActions, useReviewState } from './review-state';

interface FinishReviewProps {
  githubDetails: GitHubDetails | null;
  hasGitHubRemote?: boolean;
}

const VERDICTS: { value: ReviewVerdict; label: string; description: string }[] = [
  { value: 'comment', label: 'Comment', description: 'General feedback without approving.' },
  { value: 'approve', label: 'Approve', description: 'Approve merging these changes.' },
  { value: 'requestChanges', label: 'Request changes', description: 'Feedback that must be addressed before merging.' },
];

type LocalChoice = 'claude' | 'publish';

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function Choice(props: { selected: boolean; onSelect: () => void; icon: ReactNode; title: string; description: string; type: 'radio' | 'checkbox' }) {
  const { selected, onSelect, icon, title, description, type } = props;

  return (
    <button
      type="button"
      role={type}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2.5 w-full text-left px-3 py-2 rounded-md border transition-colors cursor-pointer',
        selected ? 'border-accent bg-accent/5' : 'border-border hover:bg-hover',
      )}
    >
      <span
        className={cn(
          'mt-0.5 w-3.5 h-3.5 shrink-0 flex items-center justify-center border',
          type === 'radio' ? 'rounded-full' : 'rounded',
          selected ? 'border-accent bg-accent text-white' : 'border-text-muted',
        )}
      >
        {selected && (type === 'radio' ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : <CheckIcon className="w-2.5 h-2.5" />)}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-xs font-medium text-text">
          <span className="text-text-muted">{icon}</span>
          {title}
        </span>
        <span className="block text-[11px] text-text-muted mt-0.5 leading-snug">{description}</span>
      </span>
    </button>
  );
}

function useClaudeProblem(enabled: boolean): string | null {
  const { data: agents } = useQuery({ queryKey: ['agents'], queryFn: () => tauri.listAgents(), enabled, staleTime: 30_000 });
  if (!enabled || !agents) {
    return null;
  }
  const claude = agents.find((agent) => agent.id === 'claude');
  if (!claude || !claude.installed) {
    return 'Claude Code is not installed.';
  }
  if (claude.authenticated === false) {
    return 'Claude Code is not logged in. Run `claude` in a terminal first.';
  }
  return null;
}

export function FinishReview(props: FinishReviewProps) {
  const { githubDetails, hasGitHubRemote = false } = props;
  const { enabled, sessionId, pendingReview } = useReviewState();
  const { submit, discard } = useReviewActions(sessionId);
  const { data: auth } = useGitHubAuth();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [verdict, setVerdict] = useState<ReviewVerdict>('comment');
  const [localChoice, setLocalChoice] = useState<LocalChoice>('claude');
  const [postToGitHub, setPostToGitHub] = useState(true);
  const [alsoClaude, setAlsoClaude] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const pr = githubDetails;
  const sendToClaude = pr ? alsoClaude : localChoice === 'claude';
  const claudeProblem = useClaudeProblem(open && sendToClaude);

  if (!enabled) {
    return null;
  }

  const pendingCount = pendingReview?.pendingCount ?? 0;
  const hasBody = body.trim().length > 0;
  const posting = pr !== null && postToGitHub;
  const canSubmit = pendingCount > 0 || hasBody || (posting && verdict !== 'comment');
  const what = pendingCount > 0 ? plural(pendingCount, 'comment') : hasBody ? 'note' : 'review';

  const submitLabel = () => {
    if (submit.isPending) {
      return posting ? 'Posting…' : 'Submitting…';
    }
    if (posting && pr) {
      return sendToClaude ? `Post to #${pr.prNumber} & send to Claude` : `Post review to #${pr.prNumber}`;
    }
    if (sendToClaude) {
      return what === 'review' ? 'Send to Claude' : `Send ${what} to Claude`;
    }
    return what === 'review' ? 'Publish' : `Publish ${what}`;
  };

  const handleSubmit = () => {
    submit.mutate(
      {
        body,
        verdict: posting ? verdict : null,
        sendToClaude,
        prNumber: posting && pr ? pr.prNumber : null,
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

  const buttonLabel = pr ? `Review #${pr.prNumber}` : 'Submit comments';

  const renderGitHubNote = () => {
    if (pr || !hasGitHubRemote) {
      return null;
    }
    if (!auth?.authenticated) {
      return (
        <p className="text-[11px] text-text-muted">
          Reviewing a GitHub pull request?{' '}
          <button onClick={() => openSettingsAt('github')} className="text-accent hover:underline cursor-pointer">
            Sign in to GitHub
          </button>{' '}
          to post there too.
        </p>
      );
    }
    return <p className="text-[11px] text-text-muted">No open pull request for this branch, so nothing is posted to GitHub.</p>;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          pendingCount > 0 ? buttonPrimary : buttonOutline,
        )}
        title={pendingCount > 0 ? `${plural(pendingCount, 'draft comment')} waiting to be submitted` : 'Submit your comments, send them to Claude or post them to GitHub'}
      >
        {buttonLabel}
        {pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-white/25 text-[10px] font-semibold tabular-nums">
            {pendingCount}
          </span>
        )}
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-[440px] bg-bg-secondary rounded-lg shadow-lg ring-1 ring-border z-50 font-sans">
          <div className="px-3 pt-3 pb-2">
            <div className="text-sm font-semibold text-text">{pr ? `Review pull request #${pr.prNumber}` : 'Submit your comments'}</div>
            <div className="text-[11px] text-text-muted mt-0.5">
              {pendingCount > 0
                ? `${plural(pendingCount, 'draft comment')}. Drafts are private until you submit them.`
                : 'No drafts yet. Use “Start a review” on a line to collect comments before sending them.'}
            </div>
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
              placeholder={pr ? 'Review summary (optional)' : 'Overall note (optional)'}
              rows={3}
              className="block w-full px-3 py-2 text-sm bg-bg text-text border border-border rounded-md resize-y outline-none focus:border-accent placeholder:text-text-muted min-h-[70px]"
            />
          </div>

          {pr ? (
            <div className="px-3 pt-2.5 space-y-2">
              <Choice
                type="checkbox"
                selected={postToGitHub}
                onSelect={() => setPostToGitHub(!postToGitHub)}
                icon={<GitHubIcon className="w-3 h-3" />}
                title={`Post to GitHub pull request #${pr.prNumber}`}
                description={`New comments and replies are added to “${pr.prTitle}” as your GitHub review.`}
              />
              {postToGitHub && (
                <div className="pl-6 space-y-1.5">
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
              )}
              <Choice
                type="checkbox"
                selected={alsoClaude}
                onSelect={() => setAlsoClaude(!alsoClaude)}
                icon={<SparkleIcon className="w-3 h-3 text-accent" />}
                title="Also send to Claude"
                description="Claude works through every comment and asks before each edit."
              />
            </div>
          ) : (
            <div className="px-3 pt-2.5 space-y-2">
              <div className="text-[10px] font-semibold text-text-muted uppercase tracking-widest">What happens next</div>
              <Choice
                type="radio"
                selected={localChoice === 'claude'}
                onSelect={() => setLocalChoice('claude')}
                icon={<SparkleIcon className="w-3 h-3 text-accent" />}
                title="Send to Claude"
                description="Claude answers questions and makes the requested changes, asking you before each edit."
              />
              <Choice
                type="radio"
                selected={localChoice === 'publish'}
                onSelect={() => setLocalChoice('publish')}
                icon={<CheckIcon className="w-3 h-3" />}
                title="Just save the comments"
                description="Drafts become regular comments here. Nothing is sent anywhere; you can hand them to Claude later."
              />
              {renderGitHubNote()}
            </div>
          )}

          {sendToClaude && claudeProblem && (
            <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-[11px] text-deleted">
              {claudeProblem}{' '}
              <button onClick={() => openSettingsAt('claude')} className="underline cursor-pointer">
                Open settings
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-3">
            {pendingReview && (
              <button
                onClick={() => discard.mutate(undefined, { onSuccess: close })}
                disabled={discard.isPending}
                className="px-2 py-1.5 text-xs font-medium rounded-md text-deleted hover:bg-hover transition-colors cursor-pointer disabled:opacity-50"
                title="Delete all draft comments"
              >
                Discard drafts
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submit.isPending && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {submitLabel()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
