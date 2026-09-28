import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { cn } from '@/lib/cn';
import { GENERAL_FILE_PATH, type AppError, type PullRequest, type PushResult, type ReviewEvent, type Thread } from '@/lib/types';
import { AlertIcon, CheckIcon, SparklesIcon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';

export interface PushReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  sessionId: string | null;
  pr: PullRequest;
  localHeadSha: string | null;
}

const EVENTS: { value: ReviewEvent; label: string; hint: string }[] = [
  { value: 'COMMENT', label: 'Comment', hint: 'Submit general feedback without explicit approval.' },
  { value: 'APPROVE', label: 'Approve', hint: 'Submit feedback and approve merging these changes.' },
  { value: 'REQUEST_CHANGES', label: 'Request changes', hint: 'Submit feedback that must be addressed before merging.' },
];

export function isPushable(thread: Thread) {
  return thread.status === 'open' && !thread.githubThreadId;
}

export function errorGuidance(error: unknown): string {
  if (!api.isAppError(error)) {
    return api.errorMessage(error);
  }
  const appError = error as AppError;
  if (appError.code === 'head_mismatch') {
    return `${appError.message}\n\nGitHub anchors comments to the PR's head commit. Push your commits first (or pull the latest), then try again.`;
  }
  if (appError.code === 'dirty') {
    return `${appError.message}\n\nCommit and push your changes first so line numbers match the PR on GitHub.`;
  }
  if (appError.code === 'unauthenticated' || appError.code === 'unauthorized') {
    return `${appError.message}\n\nReconnect GitHub from the PR tab or Settings → GitHub.`;
  }
  return appError.message;
}

function threadLocation(thread: Thread) {
  if (thread.filePath === GENERAL_FILE_PATH) {
    return 'General comment';
  }
  if (thread.startLine === 0) {
    return thread.filePath;
  }
  if (thread.endLine !== thread.startLine) {
    return `${thread.filePath}:${thread.startLine}-${thread.endLine}`;
  }
  return `${thread.filePath}:${thread.startLine}`;
}

