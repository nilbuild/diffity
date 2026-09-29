import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import type { ReviewVerdict } from '../../lib/types';
import type { GitHubDetails } from '../../lib/api';
import { useDismiss } from '../../hooks/use-dismiss';
import { openSettingsAt } from '../../lib/ui-store';
import { getRepoPath } from '../../lib/api';
import { enqueueClaude } from '../claude/claude-runner';
import type { CommentThread } from '../../components/comments/types';
import { toast } from 'sonner';
import { ChevronDownIcon } from '../../components/icons/chevron-down-icon';
import { SparkleIcon } from '../../components/icons/sparkle-icon';
import { GitHubIcon } from '../../components/icons/github-icon';
import { CheckIcon } from '../../components/icons/check-icon';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { useReviewActions, useReviewState } from './review-state';

interface FinishReviewProps {
  githubDetails: GitHubDetails | null;
  threads?: CommentThread[];
}

const VERDICTS: { value: ReviewVerdict; label: string; description: string }[] = [
  { value: 'comment', label: 'Comment', description: 'General feedback without approving.' },
  { value: 'approve', label: 'Approve', description: 'Approve merging these changes.' },
  { value: 'requestChanges', label: 'Request changes', description: 'Feedback that must be addressed before merging.' },
];

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
        selected ? 'border-accent/40 bg-selected' : 'border-border hover:bg-hover',
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
        <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{description}</span>
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

export function unaddressedThreads(threads: CommentThread[]): CommentThread[] {
  return threads.filter((thread) => {
    if (thread.status !== 'open' || thread.pending) {
      return false;
    }
    const last = thread.comments[thread.comments.length - 1];
    return !!last && last.author.type !== 'agent';
  });
}

export function FinishReview(props: FinishReviewProps) {
  const { githubDetails, threads = [] } = props;
  const { enabled } = useReviewState();

  if (!enabled) {
    return null;
  }
  if (!githubDetails) {
    return <SendToClaude threads={threads} />;
  }
  return <PullRequestReview pr={githubDetails} />;
}

function SendToClaude(props: { threads: CommentThread[] }) {
  const { threads } = props;
  const { sessionId, pendingReview } = useReviewState();
  const { submit } = useReviewActions(sessionId);
  const pendingCount = pendingReview?.pendingCount ?? 0;
  const count = unaddressedThreads(threads).length + pendingCount;
  const claudeProblem = useClaudeProblem(count > 0);

  if (count === 0) {
    return null;
  }

  const send = async () => {
    if (claudeProblem) {
      toast.error(claudeProblem, { action: { label: 'Settings', onClick: () => openSettingsAt('claude') } });
      return;
    }
    if (pendingCount > 0) {
      await submit.mutateAsync({ body: '', verdict: null, sendToClaude: false, prNumber: null });
    }
    enqueueClaude({ kind: 'resolve' }, { repoPath: getRepoPath(), sessionId });
  };

  return (
    <button
      onClick={() => void send()}
      disabled={submit.isPending}
      className={buttonOutline}
      title={`Claude answers questions and makes the requested changes for ${plural(count, 'open comment')}, asking before each edit`}
    >
      <SparkleIcon className="w-3.5 h-3.5 text-accent" />
      Send {count} to Claude
    </button>
  );
}

function PullRequestReview(props: { pr: GitHubDetails }) {
  const { pr } = props;
  const { sessionId, pendingReview } = useReviewState();
  const { submit, discard } = useReviewActions(sessionId);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [verdict, setVerdict] = useState<ReviewVerdict>('comment');
  const [postToGitHub, setPostToGitHub] = useState(true);
  const [alsoClaude, setAlsoClaude] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const claudeProblem = useClaudeProblem(open && alsoClaude);

  const pendingCount = pendingReview?.pendingCount ?? 0;
  const hasBody = body.trim().length > 0;
  const posting = postToGitHub;
  const canSubmit = pendingCount > 0 || hasBody || (posting && verdict !== 'comment');
  const what = pendingCount > 0 ? plural(pendingCount, 'comment') : hasBody ? 'note' : 'review';

  const submitLabel = () => {
    if (submit.isPending) {
      return posting ? 'Posting…' : 'Submitting…';
    }
    if (posting) {
      return alsoClaude ? `Post to #${pr.prNumber} & send to Claude` : `Post review to #${pr.prNumber}`;
    }
    if (alsoClaude) {
      return what === 'review' ? 'Send to Claude' : `Send ${what} to Claude`;
    }
    return what === 'review' ? 'Publish' : `Publish ${what}`;
  };

  const handleSubmit = () => {
    submit.mutate(
      {
        body,
        verdict: posting ? verdict : null,
        sendToClaude: alsoClaude,
        prNumber: posting ? pr.prNumber : null,
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
        className={pendingCount > 0 ? buttonPrimary : buttonOutline}
        title={pendingCount > 0 ? `${plural(pendingCount, 'draft comment')} waiting to be posted` : `Review pull request #${pr.prNumber}`}
      >
        Review #{pr.prNumber}
        {pendingCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-white/25 text-[10px] font-semibold tabular-nums">
            {pendingCount}
          </span>
        )}
        <ChevronDownIcon className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-[440px] bg-overlay rounded-lg ring-1 ring-overlay-border z-50 font-sans">
          <div className="px-4 pt-3.5 pb-2.5">
            <div className="text-[13px] font-semibold text-text">Review pull request #{pr.prNumber}</div>
            <div className="text-xs text-text-secondary mt-0.5">
              {pendingCount > 0
                ? `${plural(pendingCount, 'draft comment')}, private until you post them.`
                : 'Add a summary, approve or request changes.'}
            </div>
          </div>
          <div className="px-4">
            <MentionTextarea
              value={body}
              onChange={setBody}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Review summary (optional)"
              rows={3}
              className="block w-full px-3 py-2 text-[13px] bg-bg text-text border border-border rounded-md resize-y outline-none focus:border-accent/45 placeholder:text-text-muted min-h-[70px]"
            />
          </div>
          <div className="px-4 pt-3 space-y-2">
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
                      <span className="block text-xs text-text-secondary">{option.description}</span>
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

          {alsoClaude && claudeProblem && (
            <div className="mx-4 mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">
              {claudeProblem}{' '}
              <button onClick={() => openSettingsAt('claude')} className="underline cursor-pointer">
                Open settings
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 px-4 py-3.5">
            {pendingReview && (
              <button
                onClick={() => discard.mutate(undefined, { onSuccess: close })}
                disabled={discard.isPending}
                className={cn(buttonGhost, 'text-deleted hover:text-deleted')}
                title="Delete all draft comments"
              >
                Discard drafts
              </button>
            )}
            <div className="flex-1" />
            <button onClick={close} className={buttonGhost}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={!canSubmit || submit.isPending} className={buttonPrimary}>
              {submit.isPending && <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {submitLabel()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
