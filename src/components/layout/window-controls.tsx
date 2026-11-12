import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { cn } from '../../lib/cn';
import { isLinux, isTauri } from '../../lib/platform';

/**
 * Linux windows have no decorations (tauri.linux.conf.json), so the close, minimise and maximise buttons are drawn
 * where macOS puts its traffic lights: the title bars already leave that corner free, so every screen lays out the
 * same on both.
 */
export const drawsWindowControls = isTauri && isLinux;

function useWindowState() {
  const [focused, setFocused] = useState(true);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const current = getCurrentWindow();
    const unlisteners = [
      current.onFocusChanged((event) => setFocused(event.payload)),
      current.onResized(() => {
        current.isMaximized().then(setMaximized).catch(() => undefined);
      }),
    ];
    current.isFocused().then(setFocused).catch(() => undefined);
    current.isMaximized().then(setMaximized).catch(() => undefined);
    return () => {
      for (const unlisten of unlisteners) {
        void unlisten.then((fn) => fn());
      }
    };
  }, []);

  return { focused, maximized };
}

function useQuitShortcut() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.shiftKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'q') {
        return;
      }
      event.preventDefault();
      invoke('quit_app').catch(() => undefined);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function WindowButtons() {
  const { focused, maximized } = useWindowState();
  useQuitShortcut();
  const current = getCurrentWindow();

  return (
    <div className={cn('window-buttons fixed top-0 left-0 z-[200] flex items-center gap-2 h-11 pl-4 pr-1', !focused && 'window-buttons-blurred')}>
      <button type="button" aria-label="Close" className="window-button window-button-close" onClick={() => void current.close()}>
        <svg viewBox="0 0 12 12" aria-hidden>
          <path d="M3.75 3.75l4.5 4.5M8.25 3.75l-4.5 4.5" />
        </svg>
      </button>
      <button type="button" aria-label="Minimise" className="window-button window-button-minimize" onClick={() => void current.minimize()}>
        <svg viewBox="0 0 12 12" aria-hidden>
          <path d="M3.25 6h5.5" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximise'}
        className="window-button window-button-maximize"
        onClick={() => void current.toggleMaximize()}
      >
        <svg viewBox="0 0 12 12" aria-hidden>
          {maximized ? <path className="fill" d="M6.4 2.9v2.7h2.7zM5.6 9.1V6.4H2.9z" /> : <path className="fill" d="M3.4 8.6V4.9l3.7 3.7zM8.6 3.4v3.7L4.9 3.4z" />}
        </svg>
      </button>
    </div>
  );
}

export function WindowControls() {
  if (!drawsWindowControls) {
    return null;
  }
  return <WindowButtons />;
}
