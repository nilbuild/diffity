import { useEffect, useRef, type RefObject } from 'react';

/** Room kept between a revealed find match and the edge of its cell. */
const REVEAL_MARGIN = 48;

/** How far the widest mounted line runs past its cell, i.e. how far the code can scroll sideways. */
function overflowOf(table: HTMLElement): number {
  let widest = 0;
  for (const line of table.querySelectorAll<HTMLElement>('[data-code-cell] > [data-find-line]')) {
    const cell = line.parentElement;
    if (!cell) {
      continue;
    }
    const style = getComputedStyle(cell);
    const room = cell.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    widest = Math.max(widest, line.offsetWidth - room);
  }
  return Math.max(0, Math.ceil(widest));
}

/**
 * Sideways scrolling for a file's code when lines don't wrap. The table keeps its layout (so comments and gutters
 * stay put) and every code cell shifts its text by `--code-x`, driven by one scrollbar under the file. Horizontal
 * wheel and trackpad gestures over the file move that scrollbar.
 */
export function CodeScrollbar(props: { tableRef: RefObject<HTMLTableElement | null>; enabled: boolean }) {
  const { tableRef, enabled } = props;
  const barRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const table = tableRef.current;
    const bar = barRef.current;
    const spacer = spacerRef.current;
    if (!enabled || !table || !bar || !spacer) {
      table?.style.removeProperty('--code-x');
      return;
    }

    const onScroll = () => {
      table.style.setProperty('--code-x', `${bar.hidden ? 0 : bar.scrollLeft}px`);
    };
    // The widest line can unmount (lazy rows) and shrink the overflow; the bar clamps or hides without a scroll
    // event, so sync the shift here or the text stays pushed left with nothing to scroll back.
    const measure = () => {
      const overflow = overflowOf(table);
      spacer.style.width = `calc(100% + ${overflow}px)`;
      bar.hidden = overflow === 0;
      if (bar.hidden) {
        bar.scrollLeft = 0;
      }
      onScroll();
    };
    let pending = 0;
    const measureSoon = () => {
      clearTimeout(pending);
      pending = window.setTimeout(measure, 50);
    };
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY) || bar.hidden) {
        return;
      }
      event.preventDefault();
      bar.scrollLeft += event.deltaX;
    };
    const onReveal = (event: Event) => {
      const { left, right } = (event as CustomEvent<{ left: number; right: number }>).detail;
      const cell = (event.target as HTMLElement).closest<HTMLElement>('[data-code-cell]');
      if (!cell || bar.hidden) {
        return;
      }
      const box = cell.getBoundingClientRect();
      if (right > box.right - REVEAL_MARGIN) {
        bar.scrollLeft += right - box.right + REVEAL_MARGIN;
      } else if (left < box.left + REVEAL_MARGIN) {
        bar.scrollLeft -= box.left + REVEAL_MARGIN - left;
      }
    };

    // Rows mount lazily without changing the table's size, so watch for them as well as for resizes.
    const resizes = new ResizeObserver(measureSoon);
    resizes.observe(table);
    const mutations = new MutationObserver(measureSoon);
    mutations.observe(table, { childList: true, subtree: true });
    measure();
    onScroll();
    bar.addEventListener('scroll', onScroll);
    table.addEventListener('wheel', onWheel, { passive: false });
    table.addEventListener('diffity:reveal-range', onReveal);
    return () => {
      clearTimeout(pending);
      resizes.disconnect();
      mutations.disconnect();
      bar.removeEventListener('scroll', onScroll);
      table.removeEventListener('wheel', onWheel);
      table.removeEventListener('diffity:reveal-range', onReveal);
      table.style.removeProperty('--code-x');
    };
  }, [tableRef, enabled]);

  if (!enabled) {
    return null;
  }
  return (
    <div ref={barRef} hidden className="sticky bottom-0 z-[1] overflow-x-auto overflow-y-hidden bg-bg">
      <div ref={spacerRef} className="h-px" />
    </div>
  );
}
