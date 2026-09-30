import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { isMac, isTauri, modKey } from '../../lib/platform';
import { toggleSidebar, useUi } from '../../lib/ui-store';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { ChevronDownIcon, EditorIcon, HomeIcon, RevealIcon, SidebarIcon, SwapIcon } from '../ui/icon';
import { MenuItem, MenuSeparator, Popover, useMenu } from '../ui/popover';
import { errorMessage, openInEditor } from '../../lib/api';
import { openQuickOpen } from '../../features/palette/quick-open';
import { useEditorName } from '../../hooks/use-editor-name';
import { useInsideRail } from './activity-rail';
import { useRepoNav } from '../../hooks/use-repo';

interface TitleBarProps {
  children: ReactNode;
  className?: string;
  sidebarToggle?: boolean;
}

export const hasOverlayTitleBar = isTauri && isMac;

export function useSidebarShortcut() {
  const nav = useRepoNav();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'h') {
        event.preventDefault();
        nav.toOverview();
        return;
      }
      if (event.key !== '\\') {
        return;
      }
      event.preventDefault();
      toggleSidebar();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nav]);
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

function RepoCrumb(props: { name: string; path?: string }) {
  const { name, path } = props;
  const nav = useRepoNav();
  const editor = useEditorName();
  const menu = useMenu();
  const run = (action: () => void) => () => {
    menu.close();
    action();
  };

  return (
    <div className={cn('group/crumb flex items-center shrink-0 max-w-[220px] rounded-md hover:bg-hover transition-colors', menu.open && 'bg-hover')}>
      <button
        onClick={nav.toOverview}
        className="flex items-center gap-1.5 h-7 min-w-0 pl-1.5 pr-1 rounded-l-md font-semibold text-text text-[13px] cursor-pointer"
        title={`Home (${modKey}⇧H)${path ? `\n${path}` : ''}`}
      >
        <HomeIcon size="sm" className="shrink-0 text-text-muted group-hover/crumb:text-text-secondary transition-colors" />
        <span className="truncate">{name}</span>
      </button>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title="Project actions"
        className={cn(
          'flex items-center justify-center h-7 w-5 shrink-0 rounded-r-md text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer',
          menu.open && 'text-text',
        )}
      >
        <ChevronDownIcon size="xs" />
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} width={240}>
        <MenuItem icon={<HomeIcon size="sm" />} label="Home" hint={`${modKey}⇧H`} onSelect={run(nav.toOverview)} />
        <MenuItem icon={<SwapIcon size="sm" />} label="Switch project…" hint={`${modKey}O`} onSelect={run(openQuickOpen)} />
        <MenuSeparator />
        <MenuItem
          icon={<EditorIcon size="sm" />}
          label={`Open in ${editor}`}
          onSelect={run(() => {
            openInEditor('').catch((error) => toast.error('Could not open the editor', { description: errorMessage(error) }));
          })}
        />
        <MenuItem
          icon={<RevealIcon size="sm" />}
          label="Reveal in Finder"
          onSelect={run(() => {
            revealItemInDir(path ?? nav.repoPath).catch(() => undefined);
          })}
        />
      </Popover>
    </div>
  );
}

export function CurrentCrumb(props: { children: ReactNode; icon?: ReactNode }) {
  const { children, icon } = props;

  return (
    <span aria-current="page" className="flex items-center gap-1.5 h-7 px-1.5 min-w-0 font-medium text-text-secondary cursor-default">
      {icon && <span className="shrink-0 text-text-muted">{icon}</span>}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function Breadcrumb(props: { name: string | null | undefined; path?: string; children?: ReactNode }) {
  const { name, path, children } = props;

  if (!name) {
    return null;
  }
  return (
    <nav aria-label="Breadcrumb" data-tauri-drag-region className="flex items-center gap-1 min-w-0 shrink">
      <RepoCrumb name={name} path={path} />
      {children && (
        <>
          <span aria-hidden className="shrink-0 px-0.5 text-text-muted/60 select-none">/</span>
          <div className="flex items-center min-w-0 shrink">{children}</div>
        </>
      )}
    </nav>
  );
}
