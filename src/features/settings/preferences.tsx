import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from '../../components/icons/spinner';
import { buttonGhost, buttonGroup, buttonGroupDivider, buttonGroupItem, buttonOutline, buttonPrimary, segmentInactive } from '../../components/ui/button-styles';
import { MinusIcon, PlusIcon } from '../../components/ui/icon';

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

type ButtonVariant = 'primary' | 'danger' | 'destructive' | 'default';

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
        variant === 'destructive' && cn(buttonOutline, 'text-deleted border-deleted/35 hover:bg-deleted/10'),
        className,
      )}
      {...rest}
    >
      {busy && <Spinner className={cn('h-3 w-3', variant === 'primary' && 'text-white/80')} />}
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
              active ? 'bg-toggle text-text ring-1 ring-toggle-border' : segmentInactive,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch(props: { checked: boolean; label: string; disabled?: boolean; onChange: (checked: boolean) => void }) {
  const { checked, label, disabled, onChange } = props;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[18px] w-[30px] flex-none cursor-pointer rounded-full transition-colors disabled:cursor-default disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-bg-tertiary ring-1 ring-inset ring-border',
      )}
    >
      <span className={cn('absolute top-[3px] left-[3px] size-3 rounded-full transition-transform', checked ? 'translate-x-3 bg-white' : 'bg-text-muted')} />
    </button>
  );
}

/** Steps through `steps`, with a Reset that appears once the value moves off `defaultValue`. */
export function Stepper(props: {
  value: number;
  steps: readonly number[];
  defaultValue: number;
  ariaLabel: string;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const { value, steps, defaultValue, ariaLabel, format, onChange } = props;
  const index = steps.indexOf(value);

  return (
    <>
      {value !== defaultValue && (
        <button type="button" onClick={() => onChange(defaultValue)} className="cursor-pointer text-xs text-text-muted hover:text-text">
          Reset
        </button>
      )}
      <div role="group" aria-label={ariaLabel} className={buttonGroup}>
        <button
          type="button"
          aria-label={`Decrease ${ariaLabel.toLowerCase()}`}
          disabled={index <= 0}
          onClick={() => onChange(steps[index - 1])}
          className={cn(buttonGroupItem, 'px-2 text-text-secondary')}
        >
          <MinusIcon size="xs" />
        </button>
        <span aria-live="polite" className={cn(buttonGroupDivider, 'flex w-14 items-center justify-center text-xs tabular-nums text-text')}>
          {format(value)}
        </span>
        <button
          type="button"
          aria-label={`Increase ${ariaLabel.toLowerCase()}`}
          disabled={index >= steps.length - 1}
          onClick={() => onChange(steps[index + 1])}
          className={cn(buttonGroupItem, buttonGroupDivider, 'px-2 text-text-secondary')}
        >
          <PlusIcon size="xs" />
        </button>
      </div>
    </>
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

export function StatusBadge(props: { tone: 'success' | 'warning' | 'danger' | 'neutral'; children: ReactNode; className?: string }) {
  const { tone, children, className } = props;

  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium',
        tone === 'success' && 'bg-added/10 text-added',
        tone === 'warning' && 'bg-modified/10 text-modified',
        tone === 'danger' && 'bg-deleted/10 text-deleted',
        tone === 'neutral' && 'bg-bg-tertiary text-text-secondary',
        className,
      )}
    >
      {children}
    </span>
  );
}
