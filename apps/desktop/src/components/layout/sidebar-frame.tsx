import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { inputField } from '../ui/button-styles';
import { CommentIcon } from '../icons/comment-icon';
import { SearchIcon } from '../icons/search-icon';
import { PanelLeftOpen } from 'lucide-react';
import { XIcon } from '../icons/x-icon';
import { ViewTabs, type RepoView } from './view-tabs';

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
  collapsed: boolean;
  onExpand: () => void;
  view: RepoView;
  storageKey?: string;
  defaultWidth?: number;
  children: ReactNode;
}

export function SidebarFrame(props: SidebarFrameProps) {
  const { collapsed, onExpand, view, storageKey = WIDTH_KEY, defaultWidth = DEFAULT_WIDTH, children } = props;
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
      <div className="w-11 min-w-11 border-r border-border bg-bg-secondary flex flex-col items-center gap-1 pt-2">
        <button
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover cursor-pointer"
          onClick={onExpand}
          title="Show sidebar"
        >
          <PanelLeftOpen size={16} strokeWidth={1.75} />
        </button>
        <div className="w-5 h-px bg-border my-1" />
        <ViewTabs current={view} vertical />
      </div>
    );
  }

  return (
    <aside
      className="relative shrink-0 bg-bg-secondary flex border-r border-border"
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

interface SidebarHeaderProps {
  title: ReactNode;
  actions?: ReactNode;
}

export function SidebarHeader(props: SidebarHeaderProps) {
  const { title, actions } = props;

  return (
    <div className="flex items-center justify-between gap-2 h-10 pl-4 pr-2 shrink-0">
      <span className="flex items-center gap-2 min-w-0 text-[13px] font-medium text-text">{title}</span>
      {actions && <div className="flex items-center gap-0.5 shrink-0">{actions}</div>}
    </div>
  );
}

export function SidebarIconButton(props: { title: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  const { title, onClick, active, children } = props;

  return (
    <button
      className={cn(
        'w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer',
        active ? 'bg-selected text-text' : 'text-text-secondary hover:text-text hover:bg-hover',
      )}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
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
    <div className="flex items-center gap-1.5 px-3 pb-2 shrink-0">
      <div className="relative flex-1 min-w-0">
        <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" />
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
            <XIcon className="w-3 h-3" />
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
        active ? 'bg-selected text-text border-transparent' : 'bg-raised border-border text-text-secondary hover:border-control-border hover:text-text',
      )}
      onClick={onToggle}
      title={active ? 'Show all files' : 'Show only files with open comments'}
      aria-pressed={active}
    >
      <CommentIcon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

