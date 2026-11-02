import { buttonOutline, buttonPrimary } from './button-styles';
import { cn } from '../../lib/cn';
import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  /** `danger` (default) for a destructive confirm, `primary` for a plain next step. */
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, message, confirmLabel = 'Undo', tone = 'danger', onConfirm, onCancel } = props;
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (tone === 'primary' ? confirmRef : cancelRef).current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onCancel, tone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onCancel}>
      <div
        className="bg-overlay ring-1 ring-overlay-border rounded-xl p-5 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold text-text mb-1">{title}</h3>
        <p className="text-[13px] text-text-secondary mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            className={buttonOutline}
          >
            Cancel
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={tone === 'primary' ? buttonPrimary : cn(buttonOutline, 'text-deleted border-deleted/35 hover:bg-deleted/8')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
