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
        'flex items-center gap-3 px-4 py-1.5 bg-bg-secondary border-b border-border font-sans text-xs select-none',
        hasOverlayTitleBar && 'pl-[78px]',
        className,
      )}
    >
      {children}
    </div>
  );
}
