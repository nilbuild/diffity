import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
  size?: InputSize;
  /** Leading icon, rendered inside the field. */
  icon?: ReactNode;
  /** Trailing content inside the field (e.g. a Kbd hint or a small button). */
  trailing?: ReactNode;
  mono?: boolean;
  invalid?: boolean;
  wrapperClassName?: string;
}

const heights: Record<InputSize, string> = {
  sm: 'h-6 text-xs',
  md: 'h-7 text-sm',
  lg: 'h-8 text-sm',
};

const fieldFrame =
  'rounded-md border bg-canvas text-fg transition-colors placeholder:text-fg-subtle focus-within:border-accent hover:border-border-strong';

export function Input(props: InputProps) {
  const { size = 'md', icon, trailing, mono, invalid, className, wrapperClassName, ...rest } = props;
  return (
    <label
      className={cn(
        'flex min-w-0 cursor-text items-center gap-1.5 px-2',
        fieldFrame,
        invalid ? 'border-danger' : 'border-border',
        heights[size],
        wrapperClassName,
      )}
    >
      {icon && <span className="flex shrink-0 text-fg-subtle">{icon}</span>}
      <input
        className={cn(
          'selectable h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-subtle',
          mono && 'font-mono text-xs',
          className,
        )}
        {...rest}
      />
      {trailing}
    </label>
  );
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  mono?: boolean;
  invalid?: boolean;
}

export function Textarea(props: TextareaProps) {
  const { mono, invalid, className, ...rest } = props;
  return (
    <textarea
      className={cn(
        'selectable block w-full resize-none px-2.5 py-2 text-sm outline-none',
        fieldFrame,
        'focus:border-accent',
        invalid ? 'border-danger' : 'border-border',
        mono && 'font-mono text-xs',
        className,
      )}
      {...rest}
    />
  );
}
