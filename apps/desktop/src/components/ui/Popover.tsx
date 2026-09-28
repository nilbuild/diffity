import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  align?: 'start' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

interface Position {
  top: number;
  left: number;
}

const GAP = 4;

/** Floating panel anchored to `anchorRef`, rendered in a portal. Closes on outside pointer-down and Escape. */
export function Popover(props: PopoverProps) {
  const { open, onOpenChange, anchorRef, children, align = 'start', side = 'bottom', className } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const left = align === 'end' ? rect.right - width : rect.left;
    const fitsBelow = rect.bottom + GAP + height <= window.innerHeight - 8;
    const placeAbove = side === 'top' ? rect.top - GAP - height >= 8 : !fitsBelow && rect.top - GAP - height >= 8;
    setPosition({
      top: placeAbove ? rect.top - GAP - height : rect.bottom + GAP,
      left: Math.max(8, Math.min(left, window.innerWidth - width - 8)),
    });
  }, [open, anchorRef, align, side]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) {
        return;
      }
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onOpenChange, anchorRef]);

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      ref={panelRef}
      className={cn(
        'fixed z-40 overflow-hidden rounded-xl border border-border bg-raised',
        position === null && 'invisible',
        className,
      )}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
    >
      {children}
    </div>,
    document.body,
  );
}
