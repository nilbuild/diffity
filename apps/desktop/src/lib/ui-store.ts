import { create } from 'zustand';

const SIDEBAR_KEY = 'diffity-sidebar-collapsed';

export type SettingsSection = 'general' | 'claude' | 'github' | 'editor' | 'shortcuts' | 'about';

interface UiState {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  pullRequestsOpen: boolean;
  shortcutsOpen: boolean;
  commentsOpen: boolean;
  focusThreadId: string | null;
  sidebarCollapsed: boolean;
}

export const useUi = create<UiState>(() => ({
  settingsOpen: false,
  settingsSection: 'general',
  pullRequestsOpen: false,
  shortcutsOpen: false,
  commentsOpen: false,
  focusThreadId: null,
  sidebarCollapsed: readSidebarCollapsed(),
}));

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function toggleSidebar() {
  const next = !useUi.getState().sidebarCollapsed;
  useUi.setState({ sidebarCollapsed: next });
  try {
    localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
  } catch {
    return;
  }
}

export function openSettings() {
  useUi.setState({ settingsOpen: true });
}

export function openSettingsAt(section: SettingsSection) {
  useUi.setState({ settingsOpen: true, settingsSection: section });
}

export function setSettingsSection(section: SettingsSection) {
  useUi.setState({ settingsSection: section });
}

export function openPullRequests() {
  useUi.setState({ pullRequestsOpen: true });
}

export function closePullRequests() {
  useUi.setState({ pullRequestsOpen: false });
}

export function closeSettings() {
  useUi.setState({ settingsOpen: false });
}

export function openShortcuts() {
  useUi.setState({ shortcutsOpen: true });
}

export function closeShortcuts() {
  useUi.setState({ shortcutsOpen: false });
}

export function openComments() {
  useUi.setState({ commentsOpen: true });
}

export function closeComments() {
  useUi.setState({ commentsOpen: false });
}

export function toggleComments() {
  useUi.setState((state) => ({ commentsOpen: !state.commentsOpen }));
}

/** Thread the user just navigated to; collapsed sections that hold it expand. */
export function setFocusThread(threadId: string | null) {
  useUi.setState({ focusThreadId: threadId });
}
