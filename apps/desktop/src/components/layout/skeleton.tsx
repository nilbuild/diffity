import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { BrandLogo } from '../icons/brand-logo';
import { cn } from '../../lib/cn';
import { Skeleton } from '../ui/skeleton';
import { TitleBar, Workspace } from './title-bar';
import { endOpening } from '../../lib/opening';
import { HomeSkeletonMain } from './home-skeleton';

/** Removes the static splash from index.html once React has painted something equivalent. */
export function hideStaticSplash() {
  endOpening();
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
  return <Skeleton className={className} />;
}

function storedSidebarWidth() {
  try {
    const stored = Number(localStorage.getItem('diffity-sidebar-width'));
    return stored > 0 ? stored : 300;
  } catch {
    return 300;
  }
}

const STEPS: { key: string; label: string }[] = [
  { key: 'repo-meta', label: 'Reading the repository' },
  { key: 'git-status', label: 'Reading git status' },
  { key: 'diff', label: 'Loading changes' },
  { key: 'threads', label: 'Loading comments' },
  { key: 'tree-paths', label: 'Listing files' },
  { key: 'commits', label: 'Reading history' },
];

function useLoadingStep(): string | null {
  const counts = STEPS.map((step) => ({ step, count: useIsFetching({ queryKey: [step.key] }) }));
  return counts.find((entry) => entry.count > 0)?.step.label ?? null;
}

function useDelayed(ms: number) {
  const [shown, setShown] = useState(ms === 0);

  useEffect(() => {
    if (ms === 0) {
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return shown;
}

/**
 * The opening state of a repository: the real layout (title bar with the repo name, sidebar rows, file cards) in
 * skeleton form. Bars appear after 150ms so cached switches never flash; a step label appears after 400ms and a
 * way back after a few seconds.
 */
export function OpeningSkeleton(props: { repoName: string; onCancel?: () => void; home?: boolean }) {
  const { repoName, onCancel, home = false } = props;
  const bars = useDelayed(150);
  const status = useDelayed(400);
  const slow = useDelayed(4000);
  const step = useLoadingStep() ?? 'Preparing the view';

  useEffect(() => {
    const el = document.getElementById('splash');
    if (!el) {
      return;
    }
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 180);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-frame font-sans">
      <TitleBar sidebarToggle={!home}>
        <span className="font-semibold text-text text-[13px] truncate max-w-[180px] px-1.5">{repoName}</span>
        {bars && !home && <Bar className="w-48 h-7" />}
      </TitleBar>
      <Workspace>
        <div className="relative flex flex-1 overflow-hidden">
          {home ? <HomeSkeletonMain repoName={repoName} /> : (
          <>
            <div className="shrink-0 border-r border-border bg-sidebar p-3 space-y-3" style={{ width: storedSidebarWidth() }}>
              {bars && (
                <>
                  <Bar className="h-8 w-full" />
                  <Bar className="h-7 w-full" />
                  {[70, 55, 80, 45, 62, 50].map((width, index) => (
                    <div key={index} className="flex items-center gap-2" style={{ paddingLeft: (index % 3) * 12 }}>
                      <Bar className="w-3.5 h-3.5" />
                      <div style={{ width: `${width}%` }}><Bar className="h-3" /></div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="h-10 shrink-0 border-b border-border-muted" />
              <div className="flex-1 px-5 py-4 space-y-4 overflow-hidden">
                {bars && [0, 1, 2].map((i) => <FileBlockSkeleton key={i} lines={i === 0 ? 8 : 5} />)}
              </div>
            </div>
          </>
          )}
          {status && (
            <div className="absolute left-1/2 top-16 -translate-x-1/2 flex items-center gap-2.5 h-9 pl-3 pr-2 rounded-full border border-overlay-border bg-overlay text-[13px] text-text-secondary animate-fade-in">
              <span className="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-secondary rounded-full animate-spin" />
              <span>Opening <span className="font-medium text-text">{repoName}</span> · {step}…</span>
              {slow && onCancel ? (
                <button onClick={onCancel} className="h-6 px-2 rounded-full text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer">Cancel</button>
              ) : <span className="w-1" />}
            </div>
          )}
        </div>
      </Workspace>
      <div className="h-8 shrink-0" />
    </div>
  );
}

export function DiffSkeleton() {
  const repoName = (window.location.hash.match(/#\/r\/([^/]+)/)?.[1] ?? '').split('%2F').pop() ?? '';

  return <OpeningSkeleton repoName={decodeURIComponent(repoName)} />;
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

/** Network enrichment that loads behind a view that is already usable; it never drives the progress bar. */
const BACKGROUND_KEYS = new Set(['github-details', 'pull-requests', 'github-auth', 'agents', 'setting', 'quick-open-roots', 'dir-suggestions']);

/** Thin bar along the top of the window while a page loads data for the first time or a mutation runs. */
export function TopProgress() {
  const loading = useIsFetching({
    predicate: (query) => query.state.data === undefined && query.state.status !== 'error' && !BACKGROUND_KEYS.has(String(query.queryKey[0])),
  });
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
