import { create } from 'zustand';

interface UiState {
  settingsOpen: boolean;
  shortcutsOpen: boolean;
}

export const useUi = create<UiState>(() => ({ settingsOpen: false, shortcutsOpen: false }));

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
