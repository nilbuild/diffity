import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { ConfirmDialogHost } from './components/ui/ConfirmDialog';
import { queryClient } from './lib/query';
import { useResolvedTheme, useThemeBootstrap } from './lib/theme';
import { WelcomePage } from './features/welcome/WelcomePage';
import { WorkspaceLayout } from './features/workspace/WorkspaceLayout';

export function App() {
  useThemeBootstrap();
  const theme = useResolvedTheme();

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/repo" element={<WorkspaceLayout />} />
        </Routes>
        <ConfirmDialogHost />
      </HashRouter>
      <Toaster position="bottom-right" theme={theme} richColors closeButton toastOptions={{ className: 'text-[13px]' }} />
    </QueryClientProvider>
  );
}
