import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { create } from 'zustand';
import { BrandLogo } from '../icons/brand-logo';
import { cn } from '../../lib/cn';
import { Skeleton } from '../ui/skeleton';
import { Breadcrumb, CurrentCrumb, TitleBar, Workspace } from './title-bar';
import { endOpening } from '../../lib/opening';
import { HomeSkeletonMain } from './home-skeleton';
import { HomeTitleBar } from './home-title-bar';
import { StatusBar } from './status-bar';
import { OptionsMenu } from './options-menu';
import { Spinner } from '../icons/spinner';
import { CommentsButton } from '../../features/comments/comments-button';
import { useTheme } from '../../hooks/use-theme';
import { useNavigationPending } from '../../hooks/use-navigation-pending';

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
    <div data-tauri-drag-region className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-frame font-sans select-none">
      <BrandLogo className="w-14 h-14" />
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Spinner className="w-3.5 h-3.5 text-accent" />
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

/** Like `Skeleton`'s: an instance mounting this soon after a shown one unmounted is shown at once. */
const HANDOVER = 250;
const shownCount = new Map<number, number>();
const lastShownAt = new Map<number, number>();

function shownNow(ms: number): boolean {
  if (ms === 0 || (shownCount.get(ms) ?? 0) > 0) {
    return true;
  }
  const last = lastShownAt.get(ms);
  return last !== undefined && performance.now() - last < HANDOVER;
}

/**
 * True once `ms` have passed since mount. One loading view replacing another that had already shown its delayed
 * parts (the opening skeleton swapped for the page's own) starts shown, so they don't blink out and back in.
 */
export function useDelayed(ms: number) {
  const [shown, setShown] = useState(() => shownNow(ms));

  useEffect(() => {
    if (shown) {
      return;
    }
    const timer = setTimeout(() => setShown(true), ms);
    return () => clearTimeout(timer);
  }, [ms, shown]);

  useEffect(() => {
    if (!shown) {
      return;
    }
    shownCount.set(ms, (shownCount.get(ms) ?? 0) + 1);
    return () => {
      shownCount.set(ms, Math.max(0, (shownCount.get(ms) ?? 1) - 1));
      lastShownAt.set(ms, performance.now());
    };
  }, [ms, shown]);
  return shown;
}

export type OpeningView = 'diff' | 'files' | 'home';

/** The diff and Files title bars with what is known before the page loads, at the real positions and sizes. */
function OpeningTitleBar(props: { repoName: string; view: OpeningView }) {
  const { repoName, view } = props;
  const { theme, toggleTheme } = useTheme();

  return (
    <TitleBar>
      <div data-tauri-drag-region className="flex items-center gap-2.5 min-w-0 shrink">
        <Breadcrumb name={repoName}>
          {view === 'files' && <CurrentCrumb>Files</CurrentCrumb>}
        </Breadcrumb>
      </div>
      <div data-tauri-drag-region className="flex-1 min-w-2 self-stretch" />
      <div className="flex items-center gap-2 shrink-0">
        {view === 'diff' && (
          <>
            <CommentsButton />
            <Skeleton className="w-[102px] @max-3xl/titlebar:w-[38px] h-7 rounded-md" />
          </>
        )}
        <OptionsMenu theme={theme} onToggleTheme={toggleTheme} />
      </div>
    </TitleBar>
  );
}

/**
 * The opening state of a repository: the real layout (title bar with the repo name, sidebar rows, file cards) in
 * skeleton form. Bars appear after 150ms so cached switches never flash; a step label appears after 400ms and a
 * way back after a few seconds.
 */
