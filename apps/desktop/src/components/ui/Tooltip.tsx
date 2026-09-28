import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const OPEN_DELAY_MS = 450;
const GAP = 6;

interface TooltipPosition {
  top: number;
  left: number;
}

export interface TooltipAnchorProps {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave: () => void;
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  onMouseDown: () => void;
}

/** Hover/focus tooltip for any element. Spread `anchorProps` on the trigger and render `tooltip` next to it. */
export function useTooltip(content: ReactNode, side: 'top' | 'bottom' = 'bottom') {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current === null) {
      return;
    }
    window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clear, []);

  const show = (element: HTMLElement) => {
    clear();
    setAnchor(element);
    timer.current = window.setTimeout(() => setVisible(true), OPEN_DELAY_MS);
  };

  const hide = () => {
    clear();
    setVisible(false);
  };

  const anchorProps: TooltipAnchorProps = {
    onMouseEnter: (event) => show(event.currentTarget),
    onMouseLeave: hide,
    onFocus: (event) => {
      if (!event.currentTarget.matches(':focus-visible')) {
        return;
      }
      show(event.currentTarget);
    },
    onBlur: hide,
    onMouseDown: hide,
  };

  const tooltip = visible && anchor && content ? <TooltipBubble anchor={anchor} side={side}>{content}</TooltipBubble> : null;

  return { anchorProps, tooltip };
}

function TooltipBubble(props: { anchor: HTMLElement; side: 'top' | 'bottom'; children: ReactNode }) {
  const { anchor, side, children } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  useLayoutEffect(() => {
    const bubble = ref.current;
    if (!bubble) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const fitsBelow = rect.bottom + GAP + height < window.innerHeight - 4;
    const below = side === 'bottom' ? fitsBelow : rect.top - GAP - height < 4;
    const left = rect.left + rect.width / 2 - width / 2;
    setPosition({
      top: below ? rect.bottom + GAP : rect.top - GAP - height,
      left: Math.max(4, Math.min(left, window.innerWidth - width - 4)),
    });
  }, [anchor, side]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed z-[60] max-w-[280px] rounded-md border border-border-strong bg-panel px-2 py-1 text-2xs font-medium text-fg"
      style={{ top: position?.top ?? -9999, left: position?.left ?? -9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
}

/** Wraps arbitrary content in an inline-flex span that shows a tooltip on hover. Prefer `IconButton`'s built-in label. */
export function Tooltip(props: TooltipProps) {
  const { content, side, children, className } = props;
  const { anchorProps, tooltip } = useTooltip(content, side);
  return (
    <span className={className ?? 'inline-flex'} {...anchorProps}>
      {children}
      {tooltip}
    </span>
  );
}
