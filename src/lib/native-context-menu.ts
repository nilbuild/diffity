/** The webview's own menu (Back, Reload, Inspect Element) is not part of the app. It stays only where it is useful:
 * text fields and selected text (cut, copy, paste). In dev builds ⌥-right-click still opens it for Inspect Element. */
export function blockNativeContextMenu() {
  window.addEventListener('contextmenu', (event) => {
    if (event.defaultPrevented) {
      return;
    }
    if (import.meta.env.DEV && event.altKey) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, [contenteditable=""], [contenteditable="true"]')) {
      return;
    }
    if (window.getSelection()?.toString().trim()) {
      return;
    }
    event.preventDefault();
  });
}
