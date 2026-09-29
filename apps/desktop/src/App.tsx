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
      </HashRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            fontSize: '13px',
          },
        }}
      />
    </QueryClientProvider>
  );
}
