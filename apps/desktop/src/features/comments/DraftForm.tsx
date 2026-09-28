import { toast } from 'sonner';
import { CommentIcon } from '@/components/ui/icon';
import { CommentComposer } from './CommentComposer';
import { useCommentDraft } from './draft-store';
import type { CommentActions } from './use-threads';

export function DraftForm(props: { actions: CommentActions }) {
  const { actions } = props;
  const draft = useCommentDraft((s) => s.draft);
  const setDraft = useCommentDraft((s) => s.setDraft);

  if (!draft) {
    return null;
  }

  const label =
    draft.startLine === 0
      ? `Comment on ${draft.filePath.split('/').pop()}`
      : draft.startLine === draft.endLine
        ? `Comment on line ${draft.startLine}`
        : `Comment on lines ${draft.startLine}–${draft.endLine}`;

  return (
    <div className="overflow-hidden rounded-lg border border-accent bg-raised font-sans">
      <div className="flex h-8 items-center gap-1.5 border-b border-border bg-panel px-3 text-xs font-medium text-fg-muted">
        <CommentIcon size={12} className="text-accent" />
        {label}
        {draft.side === 'old' && draft.startLine > 0 && <span className="font-normal text-fg-subtle">(old side)</span>}
      </div>
      <div className="p-2">
        <CommentComposer
          draftKey="new"
          mode="thread"
          sessionId={actions.sessionId}
          withSeverity
          onSubmit={async (input) => {
            await actions.create.mutateAsync({
              filePath: draft.filePath,
              side: draft.side,
              startLine: draft.startLine,
              endLine: draft.endLine,
              body: input.body,
              severity: input.severity,
              anchorContent: draft.anchorContent,
              pending: input.pending,
            });
            setDraft(null);
            toast.success(input.pending ? 'Added to your review' : 'Comment added');
          }}
          onCancel={() => setDraft(null)}
        />
      </div>
    </div>
  );
}
