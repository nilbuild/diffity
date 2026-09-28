import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon } from './icon';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Visual check mark box (16px). Used standalone or inside `Checkbox`/`Radio` rows. */
export function CheckMark(props: { checked: boolean; tone?: 'accent' | 'success'; className?: string }) {
  const { checked, tone = 'accent', className } = props;
  const on = tone === 'success' ? 'border-success bg-success text-canvas' : 'border-accent-solid bg-accent-solid text-accent-fg';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors',
        checked ? on : 'border-border-strong bg-paper',
        className,
      )}
    >
      {checked && <CheckIcon size={12} />}
    </span>
  );
}

function RadioMark(props: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-full border bg-canvas transition-colors',
        props.checked ? 'border-accent-solid' : 'border-border-strong',
      )}
    >
      {props.checked && <span className="size-2 rounded-full bg-accent-solid" />}
    </span>
  );
}

interface ChoiceRowProps {
  role: 'checkbox' | 'radio';
  checked: boolean;
  onClick: () => void;
  mark: ReactNode;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

function ChoiceRow(props: ChoiceRowProps) {
  const { role, checked, onClick, mark, label, description, disabled, className } = props;
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'group flex cursor-default items-start gap-2 rounded-md text-left disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span className={cn('flex', label ? 'mt-0.5' : '')}>{mark}</span>
      {label && (
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">{label}</span>
          {description && <span className="block text-xs text-fg-subtle">{description}</span>}
        </span>
      )}
    </button>
  );
}

export function Checkbox(props: CheckboxProps) {
  const { checked, onChange, label, description, disabled, className } = props;
  return (
    <ChoiceRow
      role="checkbox"
      checked={checked}
      onClick={() => onChange(!checked)}
      mark={<CheckMark checked={checked} />}
      label={label}
      description={description}
      disabled={disabled}
      className={className}
    />
  );
}

export interface RadioProps {
  checked: boolean;
  onSelect: () => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Radio(props: RadioProps) {
  const { checked, onSelect, label, description, disabled, className } = props;
  return (
    <ChoiceRow
      role="radio"
      checked={checked}
      onClick={onSelect}
      mark={<RadioMark checked={checked} />}
      label={label}
      description={description}
      disabled={disabled}
      className={className}
    />
  );
}
