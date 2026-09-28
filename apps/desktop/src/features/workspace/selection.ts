import { create } from 'zustand';
import type { ContextChip } from '@/lib/types';

interface SelectionState {
  selection: ContextChip | null;
  setSelection: (chip: ContextChip | null) => void;
  clearSelection: () => void;
}

export const useSelection = create<SelectionState>((set) => ({
  selection: null,
  setSelection: (chip) => set({ selection: chip }),
  clearSelection: () => set({ selection: null }),
}));
