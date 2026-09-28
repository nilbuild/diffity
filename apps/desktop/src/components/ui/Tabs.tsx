import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  title?: string;
}

export interface TabsProps<T extends string> {
  value: T;
  items: TabItem<T>[];
  onChange: (value: T) => void;
  /** `pill`: compact toolbar tabs. `underline`: section tabs inside a panel header (fills the header height). `list`: vertical nav. */
  variant?: 'pill' | 'underline' | 'list';
  className?: string;
}

const variants = {
  pill: {
    root: 'flex items-center gap-0.5',
    item: 'h-7 rounded-md px-2.5 text-xs',
    active: 'bg-active text-fg',
    idle: 'text-fg-muted hover:bg-hover hover:text-fg',
  },
  underline: {
    root: 'flex h-full items-stretch gap-3',
    item: 'border-y-2 border-t-transparent px-1 text-sm',
    active: 'border-b-accent text-fg',
    idle: 'border-b-transparent text-fg-muted hover:text-fg',
  },
  list: {
    root: 'flex flex-col gap-px',
    item: 'h-7 w-full rounded-md px-2 text-sm',
    active: 'bg-active text-fg',
    idle: 'text-fg-muted hover:bg-hover hover:text-fg',
  },
};

export function Tabs<T extends string>(props: TabsProps<T>) {
  const { value, items, onChange, variant = 'pill', className } = props;
  const style = variants[variant];
  return (
    <div role="tablist" className={cn(style.root, className)}>
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            title={item.title}
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex shrink-0 cursor-default items-center gap-1.5 font-medium transition-colors',
              style.item,
              selected ? style.active : style.idle,
            )}
          >
            {item.icon && <span className="flex shrink-0">{item.icon}</span>}
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className="rounded-full bg-muted px-1.5 text-2xs leading-4 text-fg-muted tabular-nums">{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
