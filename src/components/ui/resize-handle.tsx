import { cn } from '../../lib/cn';
import type { useResizableWidth } from '../../hooks/use-resizable-width';

interface ResizeHandleProps {
  edge: 'left' | 'right';
  resize: ReturnType<typeof useResizableWidth>;
}

/** The drag strip on a panel's edge: a thin line on hover, the column cursor, and a cover while dragging. */
export function ResizeHandle(props: ResizeHandleProps) {
  const { edge, resize } = props;

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={resize.width}
        title="Drag to resize, double-click to reset"
        className={cn('group absolute top-0 bottom-0 w-[7px] z-20 cursor-col-resize', edge === 'right' ? '-right-[4px]' : '-left-[4px]')}
        {...resize.handle}
      >
        <span
          className={cn(
            'absolute top-0 bottom-0 left-[2px] w-[2px] transition-colors',
            resize.dragging ? 'bg-text-muted/60' : 'bg-transparent group-hover:bg-text-muted/35',
          )}
        />
      </div>
      {resize.dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </>
  );
}
