import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useQueryClient } from '@tanstack/react-query';
import { getRepoPathOrNull, setRepoPath } from '../lib/api';
import * as tauri from '../lib/tauri';
import { isTauri } from '../lib/platform';
import { queryClient } from '../lib/query-client';
import { AppSplash } from '../components/layout/skeleton';
import { useRepoEvents, useRepoNav, useRepoPath } from '../hooks/use-repo';
import { useTheme } from '../hooks/use-theme';
import { ClaudeApprovalModal } from '../features/claude/claude-approval-modal';
import { RouteErrorBoundary } from './route-error-boundary';

function repoName(repoPath: string) {
  return repoPath.split('/').filter(Boolean).pop() ?? 'repository';
}

function useWindowTitle(repoPath: string) {
  useEffect(() => {
    const name = repoPath.split('/').filter(Boolean).pop() ?? 'Diffity';
    document.title = name;
    if (!isTauri) {
      return;
    }
    getCurrentWindow().setTitle(name).catch(() => undefined);
  }, [repoPath]);
}

function usePrCheckout() {
  const [params, setParams] = useSearchParams();
  const nav = useRepoNav();
  const pr = params.get('pr');
  const started = useRef(false);

  useEffect(() => {
    if (!pr || started.current) {
      return;
    }
    started.current = true;
    const next = new URLSearchParams(params);
    next.delete('pr');
    setParams(next, { replace: true });
    const run = async () => {
      const auth = await tauri.githubAuthStatus();
      if (!auth.authenticated) {
        toast.info('Sign in to GitHub to check out the pull request', {
          description: 'Open the GitHub menu in the toolbar to sign in, then open the PR again.',
        });
        return;
      }
      const id = toast.loading('Checking out pull request…');
      try {
        const checkedOut = await tauri.checkoutPr(nav.repoPath, pr);
        toast.success(`Checked out #${checkedOut.number}`, { id, description: checkedOut.title });
        queryClient.invalidateQueries();
        nav.toDiff(`origin/${checkedOut.baseRef}...HEAD`);
      } catch (error) {
        toast.error('Could not check out the pull request', { id, description: tauri.errorMessage(error) });
      }
    };
    void run();
  }, [pr, params, setParams, nav]);
}

export function RepoLayout() {
  const repoPath = useRepoPath();
  const client = useQueryClient();
  const location = useLocation();
  const nav = useRepoNav();

  const previousRepo = getRepoPathOrNull();
  if (previousRepo !== repoPath) {
    setRepoPath(repoPath);
    if (previousRepo !== null) {
      client.clear();
    }
  }

  useTheme();
  useWindowTitle(repoPath);
  useRepoEvents(repoPath);
  usePrCheckout();

  useEffect(() => {
    tauri.openRepo(repoPath).catch(() => undefined);
  }, [repoPath]);

  return (
    <>
      <RouteErrorBoundary
        resetKey={location.pathname + location.search}
        actions={(reset, error) => {
          const code = tauri.isAppError(error) ? error.code : null;
          if (code === 'not_a_repo' || code === 'not_found') {
            return [{ label: 'Open another repository', primary: true, onClick: () => { reset(); nav.toWelcome(); } }];
          }
          return [
            { label: 'Try again', primary: true, onClick: () => { void client.resetQueries(); reset(); } },
            { label: 'Uncommitted changes', onClick: () => { reset(); nav.toDiff('work'); } },
            { label: 'Browse files', onClick: () => { reset(); nav.toTree(); } },
            { label: 'Open another repository', onClick: () => { reset(); nav.toWelcome(); } },
          ];
        }}
      >
        <Suspense fallback={<AppSplash label={`Opening ${repoName(repoPath)}…`} />}>
          <Outlet />
        </Suspense>
      </RouteErrorBoundary>
      <ClaudeApprovalModal />
    </>
  );
}
