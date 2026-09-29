import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyCaps } from '../ui/key-caps';
import { SHORTCUT_SECTIONS, matchShortcuts } from '../../lib/shortcuts';

interface ShortcutsSheetProps {
  onClose: () => void;
}

/**
 * Every key the app answers, under `?`, the palette's "Keyboard shortcuts" row and the ⋯ menu. The same shape as the
 * ⌘K palette: a field with the list under it, rows grouped by section, keys as caps on the right. Rows are text, not
 * buttons; Esc or a click outside closes it (through onCancel / the backdrop click, never the effect cleanup, which
 * StrictMode runs once on mount).
 */
export function ShortcutsSheet(props: ShortcutsSheetProps) {
  const { onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const sections = useMemo(() => matchShortcuts(SHORTCUT_SECTIONS, query), [query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-label="Keyboard shortcuts"
      data-testid="shortcuts-sheet"
      className="fixed top-[18vh] left-1/2 m-0 w-[min(540px,calc(100vw-96px))] max-w-none -translate-x-1/2 overflow-hidden rounded-xl border border-overlay-border bg-overlay p-0 font-sans text-text backdrop:bg-black/25 animate-fade-in"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[min(560px,64vh)] flex-col">
        <div className="flex flex-none items-center border-b border-overlay-border px-4">
          <input
            type="text"
            autoFocus
            className="h-12 min-w-0 flex-1 border-none bg-transparent text-[15px] text-text outline-none placeholder:text-text-muted"
            placeholder="Find a shortcut…"
            aria-label="Find a shortcut"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-0.5 pb-2" data-testid="shortcuts-list">
          {sections.length === 0 && <p className="m-0 px-3 py-4 text-[13px] text-text-muted">Nothing matches.</p>}
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="m-0 px-2.5 pt-3 pb-1 text-[12px] leading-none font-medium text-text-muted">{section.title}</h2>
              {section.shortcuts.map((shortcut) => (
                <div
                  key={`${shortcut.label}-${shortcut.keys.join()}`}
                  className="flex h-9 items-center gap-3 px-2.5 text-[13px] text-text"
                  data-testid="shortcut-row"
                >
                  <span className="min-w-0 flex-1 truncate">{shortcut.label}</span>
                  <KeyCaps keys={shortcut.keys} join={shortcut.join} />
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
