import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface LaunchTarget {
  path: string;
  tab: string | null;
}

function stringify(value: unknown): string {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function forward(level: 'error' | 'warn', args: unknown[]) {
  const message = args.map(stringify).join(' ');
  invoke('log_frontend', { level, message }).catch(() => undefined);
}

/** Dev builds: mirror webview console errors/warnings and uncaught errors into the terminal. */
export function installConsoleForwarding() {
  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    originalError(...args);
    forward('error', args);
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    forward('warn', args);
  };
  window.addEventListener('error', (event) => {
    if (event.message.startsWith('ResizeObserver loop')) {
      return;
    }
    forward('error', [`uncaught: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`, event.error]);
  });
  window.addEventListener('unhandledrejection', (event) => {
    forward('error', ['unhandled rejection:', event.reason]);
  });
}

/** Dev builds: `DIFFITY_OPEN=<path>` (and `DIFFITY_TAB`) opens that repo in the main window on launch. */
export async function applyDevLaunchTarget() {
  if (getCurrentWindow().label !== 'main') {
    return;
  }
  if (window.location.hash && window.location.hash !== '#/') {
    return;
  }
  const target = await invoke<LaunchTarget | null>('dev_launch_target').catch(() => null);
  if (!target) {
    return;
  }
  const page = target.tab === 'files' ? 'tree' : 'diff';
  window.location.hash = `#/r/${encodeURIComponent(target.path)}/${page}`;
}
