import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { openUrl } from '@tauri-apps/plugin-opener';
import { queryClient } from './lib/query-client';
import { isTauri } from './lib/platform';
import { WelcomePage } from './routes/welcome';
import { RepoLayout } from './routes/repo-layout';
import { DiffRoute } from './routes/diff';
import { TreeRoute } from './routes/tree';
import { OverviewRoute } from './routes/overview';
import { SettingsDialog } from './features/settings/settings-dialog';
import { ShortcutModal } from './components/layout/shortcut-modal';
import { TopProgress, hideStaticSplash } from './components/layout/skeleton';
import { closeShortcuts, openSettings, openShortcuts, useUi } from './lib/ui-store';

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function useGlobalShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ',') {
        event.preventDefault();
        openSettings();
        return;
      }
      if (event.key === '?' && !isTyping(event.target)) {
        event.preventDefault();
        openShortcuts();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function GlobalShortcutModal() {
  const open = useUi((state) => state.shortcutsOpen);
  if (!open) {
    return null;
  }
  return <ShortcutModal onClose={closeShortcuts} />;
}

function useExternalLinks() {
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const handler = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('a');
      const href = anchor?.getAttribute('href');
      if (!href || !/^https?:\/\//.test(href)) {
        return;
      }
      event.preventDefault();
      void openUrl(href);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);
}

export function App() {
  useExternalLinks();
  useGlobalShortcuts();

  useEffect(() => {
    const timer = setTimeout(hideStaticSplash, 10_000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/r/:repo" element={<RepoLayout />}>
            <Route index element={<Navigate to="diff" replace />} />
            <Route path="diff" element={<DiffRoute />} />
            <Route path="tree" element={<TreeRoute />} />
            <Route path="overview" element={<OverviewRoute />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <SettingsDialog />
        <GlobalShortcutModal />
      </HashRouter>
      <TopProgress />
      <Toaster
        position="bottom-right"
        offset={{ bottom: 40, right: 16 }}
        gap={8}
        toastOptions={{
          style: {
            background: 'var(--color-overlay)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-overlay-border)',
            borderRadius: '10px',
            boxShadow: 'none',
            fontSize: '13px',
            fontFamily: 'var(--font-sans)',
            padding: '12px 14px',
          },
          classNames: {
            description: '!text-text-secondary !text-xs',
          },
        }}
      />
    </QueryClientProvider>
  );
}
