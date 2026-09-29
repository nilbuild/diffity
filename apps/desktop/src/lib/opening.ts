import { create } from 'zustand';

export interface OpeningTarget {
  path: string;
  name: string;
  step: string;
  startedAt: number;
}

/** The project being opened, from the moment it is picked until its first view has painted. */
export const useOpening = create<{ target: OpeningTarget | null }>(() => ({ target: null }));

function nameOf(path: string) {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export function beginOpening(path: string, step = 'Checking the folder') {
  useOpening.setState({ target: { path, name: nameOf(path), step, startedAt: Date.now() } });
}

export function setOpeningStep(step: string) {
  useOpening.setState((state) => (state.target ? { target: { ...state.target, step } } : state));
}

export function endOpening() {
  if (useOpening.getState().target) {
    useOpening.setState({ target: null });
  }
}
