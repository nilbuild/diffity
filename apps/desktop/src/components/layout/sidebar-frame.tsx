import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { inputField } from '../ui/button-styles';
import { ViewTabs, type RepoView } from './view-tabs';
import { useUi } from '../../lib/ui-store';
import { CommentIcon, EllipsisIcon, SearchIcon, XIcon } from '../ui/icon';
import { Popover, useMenu } from '../ui/popover';

const WIDTH_KEY = 'diffity-sidebar-width';
const DEFAULT_WIDTH = 300;
const MIN_WIDTH = 220;

function maxWidth() {
  return Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.5));
}

function clampWidth(width: number) {
  return Math.min(maxWidth(), Math.max(MIN_WIDTH, Math.round(width)));
}

function readStoredWidth(key: string, fallback: number) {
  try {
    const stored = Number(localStorage.getItem(key));
    if (!stored) {
      return clampWidth(fallback);
    }
    return clampWidth(stored);
  } catch {
    return fallback;
  }
}

function storeWidth(key: string, width: number | null) {
  try {
    if (width === null) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, String(width));
  } catch {
    return;
  }
}

interface SidebarFrameProps {
  view: RepoView;
  collapsible?: boolean;
  storageKey?: string;
  defaultWidth?: number;
  children: ReactNode;
}

export function SidebarFrame(props: SidebarFrameProps) {
  const { view, collapsible = true, storageKey = WIDTH_KEY, defaultWidth = DEFAULT_WIDTH, children } = props;
  const collapsedSetting = useUi((state) => state.sidebarCollapsed);
  const collapsed = collapsible && collapsedSetting;
  const [width, setWidth] = useState(() => readStoredWidth(storageKey, defaultWidth));
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const onResize = () => setWidth((current) => clampWidth(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: width };
    setDragging(true);
  }, [width]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    setWidth(clampWidth(drag.current.startWidth + event.clientX - drag.current.startX));
  }, []);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) {
      return;
    }
    event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
    setDragging(false);
    setWidth((current) => {
      storeWidth(storageKey, current);
      return current;
    });
  }, [storageKey]);

  const handleReset = useCallback(() => {
    storeWidth(storageKey, null);
    setWidth(clampWidth(defaultWidth));
  }, [storageKey, defaultWidth]);

  if (collapsed) {
    return (
      <div className="w-12 min-w-12 shrink-0 border-r border-border bg-sidebar flex flex-col items-center pt-2">
        <ViewTabs current={view} vertical />
      </div>
    );
  }

  return (
    <aside
      className="relative shrink-0 bg-sidebar flex border-r border-border"
      style={{ width }}
    >
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ViewTabs current={view} />
        {children}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={width}
        title="Drag to resize, double-click to reset"
        className="group absolute top-0 -right-[4px] bottom-0 w-[7px] z-20 cursor-col-resize"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleReset}
      >
        <span
          className={cn(
            'absolute top-0 bottom-0 left-[2px] w-[2px] transition-colors',
            dragging ? 'bg-text-muted/60' : 'bg-transparent group-hover:bg-text-muted/35',
          )}
        />
      </div>
      {dragging && <div className="fixed inset-0 z-50 cursor-col-resize" />}
    </aside>
  );
}

export function SidebarMenu(props: { title: string; children: (close: () => void) => ReactNode }) {
  const { title, children } = props;
  const menu = useMenu();

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        title={title}
        aria-label={title}
        aria-expanded={menu.open}
        className={cn(
          'w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer',
          menu.open ? 'bg-active text-text' : 'text-text-secondary hover:text-text hover:bg-hover',
        )}
      >
        <EllipsisIcon size="md" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={220}>
        {children(menu.close)}
      </Popover>
    </>
  );
}

export function SidebarSummary(props: { children: ReactNode }) {
  const { children } = props;

  return (
    <div className="flex items-center gap-2 h-6 px-4 pb-1 shrink-0 text-xs text-text-secondary tabular-nums">
      {children}
    </div>
  );
}

interface SidebarFilterProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  shortcut?: string;
  trailing?: ReactNode;
}

export const SidebarFilter = forwardRef<HTMLInputElement, SidebarFilterProps>(function SidebarFilter(props, ref) {
  const { value, onChange, placeholder, shortcut, trailing } = props;

  return (
    <div className="flex items-center gap-1 px-3 pt-1 pb-2 shrink-0">
      <div className="relative flex-1 min-w-0">
        <SearchIcon size="sm" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          ref={ref}
          className={cn(inputField, 'pl-8 pr-7')}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onChange('');
              event.currentTarget.blur();
            }
          }}
        />
        {!value && shortcut && (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded border border-border text-[10px] font-sans text-text-muted pointer-events-none">
            {shortcut}
          </kbd>
        )}
        {value && (
          <button
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 inline-flex items-center justify-center rounded text-text-muted hover:text-text hover:bg-hover cursor-pointer"
            onClick={() => onChange('')}
            title="Clear filter"
          >
            <XIcon size="xs" />
          </button>
        )}
      </div>
      {trailing}
    </div>
  );
});

export function CommentedOnlyToggle(props: { active: boolean; count: number; onToggle: () => void }) {
  const { active, count, onToggle } = props;
  const label = count > 99 ? '99+' : String(count);

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1.5 shrink-0 h-7 px-2 rounded-md border text-xs font-medium tabular-nums transition-colors cursor-pointer',
        active ? 'bg-selected text-text border-transparent' : 'bg-raised border-control-border text-text-secondary hover:bg-control-hover hover:text-text',
      )}
      onClick={onToggle}
      title={active ? 'Show all files' : 'Show only files with open comments'}
      aria-pressed={active}
    >
      <CommentIcon size="sm" />
      {label}
    </button>
  );
}

