import { useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface ResizeHandleProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** `left`: dragging left grows the panel (panel sits to the right of the handle). */
  direction: 'left' | 'right';
  className?: string;
}

/**
 * Vertical 1px divider between two panes with a wider invisible hit area.
 * It is the border between the panes, so neither adjacent pane should draw its own border on that edge.
 */
export function ResizeHandle(props: ResizeHandleProps) {
  const { value, onChange, min, max, direction, className } = props;
  const start = useRef<{ x: number; value: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const stop = () => {
    start.current = null;
    setDragging(false);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      className={cn('group relative z-10 w-px shrink-0 bg-border', className)}
    >
      <div
        className="absolute inset-y-0 -left-[3px] w-[7px] cursor-col-resize"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = { x: event.clientX, value };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!start.current) {
            return;
          }
          const delta = event.clientX - start.current.x;
          const next = start.current.value + (direction === 'left' ? -delta : delta);
          onChange(Math.max(min, Math.min(max, next)));
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 -left-px w-[2px] bg-accent opacity-0 transition-opacity delay-100 group-hover:opacity-100',
          dragging && 'opacity-100 delay-0',
        )}
      />
    </div>
  );
}
