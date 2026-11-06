import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { ChevronRightIcon } from './icon';

interface PanelProps {
  title: ReactNode;
  icon?: ReactNode;
  count?: ReactNode;
  detail?: ReactNode;
  right?: ReactNode;
  /** Makes the title a toggle; the body shows only while open. */
  collapsible?: { open: boolean; onToggle: () => void };
  className?: string;
  children?: ReactNode;
}

/** A Home section: a bordered box with its own header, so sections read apart from each other and from their rows. */
export function Panel(props: PanelProps) {
  const { title, icon, count, detail, right, collapsible, className, children } = props;
  const open = collapsible ? collapsible.open : true;
  const heading = (
    <>
      {collapsible && <ChevronRightIcon size="xs" className={cn('shrink-0 text-text-muted transition-transform', open && 'rotate-90')} />}
      {icon && <span className="flex shrink-0 text-text-secondary">{icon}</span>}
      <h3 className="shrink-0 text-[13px] font-semibold text-text">{title}</h3>
      {count !== undefined && <span className="shrink-0 text-xs text-text-muted tabular-nums">{count}</span>}
      {detail && <span className="min-w-0 truncate text-xs text-text-muted">{detail}</span>}
    </>
  );

  return (
    <section className={cn('mt-5 rounded-lg border border-border bg-bg overflow-hidden', className)}>
      <header className={cn('flex items-center gap-2 min-h-10 px-3.5 bg-bg-secondary', open && children && 'border-b border-border')}>
        {collapsible ? (
          <button onClick={collapsible.onToggle} aria-expanded={open} className="flex items-center gap-2 min-w-0 flex-1 h-10 text-left cursor-pointer">
            {heading}
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0 flex-1">{heading}</div>
        )}
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </header>
      {open && children && (
        // Rows run edge to edge with a line between them, like GitHub's lists.
        <div className="[&_ul>li+li]:border-t [&_ul>li+li]:border-border-muted [&_li>div[role=button]]:rounded-none [&_li>div[role=button]]:px-3.5">
          {children}
        </div>
      )}
    </section>
  );
}
