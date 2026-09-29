export function getFileBlocks(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[id^="file-"]'));
}

export function getHunkHeaders(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll('tbody > tr:first-child')
  );
}

export function scrollToElement(el: HTMLElement) {
  el.scrollIntoView({ behavior: 'instant', block: 'start' });
}

function flashThread(element: Element) {
  element.dispatchEvent(new CustomEvent('diffity:focus-thread', { bubbles: false }));
  element.classList.remove('flash-thread');
  void (element as HTMLElement).offsetWidth;
  element.classList.add('flash-thread');
}

/** Scrolls a rendered thread (`data-thread-id`) into view and flashes it, retrying while it mounts. */
export function focusThreadElement(threadId: string, attempts = 12): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const tryFocus = (left: number) => {
    if (disposed) {
      return;
    }
    const element = document.querySelector(`[data-thread-id="${CSS.escape(threadId)}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'instant', block: 'center' });
      flashThread(element);
      return;
    }
    if (left <= 0) {
      return;
    }
    timer = setTimeout(() => tryFocus(left - 1), 100);
  };
  requestAnimationFrame(() => tryFocus(attempts));
  return () => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}