export function OpeningSkeleton(props: { repoName: string; onCancel?: () => void; view?: OpeningView; diffRef?: string }) {
  const { repoName, onCancel, view = 'diff', diffRef } = props;
  const home = view === 'home';
  const status = useDelayed(400);
  const [statusHandedOver] = useState(status);
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
      {home ? <HomeTitleBar name={repoName} /> : <OpeningTitleBar repoName={repoName} view={view} />}
      <Workspace>
        <div className="relative flex flex-1 overflow-hidden">
          {home ? <HomeSkeletonMain repoName={repoName} /> : (
          <>
            <div className="shrink-0 border-r border-border bg-sidebar p-3 space-y-3" style={{ width: storedSidebarWidth() }}>
              <Bar className="h-8 w-full" />
              <Bar className="h-7 w-full" />
              {[70, 55, 80, 45, 62, 50].map((width, index) => (
                <div key={index} className="flex items-center gap-2" style={{ paddingLeft: (index % 3) * 12 }}>
                  <Bar className="w-3.5 h-3.5" />
                  <div style={{ width: `${width}%` }}><Bar className="h-3" /></div>
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center h-10 shrink-0 px-5 border-b border-border-muted">
                <Bar className="w-48 h-7" />
              </div>
              <div className="flex-1 px-5 py-4 space-y-4 overflow-hidden">
                {[0, 1, 2].map((i) => <FileBlockSkeleton key={i} lines={i === 0 ? 8 : 5} />)}
              </div>
            </div>
          </>
          )}
          {status && (
            <div className={cn('absolute left-1/2 top-16 -translate-x-1/2 flex items-center gap-2.5 h-9 pl-3 pr-2 rounded-full border border-overlay-border bg-overlay text-[13px] text-text-secondary', !statusHandedOver && 'animate-fade-in')}>
              <Spinner className="w-3.5 h-3.5 text-text-secondary" />
              <span>Opening <span className="font-medium text-text">{repoName}</span> · {step}…</span>
              {slow && onCancel ? (
                <button onClick={onCancel} className="h-6 px-2 rounded-full text-xs text-text-secondary hover:text-text hover:bg-hover cursor-pointer">Cancel</button>
              ) : <span className="w-1" />}
            </div>
          )}
        </div>
      </Workspace>
      <StatusBar diffRef={view === 'diff' ? diffRef : undefined} />
    </div>
  );
}

/** Which page a repository URL shows, for drawing its opening skeleton. */
export function openingViewFor(pathname: string): OpeningView {
  if (pathname.endsWith('/overview')) {
    return 'home';
  }
  return pathname.endsWith('/tree') ? 'files' : 'diff';
}

export function DiffSkeleton() {
  const repoName = (window.location.hash.match(/#\/r\/([^/?]+)/)?.[1] ?? '').split('%2F').pop() ?? '';
  const hashPath = window.location.hash.slice(1).split('?')[0];
  const diffRef = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('ref') || 'work';

  return <OpeningSkeleton repoName={decodeURIComponent(repoName)} view={openingViewFor(hashPath)} diffRef={diffRef} />;
}

/** A file card placeholder that stays out of sight for the first 150ms, so quick loads never flash a frame. */
export function DelayedFileSkeleton(props: { lines?: number }) {
  const { lines } = props;
  const shown = useDelayed(150);

  if (!shown) {
    return null;
  }
  return <FileBlockSkeleton lines={lines} />;
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

/** Pending lines running now; the top progress bar stays out of their way so there's one indicator at a time. */
const usePendingLines = create<{ count: number }>(() => ({ count: 0 }));

/**
 * A thin indeterminate line along the top of the workspace, under the title bar, for a screen that stays up while
 * the next one loads (a view switch, a diff option). It appears only once the wait is noticeable.
 */
export function PendingLine(props: { pending: boolean; className?: string }) {
  const { pending, className } = props;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    usePendingLines.setState((state) => ({ count: state.count + 1 }));
    const timer = setTimeout(() => setVisible(true), 200);
    return () => {
      clearTimeout(timer);
      usePendingLines.setState((state) => ({ count: state.count - 1 }));
    };
  }, [pending]);

  if (!visible) {
    return null;
  }
  return (
    <div role="progressbar" aria-label="Loading" className={cn('absolute left-0 right-0 top-11 z-30 h-0.5 overflow-hidden pointer-events-none', className)}>
      <div className="h-full bg-accent/70 pending-line" />
    </div>
  );
}

/** `PendingLine` for navigations: the router keeps the current screen up until the next one is ready. */
export function NavigationProgress() {
  return <PendingLine pending={useNavigationPending()} />;
}

/** Network enrichment that loads behind a view that is already usable; it never drives the progress bar. */
const BACKGROUND_KEYS = new Set(['github-details', 'pull-requests', 'github-auth', 'agents', 'setting', 'quick-open-roots', 'dir-suggestions', 'pr-inbox', 'recent-remotes']);

/** Thin bar along the top of the window while a page loads data for the first time or a mutation runs. */
export function TopProgress() {
  const loading = useIsFetching({
    predicate: (query) => query.state.data === undefined && query.state.status !== 'error' && !BACKGROUND_KEYS.has(String(query.queryKey[0])),
  });
  const mutating = useIsMutating();
  const linePending = usePendingLines((state) => state.count > 0);
  const active = loading + mutating > 0 && !linePending;
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
