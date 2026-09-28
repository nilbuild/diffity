import { QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, Route, Routes } from 'react-router';
import { Toaster } from 'sonner';
import { queryClient } from './lib/query';
import { WelcomePage } from './features/welcome/WelcomePage';
import { WorkspaceLayout } from './features/workspace/WorkspaceLayout';

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/repo" element={<WorkspaceLayout />} />
        </Routes>
      </HashRouter>
      <Toaster position="bottom-right" />
    </QueryClientProvider>
  );
}
