import { create } from 'zustand';

export type SettingsSection = 'general' | 'claude' | 'github' | 'editor' | 'shortcuts' | 'about';

interface UiState {
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  pullRequestsOpen: boolean;
  shortcutsOpen: boolean;
  commentsOpen: boolean;
  focusThreadId: string | null;
}

export const useUi = create<UiState>(() => ({
  settingsOpen: false,
  settingsSection: 'general',
  pullRequestsOpen: false,
  shortcutsOpen: false,
  commentsOpen: false,
  focusThreadId: null,
}));

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
