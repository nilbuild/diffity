import { useEffect, useRef } from 'react';
import { modKey } from '../../lib/platform';
import { XIcon } from '../ui/icon';

interface ShortcutModalProps {
  onClose: () => void;
}

export const shortcuts = [
  {
    category: 'Changes view',
    items: [
      { key: 'j / k', description: 'Next / previous file' },
      { key: 'n / p', description: 'Next / previous changed hunk' },
      { key: 'u / s', description: 'Unified / split view' },
      { key: 'x', description: 'Collapse or expand file' },
      { key: 'Shift+x', description: 'Collapse or expand all files' },
      { key: 'r', description: 'Mark file as viewed' },
      { key: '/', description: 'Filter files' },
    ],
  },
  {
    category: 'Comments',
    items: [
      { key: 'Click line', description: 'Comment on a line (drag for a range)' },
      { key: `${modKey} Enter`, description: 'Submit comment' },
      { key: 'Esc', description: 'Cancel comment / close dialog' },
      { key: '@claude', description: 'Ask Claude Code in a comment' },
      { key: 'c', description: 'All comments in every view' },
    ],
  },
  {
    category: 'App',
    items: [
      { key: `${modKey}K`, description: 'Command palette: actions, projects, branches, commits, comments' },
      { key: `${modKey}P`, description: `Go to file (this view first, then all files; ${modKey}↵ opens in editor)` },
      { key: `${modKey}⇧P`, description: 'Actions only' },
      { key: `${modKey}O`, description: 'Open a folder' },
      { key: `${modKey}⇧H`, description: 'Home: history and what to review' },
      { key: `${modKey}R`, description: 'Refresh data (keeps your place and unsent comments)' },
      { key: `${modKey}1–9`, description: 'Switch project' },
      { key: `${modKey}⇧[ / ]`, description: 'Previous / next project' },
      { key: `${modKey}\\`, description: 'Show or hide the sidebar' },
      { key: `${modKey},`, description: 'Settings' },
      { key: '?', description: 'Show shortcuts' },
    ],
  },
];

export function ShortcutModal(props: ShortcutModalProps) {
  const { onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="bg-overlay text-text ring-1 ring-overlay-border rounded-xl w-[420px] max-w-[90vw] max-h-[80vh] overflow-y-auto backdrop:bg-black/60 backdrop:backdrop-blur-sm p-0 m-auto fixed inset-0 h-fit"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-overlay-border">
        <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
        <button
          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer"
          onClick={onClose}
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="px-5 py-4">
        {shortcuts.map(group => (
          <div key={group.category} className="mb-5 last:mb-0">
            <h3 className="text-[11px] font-medium text-text-secondary mb-2">
              {group.category}
            </h3>
            <div className="flex flex-col gap-1.5">
              {group.items.map(item => (
                <div key={item.key} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-text-secondary">{item.description}</span>
                  <kbd className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 bg-bg-secondary border border-border rounded font-mono text-[11px] text-text-muted">
                    {item.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </dialog>
  );
}
