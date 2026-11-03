import { create } from 'zustand';
import type { GuideRef } from './guide-refs';

/** The call-stack step that sent the reader to a block, explained under it in the diff. */
export interface GuideFocusStep {
  index: number;
  count: number;
  what?: string;
  why?: string;
}

interface GuideFocusState {
  target: GuideRef | null;
  step: GuideFocusStep | null;
}

/** The block the guide last jumped to; its file keeps that block's rows mounted so the jump can reach it. */
const useGuideFocus = create<GuideFocusState>(() => ({ target: null, step: null }));

/** `side:line` of the guide's focused line when it is in this file, for pinning its slice. */
export function useGuideFocusLine(path: string): string | null {
  return useGuideFocus((state) => (state.target?.path === path && state.target.line ? `${state.target.side}:${state.target.line}` : null));
}

/** The step to show under this line of the diff: the last line of the block the reader stepped onto. */
export function useGuideStepAt(path: string | undefined, side: GuideRef['side'], line: number): GuideFocusStep | null {
  return useGuideFocus((state) => {
    const { target, step } = state;
    if (!step || !target || target.path !== path || target.side !== side || (target.endLine ?? target.line) !== line) {
      return null;
    }
    return step;
  });
}

const FOCUS_CLASS = 'guide-line-focus';
const TOP_CLASS = 'guide-range-top';
const BOTTOM_CLASS = 'guide-range-bottom';
/** On the document while a step is spotlit: the diff outside the step's block fades back. */
const SPOTLIGHT_CLASS = 'guide-spotlight';

/** Ends the spotlight, leaving the block marked: the reader clicked elsewhere or pressed Escape. */
export function endGuideSpotlight(): void {
  document.documentElement.classList.remove(SPOTLIGHT_CLASS);
  document.removeEventListener('pointerdown', onPointerDown, { capture: true });
  document.removeEventListener('keydown', onKeyDown);
}

/** Drops the step card and the spotlight, e.g. when the call stack they came from leaves the screen. */
export function clearGuideStep(): void {
  useGuideFocus.setState({ step: null });
  endGuideSpotlight();
}

function onPointerDown(event: PointerEvent) {
  if ((event.target as Element | null)?.closest?.('[aria-label="Call order"]')) {
    return;
  }
  endGuideSpotlight();
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    endGuideSpotlight();
  }
}

function startSpotlight() {
  document.documentElement.classList.add(SPOTLIGHT_CLASS);
  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  document.addEventListener('keydown', onKeyDown);
}

function lineKeys(side: GuideRef['side'], line: number): string[] {
  return side === 'old' ? [`delete-${line}`] : [`add-${line}`, `context-${line}`, `delete-${line}`];
}

function findLine(scope: Element, side: GuideRef['side'], line: number): Element | null {
  for (const key of lineKeys(side, line)) {
    const element = scope.querySelector(`[data-find-line="${CSS.escape(key)}"]`);
    if (element) {
      return element;
    }
  }
  return null;
}

/** The code rows from the block's first line to its last, in page order; rows in between that hold no code (notes,
 * comments) are left out, and removed lines inside a new-side block are kept so the outline stays one piece. */
function blockRows(ref: GuideRef): HTMLTableRowElement[] {
  const scope = document.querySelector(`[data-find-scope="${CSS.escape(ref.path)}"]`);
  if (!scope || !ref.line) {
    return [];
  }
  const first = findLine(scope, ref.side, ref.line)?.closest('tr');
  if (!first) {
    return [];
  }
  const end = ref.endLine && ref.endLine > ref.line ? ref.endLine : ref.line;
  const last = (end === ref.line ? first : findLine(scope, ref.side, end)?.closest('tr')) ?? first;
  const rows: HTMLTableRowElement[] = [];
  for (let row: Element | null = first; row; row = row.nextElementSibling) {
    if (row instanceof HTMLTableRowElement && row.querySelector('[data-find-line]')) {
      rows.push(row);
    }
    if (row === last) {
      break;
    }
  }
  return rows;
}

/** Marks rows as one outlined block; the Files tab marks a single line with it too. */
export function markBlock(rows: Element[]): void {
  document.querySelectorAll(`.${FOCUS_CLASS}`).forEach((element) => element.classList.remove(FOCUS_CLASS, TOP_CLASS, BOTTOM_CLASS));
  rows.forEach((row, index) => {
    // Re-adding the class restarts the arrival pulse when the same block is stepped onto again.
    void (row as HTMLElement).offsetWidth;
    row.classList.add(FOCUS_CLASS);
    row.classList.toggle(TOP_CLASS, index === 0);
    row.classList.toggle(BOTTOM_CLASS, index === rows.length - 1);
  });
}

let cancelPrevious: (() => void) | null = null;

/**
 * Scrolls a line or block of the diff into the middle of the view and outlines it, waiting (up to ~2s) for its file
 * and rows to mount. Until it shows, the file is brought on screen; a line the diff does not show leaves the file
 * there. With a `step`, the rest of the diff fades back until the reader clicks elsewhere.
 */
export function focusGuideLine(ref: GuideRef, step: GuideFocusStep | null = null): void {
  cancelPrevious?.();
  useGuideFocus.setState({ target: ref, step });
  markBlock([]);
  if (step) {
    startSpotlight();
  } else {
    endGuideSpotlight();
  }
  let disposed = false;
  let frame = 0;
  let fileShown = false;
  const started = performance.now();
  const tick = () => {
    if (disposed) {
      return;
    }
    const rows = blockRows(ref);
    if (rows.length > 0) {
      rows[0].scrollIntoView({ behavior: 'instant', block: rows.length > 6 ? 'start' : 'center' });
      markBlock(rows);
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
