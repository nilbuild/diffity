import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { isMac, isTauri, modKey } from '../../lib/platform';
import { toggleSidebar, useUi } from '../../lib/ui-store';
import { SidebarIcon } from '../ui/icon';
import { useInsideRail } from './activity-rail';

interface TitleBarProps {
  children: ReactNode;
  className?: string;
  sidebarToggle?: boolean;
}

export const hasOverlayTitleBar = isTauri && isMac;

export function useSidebarShortcut() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== '\\') {
        return;
      }
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function SidebarToggle() {
  const collapsed = useUi((state) => state.sidebarCollapsed);

  return (
    <button
      onClick={toggleSidebar}
      title={`${collapsed ? 'Show' : 'Hide'} sidebar (${modKey}\\)`}
      aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      aria-pressed={!collapsed}
      className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer"
    >
      <SidebarIcon size="lg" />
    </button>
  );
}

export function TitleBar(props: TitleBarProps) {
  const { children, className, sidebarToggle = true } = props;
  const insideRail = useInsideRail();

  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex items-center gap-2 h-11 shrink-0 pr-2.5 bg-frame font-sans text-[13px] select-none',
        hasOverlayTitleBar && !insideRail && 'pl-[86px]',
        insideRail && (hasOverlayTitleBar ? (sidebarToggle ? 'pl-[26px]' : 'pl-[34px]') : 'pl-2'),
        !hasOverlayTitleBar && !insideRail && 'pl-3',
        className,
      )}
    >
      {insideRail && sidebarToggle && <SidebarToggle />}
      {children}
    </div>
  );
}

export function Workspace(props: { children: ReactNode; className?: string }) {
  const { children, className } = props;

  return (
    <div className={cn('flex flex-col flex-1 min-h-0 overflow-hidden bg-bg border-t border-l border-b border-frame-border rounded-l-[10px]', className)}>
      {children}
    </div>
  );
}

export function TitleBarDivider() {
  return <span className="w-px h-4 bg-frame-border shrink-0 mx-1" />;
}

export function RepoTitle(props: { name: string | null | undefined; path?: string }) {
  const { name, path } = props;

  if (!name) {
    return null;
  }
  return (
    <span data-tauri-drag-region className="font-semibold text-text text-[13px] truncate max-w-[180px] shrink-0 px-1" title={path}>
      {name}
    </span>
  );
}
