import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { SparklesIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { mentionsAgent } from '@/lib/mentions';
import { modKey } from '@/lib/platform';
import type { Severity } from '@/lib/types';
import { SEVERITIES, SEVERITY_LABEL, severityTone } from './badges';
import { useCommentDraft } from './draft-store';
import { MarkdownEditor } from './MarkdownEditor';
import { usePendingReview } from './use-review';

export type ComposerMode = 'thread' | 'reply' | 'edit';

export interface ComposerSubmit {
  body: string;
  severity: Severity | null;
  pending: boolean;
}

export interface CommentComposerProps {
  /** Key into the draft-body store so unsent text survives remounts. */
  draftKey: string;
  mode: ComposerMode;
  sessionId: string | null;
  /** Replies to a pending thread are always part of the review. */
  threadPending?: boolean;
  initialBody?: string;
  initialSeverity?: Severity | null;
  placeholder?: string;
  withSeverity?: boolean;
  autoFocus?: boolean;
  onSubmit: (input: ComposerSubmit) => Promise<unknown>;
  onCancel?: () => void;
}

const toneClass = {
  danger: 'border-danger/40 bg-danger/12 text-danger',
  accent: 'border-accent/40 bg-accent-soft text-accent',
  neutral: 'border-border-strong bg-muted text-fg',
  warning: 'border-warning/40 bg-warning/12 text-warning',
} as const;

export function SeverityPicker(props: { value: Severity | null; onChange: (value: Severity | null) => void }) {
  const { value, onChange } = props;
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Severity">
      {SEVERITIES.map((severity) => {
        const selected = value === severity;
        return (
          <button
            key={severity}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? null : severity)}
            className={cn(
              'h-[18px] cursor-default rounded-sm border px-1.5 text-2xs leading-none font-medium whitespace-nowrap',
              selected ? toneClass[severityTone[severity]] : 'border-transparent text-fg-subtle hover:bg-hover hover:text-fg',
            )}
          >
            {SEVERITY_LABEL[severity]}
          </button>
        );
      })}
    </div>
  );
}

export function CommentComposer(props: CommentComposerProps) {
  const {
    draftKey,
    mode,
    sessionId,
    threadPending,
    initialBody = '',
    initialSeverity = null,
    placeholder,
    withSeverity,
    autoFocus = true,
    onSubmit,
    onCancel,
  } = props;
  const stored = useCommentDraft((s) => s.bodies[draftKey]);
  const setBody = useCommentDraft((s) => s.setBody);
  const clearBody = useCommentDraft((s) => s.clearBody);
  const body = stored ?? initialBody;
  const [severity, setSeverity] = useState<Severity | null>(initialSeverity);
  const [busy, setBusy] = useState<'single' | 'review' | null>(null);
  const pendingReview = usePendingReview(mode === 'edit' ? null : sessionId);
  const inReview = pendingReview !== null || threadPending === true;
  const empty = body.trim().length === 0;
  const mentions = mentionsAgent(body);

  const submit = async (pending: boolean) => {
    const trimmed = body.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(pending ? 'review' : 'single');
    try {
      await onSubmit({ body: trimmed, severity, pending });
      clearBody(draftKey);
    } catch {
      return;
    } finally {
      setBusy(null);
    }
  };

  const cancel = () => {
    clearBody(draftKey);
    onCancel?.();
  };

  const primaryIsReview = mode !== 'edit';
  const primaryLabel = mode === 'edit' ? 'Save' : inReview ? 'Add review comment' : 'Start a review';

  return (
    <div className="flex flex-col gap-2 font-sans">
      <MarkdownEditor
        value={body}
        onChange={(value) => setBody(draftKey, value)}
        placeholder={placeholder ?? (mode === 'reply' ? 'Reply… (type @ to mention Claude)' : 'Leave a comment… (type @ to mention Claude)')}
        autoFocus={autoFocus}
        minHeight={mode === 'reply' ? 56 : 72}
        headerExtra={withSeverity ? <SeverityPicker value={severity} onChange={setSeverity} /> : null}
        onSubmit={() => void submit(primaryIsReview)}
        onCancel={cancel}
      />
      {mentions && (
        <div className="-mt-1 inline-flex items-center gap-1 text-2xs text-accent">
          <SparklesIcon size={12} />
          Claude will respond when this is published
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="mr-auto inline-flex min-w-0 items-center" title={`${modKey}↵ ${primaryLabel.toLowerCase()}`}>
          <Kbd>{modKey}↵</Kbd>
        </span>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
        {mode !== 'edit' && !threadPending && (
          <Button size="sm" variant="secondary" disabled={empty || busy !== null} loading={busy === 'single'} onClick={() => void submit(false)}>
            Add single comment
          </Button>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={empty || busy !== null}
          loading={busy === 'review' || (mode === 'edit' && busy !== null)}
          onClick={() => void submit(primaryIsReview)}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
