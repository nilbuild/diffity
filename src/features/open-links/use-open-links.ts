import { useEffect, useRef } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { isTauri } from '../../lib/platform';
import { isBareLaunch, launchDecided, resumeLastProject, useLaunch } from '../../lib/launch';
import { NAVIGATE_EVENT } from '../../lib/window';
import * as tauri from '../../lib/tauri';
import type { OpenRequest } from '../../lib/types';
import { openRepoAt } from '../welcome/recent-repos';
import { findLocalClone, parsePrUrl } from '../welcome/open-repo';
import { openQuickOpenWith } from '../palette/quick-open';

/** The repository the link came from when it is the pull request's, else a recent clone, else ⌘O offers to clone it. */
export async function openPullRequest(pr: string, path: string | null, newWindow: boolean, navigate: NavigateFunction) {
  const parsed = parsePrUrl(pr);
  if (!parsed) {
    if (path) {
      await openRepoAt(path, navigate, { newWindow, extra: { pr } });
    }
    return;
  }
  const recent = await tauri.recentRepos().catch(() => []);
  const candidates = [...(path ? [path] : []), ...recent.map((repo) => repo.path)];
  const local = await findLocalClone(candidates, parsed);
  if (!local) {
    openQuickOpenWith(pr);
    return;
  }
  await openRepoAt(local, navigate, { newWindow, extra: { pr } });
}

async function openRequest(request: OpenRequest, navigate: NavigateFunction) {
  const newWindow = request.newWindow;
  if (request.pr) {
    await openPullRequest(request.pr, request.path, newWindow, navigate);
    return;
  }
  if (!request.path) {
    return;
  }
  if (request.view === 'files') {
    const extra: Record<string, string> = request.file ? { path: request.file, type: 'file' } : {};
    await openRepoAt(request.path, navigate, { newWindow, extra, page: 'tree' });
    return;
  }
  const extra: Record<string, string> = {};
  if (request.ref) {
    extra.ref = request.ref;
  }
  if (request.file) {
    extra.file = request.file;
  }
  await openRepoAt(request.path, navigate, { newWindow, extra });
}

/** The launch check runs once per page load (React runs effects twice in development). */
let launchChecked = false;

/**
 * `diffity://open` links (the `diffity` command, agents) queue up in the app until a window takes them. The main
 * window checks on load, for the link that launched the app; after that the app pokes the window it picked.
 */
export function useOpenLinks() {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const current = getCurrentWebviewWindow();
    const drain = async (launching: boolean) => {
      const requests = await tauri.takeOpenRequests().catch(() => []);
      if (launching && requests.length === 0 && useLaunch.getState().deciding && isBareLaunch()) {
        await resumeLastProject(navigateRef.current).catch(() => false);
      }
      for (const request of requests) {
        await openRequest(request, navigateRef.current);
      }
      if (launching) {
        launchDecided();
      }
    };
    // A link that launched the app wins; with none, a fresh launch reopens the last project.
    const fallback = setTimeout(launchDecided, 5000);
    if (current.label === 'main' && !launchChecked) {
      launchChecked = true;
      void drain(true).finally(() => clearTimeout(fallback));
    } else if (current.label === 'main') {
      void drain(false).finally(() => clearTimeout(fallback));
    } else {
      clearTimeout(fallback);
    }
    const unlisten = current.listen('open-requests', () => void drain(false));
    const unlistenNavigate = current.listen<string>(NAVIGATE_EVENT, (event) => {
      if (!event.payload.startsWith('/r/')) {
        return;
      }
      navigateRef.current(event.payload);
    });
    return () => {
      clearTimeout(fallback);
      void unlisten.then((fn) => fn());
      void unlistenNavigate.then((fn) => fn());
    };
  }, []);
}
