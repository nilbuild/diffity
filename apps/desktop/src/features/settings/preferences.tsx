import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from '../../components/icons/spinner';
import { buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';

export function PreferencesPane(props: { children: ReactNode }) {
  const { children } = props;

  return <div className="flex min-w-0 flex-col gap-6">{children}</div>;
}

export function PreferencesGroup(props: { label: string; action?: ReactNode; children: ReactNode }) {
  const { label, action, children } = props;

  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-border pb-1.5">
        <p className="text-[11px] font-semibold text-text-muted">{label}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

interface RowProps {
  label: ReactNode;
  hint?: ReactNode;
  stacked?: boolean;
  children?: ReactNode;
}

export function PreferencesRow(props: RowProps) {
  const { label, hint, stacked, children } = props;

  if (stacked) {
    return (
      <div className="flex flex-col gap-2 py-2.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] text-text">{label}</span>
          {hint && <p className="text-[11.5px] leading-snug text-text-muted">{hint}</p>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] text-text">{label}</span>
        {hint && <p className="text-[11.5px] leading-snug text-text-muted">{hint}</p>}
      </div>
      {children && <div className="flex w-[260px] flex-none items-center justify-end gap-2">{children}</div>}
    </div>
  );
}

type ButtonVariant = 'primary' | 'danger' | 'default';

interface SettingsButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  busy?: boolean;
}

export function SettingsButton(props: SettingsButtonProps) {
  const { variant = 'default', busy, className, children, type = 'button', disabled, ...rest } = props;

  return (
    <button
      type={type}
      disabled={disabled || busy}
      className={cn(
        variant === 'primary' && buttonPrimary,
        variant === 'danger' && cn(buttonGhost, 'text-deleted hover:bg-deleted/10 hover:text-deleted'),
        variant === 'default' && buttonOutline,
        className,
      )}
      {...rest}
    >
      {busy && <Spinner className={cn('h-3 w-3', variant === 'primary' && 'border-white/40')} />}
      {children}
    </button>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export function SegmentedControl<T extends string>(props: {
  value: T | null;
  options: SegmentedOption<T>[];
  ariaLabel: string;
  onChange: (value: T) => void;
}) {
  const { value, options, ariaLabel, onChange } = props;

  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex min-w-0 gap-0.5 rounded-lg bg-bg-tertiary p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-6 min-w-0 cursor-pointer truncate rounded-md px-2.5 text-xs transition-colors',
              active ? 'bg-toggle text-text' : 'text-text-secondary hover:text-text',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const settingsInputClass =
  'h-7 min-w-0 flex-1 rounded-md border border-border bg-raised px-2.5 text-xs text-text placeholder:text-text-muted focus:border-focus focus:outline-none';

export function InlineConfirm(props: {
  message: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { message, confirmLabel, busy, onConfirm, onCancel } = props;

  return (
    <div className="mt-1 flex flex-col gap-2 rounded-lg bg-bg-secondary p-2.5 text-xs text-text">
      <span>{message}</span>
      <div className="flex justify-end gap-1.5">
        <SettingsButton onClick={onCancel} disabled={busy} autoFocus>
          Cancel
        </SettingsButton>
        <SettingsButton variant="primary" className="bg-deleted hover:bg-deleted/90" busy={busy} onClick={onConfirm}>
          {confirmLabel}
        </SettingsButton>
      </div>
    </div>
  );
}

export function StatusBadge(props: { tone: 'success' | 'warning' | 'danger' | 'neutral'; children: ReactNode }) {
  const { tone, children } = props;

  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium',
        tone === 'success' && 'bg-added/10 text-added',
        tone === 'warning' && 'bg-modified/10 text-modified',
        tone === 'danger' && 'bg-deleted/10 text-deleted',
        tone === 'neutral' && 'bg-bg-tertiary text-text-secondary',
      )}
    >
      {children}
    </span>
  );
}
