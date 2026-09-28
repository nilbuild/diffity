import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox, Radio } from '@/components/ui/Checkbox';
import { confirmDialog } from '@/components/ui/ConfirmDialog';
import { Kbd } from '@/components/ui/Kbd';
import { Popover } from '@/components/ui/Popover';
import { ChevronDownIcon, GithubIcon, SparklesIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { mentionsAgent } from '@/lib/mentions';
import { modKey } from '@/lib/platform';
import type { ReviewVerdict } from '@/lib/types';
import { useCommentDraft } from './draft-store';
import { MarkdownEditor } from './MarkdownEditor';
import { useBranchPr, usePendingReview, useReviewActions } from './use-review';

export interface FinishReviewProps {
  repoPath: string;
  sessionId: string | null;
}

const VERDICTS: { value: ReviewVerdict; label: string; description: string }[] = [
  { value: 'comment', label: 'Comment', description: 'Submit general feedback without explicit approval.' },
  { value: 'approve', label: 'Approve', description: 'Give your approval to these changes.' },
  { value: 'requestChanges', label: 'Request changes', description: 'Submit feedback that must be addressed.' },
];

export function FinishReview(props: FinishReviewProps) {
  const { repoPath, sessionId } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const pending = usePendingReview(sessionId);
  const count = pending?.pendingCount ?? 0;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={count > 0 ? `${count} pending ${count === 1 ? 'comment' : 'comments'}` : 'Submit a review'}
        className={cn(
          'inline-flex h-7 shrink-0 cursor-default items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium whitespace-nowrap transition-colors',
          count > 0
            ? 'border-transparent bg-accent-solid text-accent-fg hover:bg-accent-solid/88'
            : 'border-border bg-raised text-fg hover:border-border-strong hover:bg-hover',
          open && count === 0 && 'border-border-strong bg-hover',
        )}
      >
        {count > 0 ? 'Finish your review' : 'Review changes'}
        {count > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fg/22 px-1 text-2xs font-semibold tabular-nums">
            {count}
          </span>
        )}
        <ChevronDownIcon size={12} className={cn('shrink-0', count > 0 ? 'opacity-80' : 'text-fg-subtle')} />
      </button>
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} align="end" className="w-[440px]">
        <ReviewForm repoPath={repoPath} sessionId={sessionId} pendingCount={count} onDone={() => setOpen(false)} />
      </Popover>
    </>
  );
}

interface ReviewFormProps {
  repoPath: string;
  sessionId: string | null;
  pendingCount: number;
  onDone: () => void;
}

function ReviewForm(props: ReviewFormProps) {
  const { repoPath, sessionId, pendingCount, onDone } = props;
  const body = useCommentDraft((s) => s.bodies.review ?? '');
  const setBody = useCommentDraft((s) => s.setBody);
  const clearBody = useCommentDraft((s) => s.clearBody);
  const [verdict, setVerdict] = useState<ReviewVerdict>('comment');
  const [sendToClaude, setSendToClaude] = useState(true);
  const [postToPr, setPostToPr] = useState(false);
  const pr = useBranchPr(repoPath, true);
  const { submit, discard } = useReviewActions(repoPath, sessionId);
  const canSubmit = pendingCount > 0 || body.trim().length > 0 || verdict !== 'comment';

  const doSubmit = () => {
    if (!canSubmit || submit.isPending) {
      return;
    }
    submit.mutate(
      { body, verdict, sendToClaude, pr: postToPr ? pr : null },
      {
        onSuccess: () => {
          clearBody('review');
          onDone();
        },
      },
    );
  };

  const doDiscard = async () => {
    const ok = await confirmDialog({
      title: 'Discard review?',
      message: `This deletes your ${pendingCount} pending ${pendingCount === 1 ? 'comment' : 'comments'}. This cannot be undone.`,
      confirmLabel: 'Discard review',
      danger: true,
    });
    if (!ok) {
      return;
    }
    discard.mutate(undefined, {
      onSuccess: () => {
        clearBody('review');
        onDone();
      },
    });
  };

  return (
    <div className="flex flex-col font-sans">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="text-base font-semibold text-fg">Finish your review</span>
        <span className="ml-auto text-xs text-fg-subtle">
          {pendingCount > 0 ? `${pendingCount} pending ${pendingCount === 1 ? 'comment' : 'comments'}` : 'No pending comments'}
        </span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <MarkdownEditor
          value={body}
          onChange={(value) => setBody('review', value)}
          placeholder="Leave a summary (optional). Type @ to mention Claude."
          minHeight={88}
          maxHeight={240}
          onSubmit={doSubmit}
        />
        {mentionsAgent(body) && !sendToClaude && (
          <div className="-mt-1.5 inline-flex items-center gap-1 text-2xs text-accent">
            <SparklesIcon size={12} />
            Claude will respond to this review when it is published
          </div>
        )}
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Verdict">
          {VERDICTS.map((option) => (
            <Radio
              key={option.value}
              checked={verdict === option.value}
              onSelect={() => setVerdict(option.value)}
              label={option.label}
              description={option.description}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-border bg-panel p-3">
          <div className="text-xs font-medium text-fg-muted">Send to</div>
          <Checkbox
            checked={sendToClaude}
            onChange={setSendToClaude}
            label={
              <span className="inline-flex items-center gap-1.5">
                <SparklesIcon size={12} className="text-accent" />
                Claude Code
              </span>
            }
            description="Claude addresses every conversation and makes the requested changes, asking before each edit."
          />
          {pr && (
            <Checkbox
              checked={postToPr}
              onChange={setPostToPr}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <GithubIcon size={12} />
                  GitHub PR #{pr.number}
                </span>
              }
              description={pr.title}
            />
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-panel px-4 py-2.5">
        {pendingCount > 0 && (
          <Button size="md" variant="ghost" className="text-danger hover:text-danger" loading={discard.isPending} onClick={() => void doDiscard()}>
            Discard review
          </Button>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-2xs text-fg-subtle">
          <Kbd>{modKey}↵</Kbd>
        </span>
        <Button variant="primary" disabled={!canSubmit} loading={submit.isPending} onClick={doSubmit}>
          Submit review
        </Button>
      </div>
    </div>
  );
}
