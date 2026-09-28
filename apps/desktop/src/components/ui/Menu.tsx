import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { cn } from '@/lib/cn';
import { CheckIcon } from './icon';
import { Popover } from './Popover';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  hint?: string;
}

export type MenuEntry = MenuItem | 'separator' | { heading: string };

export interface MenuTriggerProps {
  onClick: () => void;
  ref: RefObject<HTMLButtonElement | null>;
  open: boolean;
}

export interface MenuProps {
  trigger: (props: MenuTriggerProps) => ReactNode;
  items: MenuEntry[];
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

export function Menu(props: MenuProps) {
  const { trigger, items, align = 'end', side, className } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <>
      {trigger({ onClick: () => setOpen((v) => !v), ref, open })}
      <Popover open={open} onOpenChange={setOpen} anchorRef={ref} align={align} side={side} className={cn('min-w-[180px]', className)}>
        <MenuList>
          {items.map((item, index) => {
            if (item === 'separator') {
              return <MenuSeparator key={`sep-${index}`} />;
            }
            if ('heading' in item) {
              return <MenuHeading key={`heading-${index}`}>{item.heading}</MenuHeading>;
            }
            return (
              <MenuRow
                key={item.label}
                icon={item.icon}
                hint={item.hint}
                danger={item.danger}
                disabled={item.disabled}
                checked={item.checked}
                onSelect={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </MenuRow>
            );
          })}
        </MenuList>
      </Popover>
    </>
  );
}

export function MenuList(props: { children: ReactNode; className?: string }) {
  return (
    <div role="menu" className={cn('flex flex-col p-1', props.className)}>
      {props.children}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}

export function MenuHeading(props: { children: ReactNode }) {
  return <div className="px-2 pt-1.5 pb-1 text-2xs font-medium text-fg-subtle">{props.children}</div>;
}

export interface MenuRowProps {
  onSelect: () => void;
  children: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  /** Secondary line under the label. */
  description?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  className?: string;
}

/** A single menu row; use inside `MenuList` when building a custom popover menu. */
export function MenuRow(props: MenuRowProps) {
  const { onSelect, children, icon, hint, description, danger, disabled, checked, className } = props;
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-default items-center gap-2 rounded-sm px-2 text-left text-xs hover:bg-hover disabled:pointer-events-none disabled:opacity-40',
        description ? 'py-1.5' : 'h-7',
        danger ? 'text-danger' : 'text-fg',
        className,
      )}
    >
      {icon && <span className={cn('flex shrink-0 self-start', description ? 'mt-0.5' : 'self-center', danger ? 'text-danger' : 'text-fg-muted')}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description && <span className="block truncate text-2xs text-fg-subtle">{description}</span>}
      </span>
      {hint && <span className="shrink-0 text-2xs text-fg-subtle">{hint}</span>}
      {checked && <CheckIcon size={14} className="shrink-0 text-accent" />}
    </button>
  );
}
