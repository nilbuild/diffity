export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const shouldUseMockApi = import.meta.env.VITE_MOCK === '1' || !isTauri;

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const modKey = isMac ? '⌘' : 'Ctrl';
