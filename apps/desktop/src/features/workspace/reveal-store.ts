import { create } from 'zustand';

export interface RevealRequest {
  path: string;
  line: number | null;
  nonce: number;
}

interface RevealState {
  request: RevealRequest | null;
  reveal: (path: string, line: number | null) => void;
  consume: (nonce: number) => void;
}

let nonce = 0;

/** Cross-tab "go to path:line" requests (agent panel file links, thread locations, etc.). */
export const useRevealStore = create<RevealState>((set, get) => ({
  request: null,
  reveal: (path, line) => set({ request: { path, line, nonce: ++nonce } }),
  consume: (value) => {
    if (get().request?.nonce !== value) {
      return;
    }
    set({ request: null });
  },
}));
