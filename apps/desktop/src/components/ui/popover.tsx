import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { CheckIcon } from './icon';

const GAP = 6;
const MARGIN = 8;

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  align?: 'start' | 'end';
  width?: number;
  className?: string;
  children: ReactNode;
}

interface Position {
  top: number;
  left: number;
  maxHeight: number;
}

function computePosition(anchor: DOMRect, panel: HTMLElement, align: 'start' | 'end'): Position {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const width = panel.offsetWidth;
  const height = panel.scrollHeight;
  const below = viewportHeight - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  const preferred = align === 'start' ? anchor.left : anchor.right - width;
  const left = Math.max(MARGIN, Math.min(preferred, viewportWidth - width - MARGIN));

  if (height <= below || below >= above) {
    return { top: anchor.bottom + GAP, left, maxHeight: below };
  }
  const fitted = Math.min(height, above);
  return { top: anchor.top - GAP - fitted, left, maxHeight: above };
}

export function Popover(props: PopoverProps) {
  const { open, onClose, anchorRef, align = 'start', width, className, children } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) {
      return;
    }
    setPosition(computePosition(anchor.getBoundingClientRect(), panel, align));
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    update();
  }, [open, update]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handlePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    const observer = new ResizeObserver(update);
    if (panelRef.current) {
      observer.observe(panelRef.current);
    }
    document.addEventListener('mousedown', handlePointer);
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, onClose, anchorRef, update]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className={cn('fixed z-[60] p-1 overflow-y-auto bg-overlay rounded-lg border border-overlay-border font-sans text-[13px] text-text', className)}
      style={{
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        maxHeight: position?.maxHeight,
        width,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function useMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  return { open, close, toggle, anchorRef };
}

interface MenuItemProps {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export function MenuItem(props: MenuItemProps) {
  const { icon, label, hint, checked, disabled, onSelect } = props;

  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-left text-[13px] text-text hover:bg-hover transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-default disabled:hover:bg-transparent"
    >
      {icon && <span className="flex w-4 justify-center text-text-secondary">{icon}</span>}
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
      {checked !== undefined && <CheckIcon size="sm" className={cn('text-text', !checked && 'invisible')} />}
    </button>
  );
}

export function MenuLabel(props: { children: ReactNode }) {
  const { children } = props;

  return <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-muted">{children}</div>;
}

export function MenuSeparator() {
  return <div className="my-1 -mx-1 border-t border-overlay-border" />;
}

export function ContextMenu(props: { position: { x: number; y: number } | null; onClose: () => void; width?: number; children: ReactNode }) {
  const { position, onClose, width = 220, children } = props;
  const anchorRef = useRef<HTMLSpanElement>(null);

  return (
    <>
      {position && <span ref={anchorRef} aria-hidden className="fixed w-0 h-0 pointer-events-none" style={{ left: position.x, top: position.y }} />}
      <Popover open={position !== null} onClose={onClose} anchorRef={anchorRef} width={width}>
        {children}
      </Popover>
    </>
  );
}
