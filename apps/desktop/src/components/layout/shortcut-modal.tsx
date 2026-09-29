import { useEffect, useRef } from 'react';
import { XIcon } from '../icons/x-icon';

interface ShortcutModalProps {
  onClose: () => void;
}

const shortcuts = [
  {
    category: 'Navigation',
    items: [
      { key: 'j', description: 'Next file' },
      { key: 'k', description: 'Previous file' },
      { key: 'n', description: 'Next changed hunk' },
      { key: 'p', description: 'Previous changed hunk' },
    ],
  },
  {
    category: 'View',
    items: [
      { key: 'u', description: 'Unified view' },
      { key: 's', description: 'Split view' },
      { key: 'x', description: 'Collapse/expand file' },
      { key: 'Shift+x', description: 'Collapse/expand all files' },
      { key: 'r', description: 'Toggle file as viewed' },
    ],
  },
  {
    category: 'Other',
    items: [
      { key: '/', description: 'Focus search' },
      { key: '⌘ Enter', description: 'Submit comment' },
      { key: '@claude', description: 'Ask Claude Code in a comment' },
      { key: '⌘O', description: 'Open repository (start screen)' },
      { key: '?', description: 'Show shortcuts' },
      { key: 'Esc', description: 'Close modal / clear' },
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
      className="bg-bg text-text border border-border rounded-xl shadow-md w-[420px] max-w-[90vw] max-h-[80vh] overflow-y-auto backdrop:bg-black/60 backdrop:backdrop-blur-sm p-0 m-auto fixed inset-0 h-fit"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
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
            <h3 className="text-[10px] font-semibold text-text-muted mb-2.5 uppercase tracking-widest">
              {group.category}
            </h3>
            <div className="flex flex-col gap-1.5">
              {group.items.map(item => (
                <div key={item.key} className="flex items-center justify-between py-0.5">
                  <span className="text-xs text-text-secondary">{item.description}</span>
                  <kbd className="inline-flex items-center justify-center min-w-6 h-5 px-1.5 bg-bg-secondary border border-border rounded font-mono text-[11px] text-text-muted shadow-[inset_0_-1px_0_var(--color-border)]">
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
