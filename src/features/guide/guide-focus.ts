import { create } from 'zustand';
import type { GuideRef } from './guide-refs';

interface GuideFocusState {
  target: GuideRef | null;
}

/** The line the guide last jumped to; its file keeps that line's rows mounted so the jump can reach it. */
const useGuideFocus = create<GuideFocusState>(() => ({ target: null }));

/** `side:line` of the guide's focused line when it is in this file, for pinning its slice. */
export function useGuideFocusLine(path: string): string | null {
  return useGuideFocus((state) => (state.target?.path === path && state.target.line ? `${state.target.side}:${state.target.line}` : null));
}

const FOCUS_CLASS = 'guide-line-focus';

function lineKeys(ref: GuideRef): string[] {
  return ref.side === 'old' ? [`delete-${ref.line}`] : [`add-${ref.line}`, `context-${ref.line}`, `delete-${ref.line}`];
}

function findLine(ref: GuideRef): Element | null {
  const scope = document.querySelector(`[data-find-scope="${CSS.escape(ref.path)}"]`);
  if (!scope) {
    return null;
  }
  for (const key of lineKeys(ref)) {
    const element = scope.querySelector(`[data-find-line="${CSS.escape(key)}"]`);
    if (element) {
      return element;
    }
  }
  return null;
}

let cancelPrevious: (() => void) | null = null;

/**
 * Scrolls a line of the diff to the middle of the view and marks it, waiting (up to ~2s) for its file and rows to
 * mount. Until the line shows, the file is brought on screen; a line the diff does not show leaves the file there.
 */
export function focusGuideLine(ref: GuideRef): void {
  cancelPrevious?.();
  useGuideFocus.setState({ target: ref });
  document.querySelectorAll(`.${FOCUS_CLASS}`).forEach((element) => element.classList.remove(FOCUS_CLASS));
  let disposed = false;
  let frame = 0;
  let fileShown = false;
  const started = performance.now();
  const tick = () => {
    if (disposed) {
      return;
    }
    const line = findLine(ref);
    if (line) {
      line.scrollIntoView({ behavior: 'instant', block: 'center' });
      line.closest('tr')?.classList.add(FOCUS_CLASS);
      return;
    }
    if (!fileShown) {
      const file = document.getElementById(`file-${encodeURIComponent(ref.path)}`);
      if (file) {
        file.scrollIntoView({ behavior: 'instant', block: 'start' });
        fileShown = true;
      }
    }
    if (performance.now() - started < 2000) {
      frame = requestAnimationFrame(tick);
    }
  };
  frame = requestAnimationFrame(tick);
  cancelPrevious = () => {
    disposed = true;
    cancelAnimationFrame(frame);
  };
}
