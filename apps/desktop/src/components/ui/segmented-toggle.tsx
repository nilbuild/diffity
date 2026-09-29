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
  iconOnly?: boolean;
}

export function SegmentedToggle<T extends string>(props: SegmentedToggleProps<T>) {
  const { options, value, onChange, labelClassName, iconOnly } = props;

  return (
    <div className="flex items-center h-7 p-0.5 gap-0.5 rounded-md bg-bg-tertiary shrink-0">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            title={option.label}
            aria-pressed={isActive}
            className={cn(
              'flex items-center justify-center gap-1.5 h-[22px] rounded-[4px] text-[13px] transition-colors duration-150 cursor-pointer',
              iconOnly ? 'w-6' : 'px-2.5',
              isActive
                ? 'bg-selected text-accent font-medium'
                : 'text-text-secondary hover:text-text hover:bg-hover'
            )}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {!iconOnly && (labelClassName ? <span className={labelClassName}>{option.label}</span> : option.label)}
          </button>
        );
      })}
    </div>
  );
}
