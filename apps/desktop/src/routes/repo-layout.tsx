import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useQueryClient } from '@tanstack/react-query';
import { getRepoPathOrNull, setRepoPath } from '../lib/api';
import * as tauri from '../lib/tauri';
import { isTauri } from '../lib/platform';
import { AppSplash } from '../components/layout/skeleton';
import { useRepoEvents, useRepoNav, useRepoPath } from '../hooks/use-repo';
import { useTheme } from '../hooks/use-theme';
import { ClaudeApprovalModal } from '../features/claude/claude-approval-modal';
import { RouteErrorBoundary } from './route-error-boundary';
import { CommentsPanel } from '../features/comments/comments-panel';
import { toggleComments } from '../lib/ui-store';
import { PullRequestsDialog } from '../features/pr/pull-requests-dialog';
import { CheckoutGuardDialog } from '../features/pr/checkout-guard-dialog';
import { checkoutPullRequest } from '../features/pr/pr-checkout';
import { RailFrame } from '../components/layout/activity-rail';
import { activateRepoCache, rememberLocation } from '../lib/repo-locations';

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
    void checkoutPullRequest(nav.repoPath, pr, nav.toDiff);
  }, [pr, params, setParams, nav]);
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) {
    return false;
  }
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function useCommentsShortcut() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'c' || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) {
        return;
      }
      if (document.querySelector('dialog[open]')) {
        return;
      }
      event.preventDefault();
      toggleComments();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export function RepoLayout() {
  const repoPath = useRepoPath();
  const client = useQueryClient();
  const location = useLocation();
  const nav = useRepoNav();

  if (getRepoPathOrNull() !== repoPath) {
    setRepoPath(repoPath);
  }
  activateRepoCache(client, repoPath);

  useEffect(() => {
    rememberLocation(repoPath, location.pathname + location.search);
  }, [repoPath, location.pathname, location.search]);

  useTheme();
  useWindowTitle(repoPath);
  useRepoEvents(repoPath);
  usePrCheckout();
  useCommentsShortcut();

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
        <RailFrame>
          <Suspense fallback={<AppSplash label={`Opening ${repoName(repoPath)}…`} />}>
            <Outlet />
          </Suspense>
        </RailFrame>
      </RouteErrorBoundary>
      <ClaudeApprovalModal />
      <CommentsPanel />
      <PullRequestsDialog />
      <CheckoutGuardDialog />
    </>
  );
}
