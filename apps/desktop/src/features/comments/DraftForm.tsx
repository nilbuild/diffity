import { toast } from 'sonner';
import { CommentForm } from './CommentForm';
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
      ? `Comment on ${draft.filePath}`
      : draft.startLine === draft.endLine
        ? `Comment on line ${draft.startLine}`
        : `Comment on lines ${draft.startLine}–${draft.endLine}`;

  return (
    <div className="rounded-lg border border-accent/60 bg-bg-elevated p-3 font-sans shadow-sm">
      <div className="mb-2 text-xs font-medium text-fg-muted">
        {label}
        {draft.side === 'old' && draft.startLine > 0 && <span className="text-fg-subtle"> (old)</span>}
      </div>
      <CommentForm
        withSeverity
        onSubmit={async (body, severity) => {
          await actions.create.mutateAsync({
            filePath: draft.filePath,
            side: draft.side,
            startLine: draft.startLine,
            endLine: draft.endLine,
            body,
            severity,
            anchorContent: draft.anchorContent,
          });
          setDraft(null);
          toast.success('Comment added');
        }}
        onCancel={() => setDraft(null)}
      />
    </div>
  );
}
