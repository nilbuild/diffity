import { useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Popover } from './Popover';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

export interface MenuProps {
  trigger: (props: { onClick: () => void; ref: React.RefObject<HTMLButtonElement | null>; open: boolean }) => ReactNode;
  items: (MenuItem | 'separator')[];
  align?: 'start' | 'end';
}

export function Menu(props: MenuProps) {
  const { trigger, items, align = 'end' } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <>
      {trigger({ onClick: () => setOpen((v) => !v), ref, open })}
      <Popover open={open} onOpenChange={setOpen} anchorRef={ref} align={align} className="min-w-[180px] py-1">
        {items.map((item, index) =>
          item === 'separator' ? (
            <div key={`sep-${index}`} className="my-1 h-px bg-border" />
          ) : (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex w-full cursor-default items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-bg-muted disabled:opacity-40',
                item.danger ? 'text-danger' : 'text-fg',
              )}
            >
              {item.icon && <span className="text-fg-muted">{item.icon}</span>}
              <span className="flex-1">{item.label}</span>
              {item.hint && <span className="text-[11px] text-fg-subtle">{item.hint}</span>}
            </button>
          ),
        )}
      </Popover>
    </>
  );
}
