import { forwardRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useResizableWidth, type ResizableWidth } from '../../hooks/use-resizable-width';
import { ResizeHandle } from '../ui/resize-handle';

/** Chat and Comments take turns on the right, so they share one width. */
export const SIDE_PANEL_WIDTH: ResizableWidth = {
  storageKey: 'diffity-side-panel-width',
  defaultWidth: 420,
  minWidth: 320,
  maxFraction: 0.6,
  edge: 'left',
};

interface SidePanelProps {
  label: string;
  className?: string;
  children: ReactNode;
}

/** The panel docked on the right of the page (Chat or Comments), resizable from its left edge. */
export const SidePanel = forwardRef<HTMLElement, SidePanelProps>(function SidePanel(props, ref) {
  const { label, className, children } = props;
  const resize = useResizableWidth(SIDE_PANEL_WIDTH);

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      style={{ width: resize.width }}
      className={cn('relative flex flex-col shrink-0 h-screen border-l border-frame-border font-sans outline-none animate-slide-in-right', className)}
    >
      <ResizeHandle edge="left" resize={resize} />
      {children}
    </aside>
  );
});
