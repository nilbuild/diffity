import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { modKey } from '@/lib/platform';
import type { Severity } from '@/lib/types';
import { SEVERITIES, SeverityBadge } from './badges';

export interface CommentFormProps {
  initialBody?: string;
  placeholder?: string;
  submitLabel?: string;
  withSeverity?: boolean;
  autoFocus?: boolean;
  onSubmit: (body: string, severity: Severity | null) => void | Promise<unknown>;
  onCancel?: () => void;
}

export function CommentForm(props: CommentFormProps) {
  const { initialBody = '', placeholder = 'Leave a comment…', submitLabel = 'Comment', withSeverity, autoFocus = true, onSubmit, onCancel } = props;
  const [body, setBody] = useState(initialBody);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!autoFocus) {
      return;
    }
    const el = ref.current;
    if (!el) {
      return;
    }
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    const frame = requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [body]);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed || busy) {
      return;
    }
    setBusy(true);
    try {
      await onSubmit(trimmed, severity);
      setBody('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" onKeyDown={(event) => event.stopPropagation()}>
      <Textarea
        ref={ref}
        value={body}
        placeholder={placeholder}
        rows={2}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel?.();
          }
        }}
        className="min-h-[56px] font-sans"
      />
      <div className="flex items-center gap-1.5">
        {withSeverity &&
          SEVERITIES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSeverity(severity === value ? null : value)}
              className={cn('cursor-default rounded-sm opacity-55 outline-offset-1 hover:opacity-100', severity === value && 'opacity-100 outline outline-1 outline-current')}
            >
              <SeverityBadge severity={value} />
            </button>
          ))}
        <span className="ml-auto text-2xs text-fg-subtle">{modKey}↵ to submit</span>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button size="sm" variant="primary" disabled={!body.trim() || busy} onClick={() => void submit()}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
