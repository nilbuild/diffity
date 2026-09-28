import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export interface SegmentedToggleProps<T extends string> {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedToggle<T extends string>(props: SegmentedToggleProps<T>) {
  const { value, options, onChange, size = 'md', className } = props;
  return (
    <div
      role="radiogroup"
      className={cn(
        'inline-flex shrink-0 items-center gap-px rounded-md border border-border bg-panel p-px',
        size === 'sm' ? 'h-6' : 'h-7',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            title={option.title}
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-full cursor-default items-center gap-1 rounded-[5px] border font-medium transition-colors',
              size === 'sm' ? 'px-1.5 text-2xs' : 'px-2 text-xs',
              selected ? 'border-border-strong bg-raised text-fg dark:bg-active' : 'border-transparent text-fg-muted hover:bg-hover hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
