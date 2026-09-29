import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SegmentedToggleOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface SegmentedToggleProps<T extends string> {
  options: SegmentedToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  labelClassName?: string;
}

export function SegmentedToggle<T extends string>(props: SegmentedToggleProps<T>) {
  const { options, value, onChange, labelClassName } = props;

  return (
    <div className="flex items-center rounded-md overflow-hidden">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            title={option.label}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors duration-150 cursor-pointer',
              isActive
                ? 'bg-accent text-white'
                : 'bg-bg-tertiary text-text-secondary hover:bg-hover hover:text-text'
            )}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {labelClassName ? <span className={labelClassName}>{option.label}</span> : option.label}
          </button>
        );
      })}
    </div>
  );
}
