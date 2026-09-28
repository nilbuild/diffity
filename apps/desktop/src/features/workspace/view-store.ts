import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WorkspaceTab = 'changes' | 'files' | 'pr';
export type DiffStyle = 'split' | 'unified';

interface ViewState {
  tab: WorkspaceTab;
  diffStyle: DiffStyle;
  hideWhitespace: boolean;
  wordDiff: boolean;
  wrapLines: boolean;
  sidebarWidth: number;
  agentPanelWidth: number;
  shortcutsOpen: boolean;
  setTab: (tab: WorkspaceTab) => void;
  setDiffStyle: (style: DiffStyle) => void;
  toggleWhitespace: () => void;
  toggleWordDiff: () => void;
  toggleWrap: () => void;
  setSidebarWidth: (width: number) => void;
  setAgentPanelWidth: (width: number) => void;
  setShortcutsOpen: (open: boolean) => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      tab: 'changes',
      diffStyle: 'split',
      hideWhitespace: false,
      wordDiff: true,
      wrapLines: false,
      sidebarWidth: 280,
      agentPanelWidth: 400,
      shortcutsOpen: false,
      setTab: (tab) => set({ tab }),
      setDiffStyle: (diffStyle) => set({ diffStyle }),
      toggleWhitespace: () => set((s) => ({ hideWhitespace: !s.hideWhitespace })),
      toggleWordDiff: () => set((s) => ({ wordDiff: !s.wordDiff })),
      toggleWrap: () => set((s) => ({ wrapLines: !s.wrapLines })),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      setAgentPanelWidth: (agentPanelWidth) => set({ agentPanelWidth }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
    }),
    {
      name: 'diffity-view',
      partialize: (s) => ({
        diffStyle: s.diffStyle,
        hideWhitespace: s.hideWhitespace,
        wordDiff: s.wordDiff,
        wrapLines: s.wrapLines,
        sidebarWidth: s.sidebarWidth,
        agentPanelWidth: s.agentPanelWidth,
      }),
    },
  ),
);
