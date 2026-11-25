import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '../../components/ui/skeleton';
import { buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import type { GithubPendingAction, Review, ReviewVerdict } from '../../lib/types';
import { openUrl } from '@tauri-apps/plugin-opener';
import { prRefFor } from '../pr/pr-checkout';
import {
  disabledReason,
  excludedItems,
  groupByFile,
  headerLine,
  otherDraftSessions,
  plural,
  postedToast,
  selectedItems,
  submitButtonLabel,
  toCandidateItems,
  type CandidateItem,
} from './review-candidates';
import type { GitHubDetails } from '../../lib/api';
import { openSettingsAt } from '../../lib/ui-store';
import { getRepoPath } from '../../lib/api';
import { mentionsAgent } from '../../lib/mentions';
import { useAgentProblem } from '../claude/send-comments';
import { GENERAL_THREAD_FILE_PATH, type CommentThread } from '../../components/comments/types';
import { toast } from 'sonner';
import { MentionTextarea } from '../../components/comments/mention-textarea';
import { PostReviewError, triggerClaude, useReviewActions, useReviewState, type ClaudeScope } from './review-state';
import { useOwnPr } from '../../hooks/use-repo-state';
import { PrSyncRow } from '../pr/pr-session';
import { ApproveIcon, CheckIcon, ChevronDownIcon, CommentIcon, GitHubIcon, GitPullRequestIcon, RequestChangesIcon, SparkleIcon, type GlyphProps } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { Popover } from '../../components/ui/popover';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { useRunPick } from '../claude/model-setting';
import { agentMeta } from '../claude/agents';
import { useOpenReviewHandler } from '../../lib/review-keys';

interface FinishReviewProps {
  githubDetails: GitHubDetails | null;
  threads?: CommentThread[];
}

const VERDICTS: { value: ReviewVerdict; label: string; description: string; icon: ComponentType<GlyphProps>; tone: string }[] = [
  { value: 'comment', label: 'Comment', description: 'Feedback without a verdict', icon: CommentIcon, tone: 'text-text-secondary' },
  { value: 'approve', label: 'Approve', description: 'Ready to merge', icon: ApproveIcon, tone: 'text-added' },
  { value: 'requestChanges', label: 'Request changes', description: 'Must be addressed before merging', icon: RequestChangesIcon, tone: 'text-deleted' },
];

export function FinishReview(props: FinishReviewProps) {
  const { githubDetails, threads = [] } = props;
  const { enabled, pendingReview } = useReviewState();
  const ownPr = useOwnPr();

  if (!enabled || !githubDetails) {
    return null;
  }
  // On your own PR comments are notes for the agent, so the button only shows once you add drafts to post.
  if (ownPr && (pendingReview?.pendingCount ?? 0) === 0) {
    return null;
  }
  return <PullRequestReview pr={githubDetails} threads={threads} ownPr={ownPr} />;
}

/** Threads whose draft comments mention an agent, which answers them once the review is submitted. */
function draftMentions(threads: CommentThread[]): number {
  return threads.filter((thread) => thread.comments.some((comment) => comment.pending && (comment.mentionsAgent ?? mentionsAgent(comment.body)))).length;
}

function Checkbox(props: { checked: boolean }) {
  const { checked } = props;

  return (
    <span
      aria-hidden
      className={cn(
        'w-4 h-4 shrink-0 rounded flex items-center justify-center border transition-colors',
        checked ? 'border-accent bg-accent text-white' : 'border-control-border bg-raised',
      )}
    >
      {checked && <CheckIcon size={11} />}
    </span>
  );
}

function Radio(props: { checked: boolean }) {
  const { checked } = props;

  return (
    <span
      aria-hidden
      className={cn(
        'w-3.5 h-3.5 shrink-0 rounded-full flex items-center justify-center border transition-colors',
        checked ? 'border-accent bg-accent' : 'border-control-border bg-raised',
      )}
    >
      {checked && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
    </span>
  );
}

function Section(props: { title: ReactNode; checked: boolean; onToggle: () => void; hint?: ReactNode; children?: ReactNode }) {
  const { title, checked, onToggle, hint, children } = props;

  return (
    <section className="px-4 py-3 border-t border-overlay-border">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        className="flex items-start gap-2.5 w-full text-left cursor-pointer group"
      >
        <span className="mt-0.5">
          <Checkbox checked={checked} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-text">{title}</span>
          {hint && <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{hint}</span>}
        </span>
      </button>
      {children && (
        <div className={cn('mt-2 pl-[26px] space-y-0.5 transition-opacity', !checked && 'opacity-45 pointer-events-none')} aria-disabled={!checked}>
          {children}
        </div>
      )}
    </section>
  );
}

function RadioRow(props: { checked: boolean; onSelect: () => void; label: ReactNode; detail?: ReactNode; disabled?: boolean }) {
  const { checked, onSelect, label, detail, disabled = false } = props;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className="flex items-center gap-2 w-full h-7 px-1.5 -mx-1.5 rounded-md text-left hover:bg-hover transition-colors cursor-pointer disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent"
    >
      <Radio checked={checked} />
      <span className="text-[13px] text-text shrink-0">{label}</span>
      {detail && <span className="text-xs text-text-muted truncate min-w-0">{detail}</span>}
    </button>
  );
}

function VerdictPicker(props: { options: typeof VERDICTS; value: ReviewVerdict; onChange: (value: ReviewVerdict) => void; disabled: boolean }) {
  const { options, value, onChange, disabled } = props;

  return (
    <div role="radiogroup" aria-label="Verdict" className="flex gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          title={option.description}
          className={cn(
            'flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[12.5px] transition-colors cursor-pointer disabled:cursor-default',
            value === option.value ? 'border-accent/60 bg-accent/12 text-text' : 'border-control-border text-text-secondary hover:text-text hover:bg-hover',
          )}
        >
          <option.icon size="sm" className={option.tone} />
          {option.label}
        </button>
      ))}
    </div>
  );
}

