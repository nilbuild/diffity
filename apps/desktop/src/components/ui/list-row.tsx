import { useState, type ReactNode } from 'react';
import { ChevronRightIcon, EllipsisIcon } from './icon';
import { ContextMenu, MenuItem, Popover, useMenu } from './popover';
import { Skeleton } from './skeleton';

export const ROW_GRID = 'grid grid-cols-[20px_minmax(0,1fr)_auto_28px] items-center gap-3';

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

interface ListRowProps {
  icon: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  stats?: ReactNode;
  onClick: () => void;
  actions?: RowAction[];
  tooltip?: string;
}

/** One row layout for every list on Home: the whole row opens the item; secondary actions live behind ⋯ / right-click. */
export function ListRow(props: ListRowProps) {
  const { icon, title, meta, stats, onClick, actions = [], tooltip } = props;
  const menu = useMenu();
  const [contextAt, setContextAt] = useState<{ x: number; y: number } | null>(null);
  const hasActions = actions.length > 0;

  const renderItems = (close: () => void) => actions.map((action) => (
    <MenuItem
      key={action.label}
      icon={action.icon}
      label={action.label}
      onSelect={() => {
        close();
        action.onSelect();
      }}
    />
  ));

  return (
    <li className="group relative">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            onClick();
          }
        }}
        onContextMenu={(event) => {
          if (!hasActions) {
            return;
          }
          event.preventDefault();
          setContextAt({ x: event.clientX, y: event.clientY });
        }}
        title={tooltip}
        className={`${ROW_GRID} w-full min-h-[52px] px-3 py-1.5 rounded-lg text-left hover:bg-hover focus-visible:bg-hover outline-none transition-colors cursor-pointer`}
      >
        <span className="flex justify-center text-text-secondary">{icon}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] leading-5 text-text">{title}</span>
          {meta && <span className="flex items-center gap-1.5 min-w-0 text-xs leading-5 text-text-muted">{meta}</span>}
        </span>
        <span className="flex justify-end">{stats}</span>
        <span className="relative flex items-center justify-center w-7 h-7">
          <ChevronRightIcon size="sm" className={`text-text-muted group-hover:text-text-secondary transition-colors ${hasActions ? 'group-hover:opacity-0' : ''}`} />
          {hasActions && (
            <button
              ref={menu.anchorRef}
              onClick={(event) => {
                event.stopPropagation();
                menu.toggle();
              }}
              className="absolute inset-0 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-active opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
              title="More actions"
              aria-label="More actions"
            >
              <EllipsisIcon size="md" />
            </button>
          )}
        </span>
      </div>
      {hasActions && (
        <>
          <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={220}>
            {renderItems(menu.close)}
          </Popover>
          <ContextMenu position={contextAt} onClose={() => setContextAt(null)}>
            {renderItems(() => setContextAt(null))}
          </ContextMenu>
        </>
      )}
    </li>
  );
}

const TITLE_WIDTHS = ['58%', '44%', '66%', '38%', '52%', '47%'];

/** Placeholder with the exact box of a `ListRow`: icon, title and meta lines, stats, chevron column. */
export function ListRowSkeleton(props: { index?: number; avatar?: boolean }) {
  const { index = 0, avatar = false } = props;

  return (
    <li aria-hidden className={`${ROW_GRID} min-h-[52px] px-3 py-1.5`}>
      <span className="flex justify-center">
        <Skeleton circle className="w-4 h-4" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center h-5">
          <Skeleton className="h-3" style={{ width: TITLE_WIDTHS[index % TITLE_WIDTHS.length] }} />
        </span>
        <span className="flex items-center gap-1.5 h-5">
          {avatar && <Skeleton circle className="w-4 h-4" />}
          <Skeleton className="w-40 h-2.5" />
        </span>
      </span>
      <span className="flex justify-end">
        <Skeleton className="w-20 h-2.5" />
      </span>
      <span className="w-7" />
    </li>
  );
}

export function StatCell(props: { additions: number; deletions: number; bar: ReactNode }) {
  const { additions, deletions, bar } = props;

  return (
    <span className="inline-flex items-center justify-end gap-1.5 font-mono text-[11px] tabular-nums whitespace-nowrap">
      {additions > 0 && <span className="text-added">+{additions}</span>}
      {deletions > 0 && <span className="text-deleted">−{deletions}</span>}
      <span className="ml-1">{bar}</span>
    </span>
  );
}
