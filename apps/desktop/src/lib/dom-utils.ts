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