function CandidateList(props: { items: CandidateItem[]; excluded: Set<string>; onToggle: (id: string) => void }) {
  const { items, excluded, onToggle } = props;
  const postable = items.filter((item) => !item.blockedReason);
  const blocked = items.filter((item) => item.blockedReason);

  return (
    <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-overlay-border bg-bg">
      {groupByFile(postable).map(([file, group]) => (
        <div key={file} className="pb-1">
          <div className="px-2 pt-1.5 pb-0.5 font-mono text-[11px] text-text-muted truncate" title={file}>{file}</div>
          {group.map((item) => (
            <label key={item.id} className="flex items-start gap-2 px-2 py-1 hover:bg-hover cursor-pointer">
              <input type="checkbox" checked={!excluded.has(item.id)} onChange={() => onToggle(item.id)} className="mt-0.5 accent-accent" />
              <span className="shrink-0 w-14 pt-px font-mono text-[11px] text-text-muted">{item.location}</span>
              <span className="min-w-0 flex-1 text-xs leading-5 text-text line-clamp-2">{item.body}</span>
              <span
                className={cn(
                  'shrink-0 mt-0.5 px-1.5 rounded text-[10px] leading-4 font-medium',
                  item.draft ? 'bg-accent/15 text-accent' : 'bg-hover text-text-secondary',
                )}
                title={[item.draft ? 'In your GitHub review' : 'Not on GitHub yet. Tick it to post it.', item.viewLabel ? `Left in ${item.viewLabel}` : null].filter(Boolean).join('. ')}
              >
                {item.draft ? 'Draft' : 'Diffity only'}
              </span>
            </label>
          ))}
        </div>
      ))}
      {blocked.length > 0 && (
        <div className="border-t border-overlay-border pb-1">
          <div className="px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-text-muted">Can't be posted ({blocked.length})</div>
          {blocked.map((item) => (
            <div key={item.id} className="px-2 py-1 text-xs opacity-80">
              <div className="flex items-start gap-2">
                <span className="shrink-0 max-w-[45%] pt-px font-mono text-[11px] text-text-muted truncate" title={item.filePath}>
                  {item.filePath === GENERAL_THREAD_FILE_PATH ? 'General' : `${item.filePath.split('/').pop()} ${item.location}`}
                </span>
                <span className="min-w-0 flex-1 leading-5 text-text-secondary truncate">{item.body}</span>
              </div>
              <div className="text-[11px] leading-4 text-deleted">{item.blockedReason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PullRequestReview(props: { pr: GitHubDetails; threads: CommentThread[]; ownPr: boolean }) {
  const { pr, threads, ownPr } = props;
  const repoPath = getRepoPath();
  const { sessionId, pendingReview } = useReviewState();
  const { submit, post, discard } = useReviewActions(sessionId);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [verdict, setVerdict] = useState<ReviewVerdict>('comment');
  const [postToGitHub, setPostToGitHub] = useState(true);
  const [sendClaude, setSendClaude] = useState(false);
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [pendingAction, setPendingAction] = useState<GithubPendingAction | null>(null);
  const [postError, setPostError] = useState<PostReviewError | null>(null);
  const [savedReview, setSavedReview] = useState<Review | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOpenReviewHandler(setOpen);
  const defaultAgent = agentMeta(useRunPick('fix', repoPath).agent);
  const claudeProblem = useAgentProblem(defaultAgent, open && sendClaude);

  const candidatesQuery = useQuery({
    queryKey: ['review-candidates', repoPath, pr.prNumber],
    queryFn: () => tauri.githubReviewCandidates(repoPath, pr.prNumber),
    staleTime: 30_000,
    retry: false,
  });
  const { refetch } = candidatesQuery;
  const [openedAt, setOpenedAt] = useState(0);
  useEffect(() => {
    if (!open) {
      return;
    }
    setOpenedAt(Date.now());
    void refetch();
  }, [open, refetch]);
  const checkingCandidates = candidatesQuery.isLoading || (open && candidatesQuery.isFetching && candidatesQuery.dataUpdatedAt < openedAt);

  const candidateItems = useMemo(
    () => toCandidateItems(candidatesQuery.data?.candidates ?? [], prRefFor(pr.pr)),
    [candidatesQuery.data, pr.baseRef],
  );
  const excluded = useMemo(() => excludedItems(candidateItems, toggled), [candidateItems, toggled]);
  const selected = selectedItems(candidateItems, excluded);
  const verdicts = ownPr ? VERDICTS.filter((option) => option.value === 'comment') : VERDICTS;
  const postableCount = candidateItems.filter((item) => !item.blockedReason).length;
  const blockedCount = candidateItems.length - postableCount;
  const githubPending = candidatesQuery.data?.githubPending ?? null;
  const showPendingChoice = postToGitHub && (githubPending !== null || postError?.code === 'pending_review_exists');

  const mentions = useMemo(() => draftMentions(threads), [threads]);
  const pendingCount = pendingReview?.pendingCount ?? 0;
  const hasBody = body.trim().length > 0;
  // Mentioned agents answer their comments whatever is ticked here; this sends every comment on top.
  const claudeScope: ClaudeScope = sendClaude ? 'all' : 'none';
  const claudeHasWork = sendClaude && (pendingCount > 0 || hasBody);
  const busy = submit.isPending || post.isPending;
  const badgeCount = candidatesQuery.data ? postableCount : pendingCount;

  const toggle = (id: string) => {
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const blockedReason = disabledReason({
    postToGitHub,
    sendClaude,
    draftCount: pendingCount,
    selectedCount: selected.length,
    postableCount,
    blockedCount,
    hasBody,
    verdict,
    loading: checkingCandidates,
    blocker: candidatesQuery.data?.blocker ?? null,
    needsPendingChoice: showPendingChoice && pendingAction === null,
    claudeHasWork,
    claudeProblem,
  });

  const submitLabel = () => {
    if (busy) {
      return postToGitHub ? 'Posting…' : 'Submitting…';
    }
    return submitButtonLabel({
      prNumber: pr.prNumber,
      verdict,
      postCount: selected.length,
      postToGitHub,
      fixer: claudeHasWork ? defaultAgent.short : null,
      mentions,
    });
  };

  const reset = () => {
    setBody('');
    setVerdict('comment');
    setSendClaude(false);
    setToggled(new Set());
    setPendingAction(null);
    setPostError(null);
    setSavedReview(null);
    setOpen(false);
  };

  const handleSubmit = () => {
    if (blockedReason || busy) {
      return;
    }
    if (!postToGitHub) {
      submit.mutate({ body, verdict: null, claude: claudeScope }, { onSuccess: reset });
      return;
    }
    setPostError(null);
    post.mutate(
      {
        prNumber: pr.prNumber,
        body,
        verdict,
        threadIds: selected.map((item) => item.id),
        otherDraftSessions: otherDraftSessions(selected, sessionId),
        needsLocalReview: pendingCount > 0 || hasBody || verdict !== 'comment',
        review: savedReview,
        pendingAction: showPendingChoice ? pendingAction : null,
      },
      {
        onSuccess: ({ review, result }) => {
          const message = postedToast(pr.prNumber, verdict, result);
          const url = result.reviewUrl ?? candidatesQuery.data?.prUrl ?? pr.prUrl;
          const claude = review ? triggerClaude(review, claudeScope) : null;
          toast.success(message.title, {
            description: [message.description, claude].filter(Boolean).join('\n') || undefined,
            action: result.dryRun ? undefined : { label: 'View on GitHub', onClick: () => void openUrl(url) },
          });
          reset();
        },
        onError: (error) => {
          setPostError(error);
          if (error.review) {
            setSavedReview(error.review);
          }
        },
      },
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={badgeCount > 0 ? buttonPrimary : buttonOutline}
        title={badgeCount > 0 ? `${plural(badgeCount, 'comment')} ready to post to #${pr.prNumber}` : `Submit your review of pull request #${pr.prNumber}`}
      >
        <GitPullRequestIcon size="md" className={badgeCount > 0 ? 'text-white' : 'text-added'} />
        <span className="@max-3xl/titlebar:hidden">Submit review</span> #{pr.prNumber}
        {badgeCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-white/25 text-[10px] font-semibold tabular-nums">
            {badgeCount}
          </span>
        )}
        <ChevronDownIcon size="xs" />
      </button>
      <Popover open={open} onClose={close} anchorRef={ref} align="end" width={460} className="p-0">
        <div className="font-sans">
          <div className="px-4 pt-3.5 pb-3">
            <div className="text-[13px] font-semibold text-text">Submit review · #{pr.prNumber}</div>
            <div className="text-xs text-text-secondary mt-0.5 truncate" title={pr.prTitle}>
              {postToGitHub ? headerLine(selected.length, blockedCount, candidatesQuery.isLoading) : pendingCount > 0 ? `${plural(pendingCount, 'draft comment')}, private until you submit` : 'No draft comments'}
              {' · '}
              {pr.prTitle}
            </div>
            <MentionTextarea
              value={body}
              onChange={setBody}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="Summary (optional)"
              rows={2}
              growTo={160}
              className="mt-2.5 block w-full px-2.5 py-1.5 text-[13px] bg-raised text-text border border-control-border rounded-md resize-none outline-none focus:border-focus placeholder:text-text-muted min-h-[56px]"
            />
            {postToGitHub && candidatesQuery.isError && (
              <div className="mt-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">
                Couldn't check which comments can be posted: {tauri.errorMessage(candidatesQuery.error)}
              </div>
            )}
            {postToGitHub && candidatesQuery.isLoading && pendingCount > 0 && (
              <div className="mt-2.5 flex flex-col gap-2" aria-hidden>
                <Skeleton className="h-4 w-3/4" />
                {pendingCount > 1 && <Skeleton className="h-4 w-1/2" />}
              </div>
            )}
            {postToGitHub && candidateItems.length > 0 && <CandidateList items={candidateItems} excluded={excluded} onToggle={toggle} />}
          </div>

          <Section
            checked={postToGitHub}
            onToggle={() => setPostToGitHub(!postToGitHub)}
            title={<><GitHubIcon size="sm" className="text-text-secondary" />Post to GitHub</>}
          >
            {verdicts.length > 1 && <VerdictPicker options={verdicts} value={verdict} onChange={setVerdict} disabled={!postToGitHub} />}
          </Section>

          {showPendingChoice && (
            <div className="mx-4 mb-2 px-2.5 py-2 rounded-md bg-modified/10 border border-overlay-border text-xs text-text">
              <div>
                You have a pending review on #{pr.prNumber} on GitHub
                {githubPending && githubPending.commentCount > 0 ? ` with ${plural(githubPending.commentCount, 'comment')}` : ''}. GitHub allows only one.
              </div>
              <div role="radiogroup" aria-label="Pending review on GitHub" className="mt-1">
                <RadioRow checked={pendingAction === 'addToExisting'} onSelect={() => setPendingAction('addToExisting')} label="Add to your existing pending review" detail="and submit it" />
                <RadioRow checked={pendingAction === 'discard'} onSelect={() => setPendingAction('discard')} label="Discard the GitHub pending review" detail="then post this one" />
              </div>
            </div>
          )}

          <Section
            checked={sendClaude}
            onToggle={() => setSendClaude(!sendClaude)}
            title={<><SparkleIcon size="sm" className="text-claude" />{pendingCount > 0 ? `Ask ${defaultAgent.short} to fix ${pendingCount > 1 ? `all ${pendingCount} comments` : 'the comment'}` : `Send the summary to ${defaultAgent.short}`}</>}
            hint="Edits your local checkout of this branch."
          />
          {mentions > 0 && !sendClaude && (
            <div className="flex items-center gap-2 px-4 pb-3 -mt-1 text-xs text-text-secondary">
              <SparkleIcon size="xs" className="shrink-0 text-claude" />
              {mentions === 1 ? 'The agent you mentioned answers after you submit.' : `The agents you mentioned answer ${mentions} comments after you submit.`}
            </div>
          )}

          {sendClaude && claudeProblem && (
            <div className="mx-4 mb-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">
              {claudeProblem}{' '}
              <button onClick={() => openSettingsAt('agents')} className="underline cursor-pointer">
                Open settings
              </button>
            </div>
          )}

          {postError && postError.code !== 'pending_review_exists' && (
            <div role="alert" className="mx-4 mb-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted whitespace-pre-wrap">
              <span className="font-medium">Not posted to #{pr.prNumber}. </span>
              {postError.message}
              {postError.review && ' Your comments are kept here; fix the problem and post again.'}
            </div>
          )}
          {postError?.code === 'pending_review_exists' && (
            <div role="alert" className="mx-4 mb-2 px-2.5 py-1.5 rounded-md bg-deleted/10 text-xs text-deleted">{postError.message}</div>
          )}

          <PrSyncRow prNumber={pr.prNumber} className="px-4 pb-2.5" />
          <div className="flex items-center gap-2 px-4 py-3 border-t border-overlay-border">
            {pendingReview && pendingCount > 0 && (
              <button
                onClick={() => {
                  close();
                  setConfirmDiscard(true);
                }}
                disabled={discard.isPending}
                className={cn(buttonGhost, 'px-2 text-deleted hover:text-deleted')}
                title="Delete all draft comments"
              >
                Discard drafts
              </button>
            )}
            <div className="flex-1" />
            <button onClick={close} className={buttonGhost}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!!blockedReason || busy}
              className={cn(buttonPrimary, 'min-w-0')}
              title={blockedReason ?? undefined}
            >
              {busy && <Spinner className="text-white" />}
              <span className="truncate">{submitLabel()}</span>
            </button>
          </div>
          {blockedReason && (
            <div className="px-4 pb-3 -mt-1 text-xs text-text-muted text-right">{blockedReason}</div>
          )}
        </div>
      </Popover>
      {confirmDiscard && (
        <ConfirmDialog
          title={`Discard ${plural(pendingCount, 'draft')}`}
          message={`Delete the ${plural(pendingCount, 'draft comment')} in your review of #${pr.prNumber}? This can't be undone.`}
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirmDiscard(false);
            discard.mutate();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      )}
    </div>
  );
}
