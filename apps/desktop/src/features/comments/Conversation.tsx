import { useMemo } from 'react';
import { toast } from 'sonner';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge, CountBadge } from '@/components/ui/Badge';
import { ChevronRightIcon, ConversationIcon, PlusIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { dayjs } from '@/lib/time';
import { GENERAL_FILE_PATH, type Review, type ReviewVerdict, type Thread } from '@/lib/types';
import { Avatar } from './badges';
import { CommentComposer } from './CommentComposer';
import { useCommentDraft } from './draft-store';
import { ThreadCard } from './ThreadCard';
import type { CommentActions } from './use-threads';

export interface ConversationProps {
  threads: Thread[];
  reviews: Review[];
  actions: CommentActions;
  open: boolean;
  onToggle: () => void;
}

type Entry = { kind: 'thread'; at: string; thread: Thread } | { kind: 'review'; at: string; review: Review };

const VERDICT: Record<ReviewVerdict, { label: string; phrase: string; tone: 'neutral' | 'success' | 'danger' }> = {
  comment: { label: 'Commented', phrase: 'reviewed', tone: 'neutral' },
  approve: { label: 'Approved', phrase: 'approved these changes', tone: 'success' },
  requestChanges: { label: 'Changes requested', phrase: 'requested changes', tone: 'danger' },
};

export function Conversation(props: ConversationProps) {
  const { threads, reviews, actions, open, onToggle } = props;
  const composing = useCommentDraft((s) => 'general' in s.bodies);
  const setBody = useCommentDraft((s) => s.setBody);

  const entries = useMemo(() => {
    const list: Entry[] = [
      ...threads.map((thread): Entry => ({ kind: 'thread', at: thread.createdAt, thread })),
      ...reviews.map((review): Entry => ({ kind: 'review', at: review.submittedAt ?? review.createdAt, review })),
    ];
    return list.sort((a, b) => a.at.localeCompare(b.at));
  }, [threads, reviews]);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-paper font-sans">
      <div className="flex h-11 items-center gap-2 pr-4 pl-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-default items-center gap-1.5 text-left"
        >
          <span className="inline-flex size-5 shrink-0 items-center justify-center">
            <ChevronRightIcon size={12} className={cn('text-fg-subtle transition-transform', open && 'rotate-90')} />
          </span>
          <ConversationIcon size={14} className="text-fg-subtle" />
          <span className="font-serif text-base font-semibold text-fg">Conversation</span>
          {entries.length > 0 && <CountBadge count={entries.length} tone="accent" />}
          {!open && entries.length === 0 && <span className="truncate text-2xs text-fg-subtle">General comments and submitted reviews</span>}
        </button>
        {!composing && (
          <button
            type="button"
            className="inline-flex h-7 cursor-default items-center gap-1 rounded-full border border-accent/70 px-3 text-xs font-medium text-accent hover:border-accent hover:bg-accent/8"
            onClick={() => {
              setBody('general', '');
              if (!open) {
                onToggle();
              }
            }}
          >
            <PlusIcon size={12} />
            Add comment
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {entries.length === 0 && !composing && (
            <div className="py-1 text-center text-xs text-fg-subtle">No general comments or reviews yet.</div>
          )}
          {entries.map((entry) =>
            entry.kind === 'thread' ? (
              <ThreadCard key={entry.thread.id} thread={entry.thread} actions={actions} />
            ) : (
              <ReviewEntry key={entry.review.id} review={entry.review} />
            ),
          )}
          {composing && (
            <div>
              <CommentComposer
                draftKey="general"
                mode="thread"
                sessionId={actions.sessionId}
                withSeverity
                placeholder="Leave a general comment on these changes… (type @ to mention Claude)"
                onSubmit={(input) =>
                  actions.create
                    .mutateAsync({
                      filePath: GENERAL_FILE_PATH,
                      side: 'new',
                      startLine: 0,
                      endLine: 0,
                      body: input.body,
                      severity: input.severity,
                      pending: input.pending,
                    })
                    .then(() => {
                      if (input.pending) {
                        toast.success('Added to your review');
                      }
                    })
                }
                onCancel={() => undefined}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ReviewEntry(props: { review: Review }) {
  const { review } = props;
  const verdict = VERDICT[review.verdict ?? 'comment'];
  const at = review.submittedAt ?? review.createdAt;
  return (
    <div className="overflow-hidden rounded-xl bg-muted-soft">
      <div className="flex min-h-9 items-center gap-2 px-3 py-1.5">
        <Avatar authorType="user" authorName="You" size="sm" />
        <span className="min-w-0 truncate text-xs text-fg-muted">
          <span className="font-semibold text-fg">You</span> {verdict.phrase}
          {review.commentCount > 0 && ` · ${review.commentCount} ${review.commentCount === 1 ? 'comment' : 'comments'}`}
        </span>
        <span className="shrink-0 text-2xs text-fg-subtle" title={new Date(at).toLocaleString()}>
          {dayjs(at).fromNow()}
        </span>
        <Badge tone={verdict.tone} className="ml-auto">
          {verdict.label}
        </Badge>
      </div>
      {review.body.trim() && (
        <div className="mx-1.5 mb-1.5 rounded-lg bg-paper px-3 py-2.5">
          <Markdown compact mentions>
            {review.body}
          </Markdown>
        </div>
      )}
    </div>
  );
}
