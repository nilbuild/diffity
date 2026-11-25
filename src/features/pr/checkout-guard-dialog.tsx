import { useEffect } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import type { GitStatus } from '../../lib/types';
import { dismissGuard, returnLabel, useCheckoutState } from './pr-checkout';
import { buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { AlertCircleIcon } from '../../components/ui/icon';

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function summary(status: GitStatus): string {
  const parts: string[] = [];
  if (status.staged > 0) {
    parts.push(`${plural(status.staged, 'staged file')}`);
  }
  if (status.unstaged > 0) {
    parts.push(`${plural(status.unstaged, 'modified file')}`);
  }
  if (status.untracked > 0) {
    parts.push(`${plural(status.untracked, 'new file')}`);
  }
  return parts.join(', ');
}

export function CheckoutGuardDialog() {
  const guard = useCheckoutState((state) => state.guard);
  const nav = useRepoNav();

  useEffect(() => {
    if (!guard) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismissGuard();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [guard]);

  if (!guard) {
    return null;
  }

  const branch = guard.status.branch ?? 'this commit';
  const target = guard.kind === 'back' ? returnLabel(guard.point) : guard.kind === 'branch' ? guard.branch : `pull request ${guard.label}`;
  const title = `Commit or discard your changes first`;
  const viewChanges = () => {
    dismissGuard();
    nav.toDiff('work');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 font-sans" onMouseDown={dismissGuard}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="mx-4 w-full max-w-[440px] rounded-xl bg-overlay p-5 ring-1 ring-overlay-border"
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-modified/10 text-modified">
            <AlertCircleIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-text-secondary">
              {branch} has {summary(guard.status)} that aren’t committed. Diffity won’t switch to {target} until they’re committed or
              discarded, so nothing gets mixed up or lost.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={dismissGuard} className={buttonOutline}>
            OK
          </button>
          <button onClick={viewChanges} className={buttonPrimary}>
            View changes
          </button>
        </div>
      </div>
    </div>
  );
}
