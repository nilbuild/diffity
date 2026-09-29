import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { isMac, isTauri } from '../../lib/platform';

interface TitleBarProps {
  children: ReactNode;
  className?: string;
}

export const hasOverlayTitleBar = isTauri && isMac;

export function TitleBar(props: TitleBarProps) {
  const { children, className } = props;

  return (
    <div
      data-tauri-drag-region
      className={cn(
        'flex items-center gap-2 h-11 shrink-0 px-3 bg-bg-secondary border-b border-border font-sans text-xs select-none',
        hasOverlayTitleBar && 'pl-[84px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TitleBarDivider() {
  return <span className="w-px h-4 bg-border shrink-0 mx-0.5" />;
}

export function RepoTitle(props: { name: string | null | undefined; path?: string }) {
  const { name, path } = props;

  if (!name) {
    return null;
  }
  return (
    <span data-tauri-drag-region className="font-semibold text-text text-[13px] truncate max-w-[160px] shrink-0 pr-1" title={path}>
      {name}
    </span>
  );
}
