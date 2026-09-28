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
}

export function SegmentedToggle<T extends string>(props: SegmentedToggleProps<T>) {
  const { value, options, onChange } = props;
  return (
    <div className="inline-flex h-7 items-center rounded-md border border-border bg-bg-subtle p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex h-full cursor-default items-center gap-1 rounded px-2 text-xs text-fg-muted',
            option.value === value && 'bg-bg-elevated text-fg shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
