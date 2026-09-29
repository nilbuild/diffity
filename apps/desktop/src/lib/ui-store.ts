import { create } from 'zustand';

interface UiState {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
  commentsOpen: boolean;
  focusThreadId: string | null;
}

export const useUi = create<UiState>(() => ({
  settingsOpen: false,
  shortcutsOpen: false,
  commentsOpen: false,
  focusThreadId: null,
}));

export function openSettings() {
  useUi.setState({ settingsOpen: true });
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
