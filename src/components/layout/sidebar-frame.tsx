import { forwardRef, useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { buttonIconOutline, inputField } from '../ui/button-styles';
import { ViewTabs, type RepoView } from './view-tabs';
import { useUi } from '../../lib/ui-store';
import { CommentIcon, EllipsisIcon, SearchIcon, XIcon } from '../ui/icon';
import { Popover, useMenu } from '../ui/popover';
import { useRepoPath } from '../../hooks/use-repo';
import { requestSearchFocus } from '../../features/code-search/code-search';
import { KeyLabel } from '../ui/key-label';
import { ResizeHandle } from '../ui/resize-handle';
import { useResizableWidth } from '../../hooks/use-resizable-width';

const WIDTH_KEY = 'diffity-sidebar-width';
const DEFAULT_WIDTH = 300;

interface SidebarFrameProps {
  view: RepoView;
  collapsible?: boolean;
  storageKey?: string;
  defaultWidth?: number;
  /** Views that can't open from here, with the reason shown on hover. */
  disabledViews?: Partial<Record<RepoView, string>>;
  children: ReactNode;
}

export function SidebarFrame(props: SidebarFrameProps) {
  const { view, collapsible = true, storageKey = WIDTH_KEY, defaultWidth = DEFAULT_WIDTH, disabledViews, children } = props;
  const collapsedSetting = useUi((state) => state.sidebarCollapsed);
  const collapsed = collapsible && collapsedSetting;
  const resize = useResizableWidth({ storageKey, defaultWidth, minWidth: 220, maxFraction: 0.5, edge: 'right' });
  const repoPath = useRepoPath();

  useEffect(() => {
    if (view !== 'diff' && view !== 'tree') {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== 'f') {
        return;
      }
      event.preventDefault();
      // Text selected in the code (one line) becomes the query.
      const selected = window.getSelection()?.toString().trim() ?? '';
      const query = selected && !selected.includes('\n') && selected.length <= 200 ? selected : undefined;
      requestSearchFocus(repoPath, 'code', query);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, repoPath]);

  if (collapsed) {
    return (
      <div className="w-12 min-w-12 shrink-0 border-r border-border bg-sidebar flex flex-col items-center pt-2">
        <ViewTabs current={view} disabled={disabledViews} vertical />
      </div>
    );
  }

  return (
    <aside
      className="relative shrink-0 bg-sidebar flex border-r border-border"
      style={{ width: resize.width }}
    >
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <ViewTabs current={view} disabled={disabledViews} />
        {children}
      </div>
      <ResizeHandle edge="right" resize={resize} />
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
        className={cn(buttonIconOutline, menu.open && 'bg-control-hover text-text')}
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
  /** Inside the field, before the text (the search mode switch); replaces the search icon. */
  leading?: ReactNode;
  invalid?: boolean;
  /** Runs before the field's own keys; `preventDefault()` skips them (Escape clearing the field). */
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
}

export const SidebarFilter = forwardRef<HTMLInputElement, SidebarFilterProps>(function SidebarFilter(props, ref) {
  const { value, onChange, placeholder, shortcut, leading, invalid = false, onKeyDown, trailing } = props;

  return (
    <div className="flex items-center gap-1 px-3 pt-1 pb-2 shrink-0">
      <div className="relative flex-1 min-w-0">
        {leading ?? <SearchIcon size="sm" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />}
        <input
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          ref={ref}
          className={cn(inputField, leading ? 'pl-10' : 'pl-8', shortcut && shortcut.length > 1 ? 'pr-12' : 'pr-7', invalid && 'border-deleted focus:border-deleted focus:hover:border-deleted hover:border-deleted')}
          type="text"
          placeholder={placeholder}
          aria-label={placeholder}
          aria-invalid={invalid || undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            onKeyDown?.(event);
            if (event.defaultPrevented) {
              return;
            }
            if (event.key === 'Escape') {
              onChange('');
              event.currentTarget.blur();
            }
          }}
        />
        {!value && shortcut && (
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded border border-border text-[10px] font-sans text-text-muted pointer-events-none">
            <KeyLabel keys={shortcut} size={10} />
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

/** Icon-only toggle: the tree's own badges carry the counts, so this shows none. */
export function CommentedOnlyToggle(props: { active: boolean; onToggle: () => void }) {
  const { active, onToggle } = props;

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center shrink-0 w-7 h-7 rounded-md border transition-colors cursor-pointer',
        active ? 'bg-selected text-text border-transparent' : 'bg-raised border-control-border text-text-secondary hover:bg-control-hover hover:text-text',
      )}
      onClick={onToggle}
      title="Show only files with comments"
      aria-label="Show only files with comments"
      aria-pressed={active}
    >
      <CommentIcon size="sm" />
    </button>
  );
}

