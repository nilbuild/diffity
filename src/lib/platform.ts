export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** The "Diffity Dev" test build (`DIFFITY_CHANNEL=dev`, see src-tauri/tauri.dev.conf.json). */
export const isDevBuild = import.meta.env.DIFFITY_CHANNEL === 'dev';
export const shouldUseMockApi = import.meta.env.VITE_MOCK === '1' || !isTauri;

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const isLinux = !isMac && typeof navigator !== 'undefined' && /Linux/.test(navigator.platform);

/** Prefix for a chord's key: `⌘K` on macOS, `Ctrl+K` elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl+';
/** The key held for a modified click: `⌘-click`, or `Ctrl-click`. */
export const clickModKey = isMac ? '⌘' : 'Ctrl';
/** The file manager's name in "Reveal in …". */
export const fileManagerName = isMac ? 'Finder' : 'File Manager';
/** Where the GitHub token is stored: the macOS keychain, or the Secret Service (GNOME Keyring, KWallet). */
export const keychainName = isMac ? 'macOS keychain' : 'system keyring';
