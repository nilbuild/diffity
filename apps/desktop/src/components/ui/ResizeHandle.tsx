import { useRef } from 'react';
import { cn } from '@/lib/cn';

export interface ResizeHandleProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  direction: 'left' | 'right';
  className?: string;
}

/** Vertical drag handle; `direction: 'left'` means dragging left grows the panel (panel is on the right). */
export function ResizeHandle(props: ResizeHandleProps) {
  const { value, onChange, min, max, direction, className } = props;
  const start = useRef<{ x: number; value: number } | null>(null);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn('group relative z-10 w-0 shrink-0 cursor-col-resize', className)}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = { x: event.clientX, value };
      }}
      onPointerMove={(event) => {
        if (!start.current) {
          return;
        }
        const delta = event.clientX - start.current.x;
        const next = start.current.value + (direction === 'left' ? -delta : delta);
        onChange(Math.max(min, Math.min(max, next)));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    >
      <div className="absolute inset-y-0 -left-1 w-2 group-hover:bg-accent/30 group-active:bg-accent/50" />
    </div>
  );
}
