import { create } from 'zustand';

interface FilesState {
  selectedPath: string | null;
  expanded: Set<string>;
  filter: string;
  onlyCommented: boolean;
  select: (path: string | null) => void;
  toggleDir: (path: string) => void;
  expandTo: (path: string) => void;
  setExpanded: (paths: Set<string>) => void;
  setFilter: (filter: string) => void;
  toggleOnlyCommented: () => void;
}

function ancestors(path: string): string[] {
  const parts = path.split('/');
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push(parts.slice(0, i).join('/'));
  }
  return result;
}

export const useFilesStore = create<FilesState>((set) => ({
  selectedPath: null,
  expanded: new Set(),
  filter: '',
  onlyCommented: false,
  select: (selectedPath) => set({ selectedPath }),
  toggleDir: (path) =>
    set((s) => {
      const next = new Set(s.expanded);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expanded: next };
    }),
  expandTo: (path) =>
    set((s) => {
      const next = new Set(s.expanded);
      for (const dir of ancestors(path)) {
        next.add(dir);
      }
      return { expanded: next };
    }),
  setExpanded: (expanded) => set({ expanded }),
  setFilter: (filter) => set({ filter }),
  toggleOnlyCommented: () => set((s) => ({ onlyCommented: !s.onlyCommented })),
}));
