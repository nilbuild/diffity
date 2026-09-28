import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Menu, type MenuEntry } from '@/components/ui/Menu';
import { ChevronDownIcon, SparklesIcon } from '@/components/ui/icon';
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
  label?: ReactNode;
  autoFocus?: boolean;
  onSubmit: (input: ComposerSubmit) => Promise<unknown>;
  onCancel?: () => void;
}

const toneDot = {
  danger: 'bg-danger',
  accent: 'bg-accent',
  neutral: 'bg-fg-subtle',
  warning: 'bg-warning',
} as const;

const toneText = {
  danger: 'text-danger',
  accent: 'text-accent',
  neutral: 'text-fg',
  warning: 'text-warning',
} as const;

export function SeverityPicker(props: { value: Severity | null; onChange: (value: Severity | null) => void }) {
  const { value, onChange } = props;
  const items: MenuEntry[] = [
    { heading: 'Severity' },
    {
      label: 'None',
      icon: <span className="size-2 rounded-full border border-fg-subtle" />,
      checked: value === null,
      onSelect: () => onChange(null),
    },
    ...SEVERITIES.map((severity) => ({
      label: SEVERITY_LABEL[severity],
      icon: <span className={cn('size-2 rounded-full', toneDot[severityTone[severity]])} />,
      checked: value === severity,
      onSelect: () => onChange(severity),
    })),
  ];
  return (
    <Menu
      align="start"
      items={items}
      trigger={(trigger) => (
        <button
          ref={trigger.ref}
          type="button"
          onClick={trigger.onClick}
          aria-label="Severity"
          className={cn(
            'inline-flex h-7 cursor-default items-center gap-1.5 rounded-full border border-border px-2.5 text-xs hover:border-border-strong hover:bg-hover',
            trigger.open && 'bg-hover',
            value ? cn('font-medium', toneText[severityTone[value]]) : 'text-fg-muted hover:text-fg',
          )}
        >
          {value && <span className={cn('size-2 rounded-full', toneDot[severityTone[value]])} />}
          {value ? SEVERITY_LABEL[value] : 'Severity'}
          <ChevronDownIcon size={12} className="text-fg-subtle" />
        </button>
      )}
    />
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
    label,
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

  const footer = (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <div className="mr-auto flex min-w-0 items-center gap-1">
        {withSeverity && <SeverityPicker value={severity} onChange={setSeverity} />}
        {mentions && (
          <span className="inline-flex min-w-0 items-center gap-1 px-1 text-2xs text-accent">
            <SparklesIcon size={12} />
            <span className="truncate">Claude responds when published</span>
          </span>
        )}
      </div>
      {onCancel && (
        <Button variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      )}
      {mode !== 'edit' && !threadPending && (
        <Button variant="secondary" disabled={empty || busy !== null} loading={busy === 'single'} onClick={() => void submit(false)}>
          Add single comment
        </Button>
      )}
      <Button
        variant="primary"
        title={`${modKey}↵`}
        disabled={empty || busy !== null}
        loading={busy === 'review' || (mode === 'edit' && busy !== null)}
        onClick={() => void submit(primaryIsReview)}
      >
        {primaryLabel}
      </Button>
    </div>
  );

  return (
    <MarkdownEditor
      className="font-sans"
      value={body}
      onChange={(value) => setBody(draftKey, value)}
      label={label}
      placeholder={placeholder ?? (mode === 'reply' ? 'Reply… (type @ to mention Claude)' : 'Leave a comment… (type @ to mention Claude)')}
      autoFocus={autoFocus}
      minHeight={mode === 'reply' ? 56 : 72}
      footer={footer}
      onSubmit={() => void submit(primaryIsReview)}
      onCancel={cancel}
    />
  );
}
