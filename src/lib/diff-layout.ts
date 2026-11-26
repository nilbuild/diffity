import { create } from 'zustand';
import type { ViewMode } from './diff-utils';

const DIFF_KEY = 'diffity-view-mode';
const GUIDE_KEY = 'diffity-guide-view-mode';

interface DiffLayoutState {
  /** How diffs open; Settings and the Unified | Split toggle both change it, and open diffs follow at once. */
  diff: ViewMode;
  /** The guide sits beside a story column, so it keeps its own choice, unified by default. */
  guide: ViewMode;
}

function read(key: string, fallback: ViewMode): ViewMode {
  try {
    const value = localStorage.getItem(key);
    return value === 'unified' || value === 'split' ? value : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: ViewMode) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Still applies for this session.
  }
}

export const useDiffLayout = create<DiffLayoutState>(() => ({ diff: read(DIFF_KEY, 'split'), guide: read(GUIDE_KEY, 'unified') }));

export function setDiffViewMode(mode: ViewMode) {
  write(DIFF_KEY, mode);
  useDiffLayout.setState({ diff: mode });
}

export function setGuideViewMode(mode: ViewMode) {
  write(GUIDE_KEY, mode);
  useDiffLayout.setState({ guide: mode });
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== DIFF_KEY && event.key !== GUIDE_KEY) {
      return;
    }
    useDiffLayout.setState({ diff: read(DIFF_KEY, 'split'), guide: read(GUIDE_KEY, 'unified') });
  });
}
