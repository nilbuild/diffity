import { create } from 'zustand';
import type { NavigateFunction } from 'react-router';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import * as tauri from './tauri';
import { isTauri } from './platform';
import { beginOpening, endOpening } from './opening';
import { lastProjectLocation } from './repo-locations';
import { isShownProject } from '../features/welcome/recent-repos';

/** The main window opened on the welcome route with nothing asked of it: a fresh launch, not a link or a new window. */
export function isBareLaunch(): boolean {
  if (!isTauri || getCurrentWebviewWindow().label !== 'main') {
    return false;
  }
  return ['', '#', '#/'].includes(window.location.hash);
}

/** True while a fresh launch decides where to open, so the welcome screen doesn't flash before the last project. */
export const useLaunch = create<{ deciding: boolean }>(() => ({ deciding: isBareLaunch() }));

export function launchDecided() {
  useLaunch.setState({ deciding: false });
}

/**
 * Reopens the project and view shown last, unless it was removed from the rail or is gone. Returns whether it did.
 */
export async function resumeLastProject(navigate: NavigateFunction): Promise<boolean> {
  const last = lastProjectLocation();
  if (!last || !(await isShownProject(last.repoPath))) {
    return false;
  }
  const info = await tauri.openRepo(last.repoPath).catch(() => null);
  if (!info?.isGit) {
    return false;
  }
  beginOpening(last.repoPath, 'Opening');
  try {
    navigate(last.location, { replace: true });
  } catch {
    endOpening();
    return false;
  }
  return true;
}