export function PushReviewDialog(props: PushReviewDialogProps) {
  const { open, onOpenChange, repoPath, sessionId, pr, localHeadSha } = props;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState('');
  const [event, setEvent] = useState<ReviewEvent>('COMMENT');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const threadsQuery = useQuery({
    queryKey: queryKeys.pushable(repoPath, pr.number),
    queryFn: () => api.githubPushableThreads(repoPath, pr.number),
    enabled: open,
    staleTime: 0,
  });

  const pushable = useMemo(() => (threadsQuery.data ?? []).filter(isPushable), [threadsQuery.data]);
  const pushableKey = pushable.map((thread) => thread.id).join(',');

  useEffect(() => {
    if (!open) {
      return;
    }
    setResult(null);
    setError(null);
    setSubmitting(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelected(new Set(pushableKey ? pushableKey.split(',') : []));
  }, [open, pushableKey]);

  const headMismatch = Boolean(localHeadSha && pr.headSha && localHeadSha !== pr.headSha);
  const allSelected = pushable.length > 0 && selected.size === pushable.length;
  const canSubmit =
    !submitting && Boolean(sessionId) && (selected.size > 0 || body.trim().length > 0 || event === 'APPROVE');

  const toggle = (threadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) {
        next.delete(threadId);
        return next;
      }
      next.add(threadId);
      return next;
    });
  };

  const submit = async () => {
    if (!sessionId || !canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const pushed = await api.pushReview(repoPath, sessionId, pr.number, event, body.trim() || null, [...selected]);
      setResult(pushed);
      queryClient.invalidateQueries({ queryKey: ['threads'] });
      queryClient.invalidateQueries({ queryKey: ['github', 'pushable'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.pr(repoPath) });
      if (pushed.failed === 0) {
        toast.success(`Review submitted to #${pr.number}`, {
          description: `${pushed.pushed} comment${pushed.pushed === 1 ? '' : 's'} pushed`,
        });
      }
    } catch (err) {
      setError(errorGuidance(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title="Review pushed"
        description={`#${pr.number} ${pr.title}`}
        footer={
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="Pushed" value={result.pushed} tone="success" />
            <Stat label="Skipped" value={result.skipped} tone="neutral" />
            <Stat label="Failed" value={result.failed} tone={result.failed > 0 ? 'danger' : 'neutral'} />
          </div>
          {result.skipped > 0 && (
            <p className="text-xs text-fg-muted">
              Skipped comments are on lines that are not part of the PR diff on GitHub.
            </p>
          )}
          {result.errors.length > 0 && (
            <ul className="selectable space-y-1 rounded-md border border-danger/40 bg-danger/10 p-2 text-xs text-danger">
              {result.errors.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      className="w-[600px]"
      title={`Push review to #${pr.number}`}
      description={pr.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" loading={submitting} disabled={!canSubmit} onClick={submit}>
            Submit review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {headMismatch && (
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            <AlertIcon size={14} className="mt-px shrink-0" />
            <span>
              Your local HEAD ({localHeadSha?.slice(0, 7)}) differs from the PR head ({pr.headSha.slice(0, 7)}). Push
              your commits first so comments land on the right lines.
            </span>
          </div>
        )}

        <section>
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold">
              Comments <span className="font-normal text-fg-subtle">({selected.size}/{pushable.length})</span>
            </h3>
            {pushable.length > 0 && (
              <button
                type="button"
                className="text-2xs text-accent hover:underline"
                onClick={() => setSelected(allSelected ? new Set() : new Set(pushable.map((thread) => thread.id)))}
              >
                {allSelected ? 'Select none' : 'Select all'}
              </button>
            )}
          </div>
          <p className="mb-1.5 text-2xs text-fg-subtle">
            Open comments from every view of this repo (uncommitted changes, branches, PR diff, files) on files in this PR.
          </p>
          <div className="max-h-[260px] overflow-auto rounded-md border border-border">
            {threadsQuery.isPending && (
              <div className="flex items-center gap-2 px-3 py-3 text-xs text-fg-subtle">
                <Spinner size={14} /> Loading comments…
              </div>
            )}
            {threadsQuery.isError && (
              <div className="px-3 py-3 text-xs text-danger">{errorGuidance(threadsQuery.error)}</div>
            )}
            {threadsQuery.isSuccess && pushable.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-fg-subtle">
                No unsynced open comments. You can still submit a review with a summary.
              </div>
            )}
            {pushable.map((thread) => {
              const first = thread.comments[0];
              const isAgent = first?.authorType === 'agent';
              return (
                <label
                  key={thread.id}
                  className="flex cursor-default items-start gap-2.5 border-b border-border-subtle px-3 py-2 last:border-b-0 hover:bg-hover"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--accent)]"
                    checked={selected.has(thread.id)}
                    onChange={() => toggle(thread.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-2xs text-fg-muted">{threadLocation(thread)}</span>
                      {isAgent && (
                        <Badge tone="accent" title={first?.authorName}>
                          <SparklesIcon size={12} />
                          {first?.authorName || 'AI'}
                        </Badge>
                      )}
                      {thread.severity && <Badge>{thread.severity}</Badge>}
                      {thread.sessionId !== sessionId && <Badge title="Left in another view of this repo">other view</Badge>}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs">{first?.body ?? ''}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 text-xs font-semibold">Summary</h3>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Leave an overall comment (optional)"
            className="resize-y"
          />
        </section>

        <section className="space-y-1">
          {EVENTS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-default items-start gap-2.5 rounded-md border px-2 py-1.5',
                event === option.value ? 'border-accent/40 bg-accent-soft' : 'border-transparent hover:bg-hover',
              )}
            >
              <input
                type="radio"
                name="review-event"
                className="mt-0.5 accent-[var(--accent)]"
                checked={event === option.value}
                onChange={() => setEvent(option.value)}
              />
              <span>
                <span className="block text-xs font-medium">{option.label}</span>
                <span className="block text-2xs text-fg-subtle">{option.hint}</span>
              </span>
            </label>
          ))}
        </section>

        {error && (
          <div className="selectable flex gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs whitespace-pre-wrap text-danger">
            <AlertIcon size={14} className="mt-px shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Stat(props: { label: string; value: number; tone: 'success' | 'neutral' | 'danger' }) {
  const { label, value, tone } = props;
  return (
    <div className="rounded-md border border-border py-2.5">
      <div
        className={cn(
          'flex items-center justify-center gap-1 text-lg font-semibold tabular-nums',
          tone === 'success' && 'text-success',
          tone === 'danger' && 'text-danger',
        )}
      >
        {tone === 'success' && value > 0 && <CheckIcon size={16} />}
        {value}
      </div>
      <div className="text-2xs text-fg-subtle">{label}</div>
    </div>
  );
}
