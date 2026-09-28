import { toast } from 'sonner';
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
      ? `Add a comment on ${draft.filePath.split('/').pop()}`
      : draft.startLine === draft.endLine
        ? `Add a comment on line ${draft.startLine}`
        : `Add a comment on lines ${draft.startLine} to ${draft.endLine}`;

  return (
    <CommentComposer
      draftKey="new"
      mode="thread"
      sessionId={actions.sessionId}
      withSeverity
      label={draft.side === 'old' && draft.startLine > 0 ? `${label} (old side)` : label}
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
  );
}
