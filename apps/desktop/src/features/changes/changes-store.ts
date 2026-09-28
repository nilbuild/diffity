import { create } from 'zustand';

interface ChangesState {
  collapsed: Map<string, boolean>;
  previews: Set<string>;
  filter: string;
  onlyCommented: boolean;
  currentFile: string | null;
  setCollapsed: (path: string, collapsed: boolean) => void;
  setAllCollapsed: (paths: string[], collapsed: boolean) => void;
  togglePreview: (path: string) => void;
  setFilter: (filter: string) => void;
  toggleOnlyCommented: () => void;
  setCurrentFile: (path: string | null) => void;
  reset: () => void;
}

export const useChangesStore = create<ChangesState>((set) => ({
  collapsed: new Map(),
  previews: new Set(),
  filter: '',
  onlyCommented: false,
  currentFile: null,
  setCollapsed: (path, collapsed) =>
    set((s) => {
      const next = new Map(s.collapsed);
      next.set(path, collapsed);
      return { collapsed: next };
    }),
  setAllCollapsed: (paths, collapsed) => set({ collapsed: new Map(paths.map((p) => [p, collapsed])) }),
  togglePreview: (path) =>
    set((s) => {
      const next = new Set(s.previews);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { previews: next };
    }),
  setFilter: (filter) => set({ filter }),
  toggleOnlyCommented: () => set((s) => ({ onlyCommented: !s.onlyCommented })),
  setCurrentFile: (currentFile) => set({ currentFile }),
  reset: () => set({ collapsed: new Map(), previews: new Set(), currentFile: null }),
}));
