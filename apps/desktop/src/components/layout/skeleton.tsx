import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { BrandLogo } from '../icons/brand-logo';
import { cn } from '../../lib/cn';
import { TitleBar, Workspace } from './title-bar';

/** Removes the static splash from index.html once React has painted something equivalent. */
export function hideStaticSplash() {
  const el = document.getElementById('splash');
  if (!el) {
    return;
  }
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 180);
}

/** Branded full-window loader, identical to the static splash in index.html. */
export function AppSplash(props: { label?: string }) {
  const { label } = props;
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    hideStaticSplash();
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div data-tauri-drag-region className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-bg font-sans select-none">
      <BrandLogo className="w-14 h-14" />
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        {label ?? 'Loading…'}
      </div>
      {slow && <p className="text-[11px] text-text-muted">Large repositories can take a few seconds…</p>}
    </div>
  );
}

function Bar(props: { className?: string }) {
  const { className } = props;
  return <div className={cn('rounded bg-bg-tertiary animate-pulse', className)} />;
}

function storedSidebarWidth() {
  try {
    const stored = Number(localStorage.getItem('diffity-sidebar-width'));
    return stored > 0 ? stored : 300;
  } catch {
    return 300;
  }
}

export function DiffSkeleton() {
  return (
    <div className="flex flex-col h-screen bg-frame font-sans">
      <TitleBar>
        <Bar className="w-16 h-4" />
        <Bar className="w-48 h-7" />
      </TitleBar>
      <Workspace>
        <div className="flex flex-1 overflow-hidden">
          <div className="shrink-0 border-r border-border bg-sidebar p-3 space-y-3" style={{ width: storedSidebarWidth() }}>
            <Bar className="h-8 w-full" />
            <Bar className="h-7 w-full" />
            {[70, 55, 80, 45, 62].map((width) => (
              <div key={width} style={{ width: `${width}%` }}>
                <Bar className="h-3.5" />
              </div>
            ))}
          </div>
          <div className="flex-1 px-5 py-4 space-y-4 overflow-hidden">
            {[0, 1, 2].map((i) => (
              <FileBlockSkeleton key={i} lines={i === 0 ? 8 : 5} />
            ))}
          </div>
        </div>
      </Workspace>
      <div className="h-8 shrink-0" />
    </div>
  );
}

export function FileBlockSkeleton(props: { lines?: number }) {
  const { lines = 6 } = props;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="flex items-center gap-3 h-8 px-3 bg-bg-secondary border-b border-border">
        <Bar className="w-40 h-3.5" />
        <Bar className="ml-auto w-16 h-3" />
      </div>
      <div className="px-3 py-2 space-y-2">
        {Array.from({ length: lines }, (_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Bar className="w-6 h-3" />
            <div style={{ width: `${30 + ((i * 37) % 55)}%` }}>
              <Bar className="h-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Thin bar along the top of the window while a page loads data for the first time or a mutation runs. */
export function TopProgress() {
  const loading = useIsFetching({ predicate: (query) => query.state.data === undefined && query.state.status !== 'error' });
  const mutating = useIsMutating();
  const active = loading + mutating > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      const timer = setTimeout(() => setVisible(true), 120);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-0.5 overflow-hidden pointer-events-none">
      <div className={cn('h-full bg-accent top-progress', !active && 'top-progress-done')} />
    </div>
  );
}
