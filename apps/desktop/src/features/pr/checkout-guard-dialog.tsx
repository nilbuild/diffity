import { useEffect, useRef } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import type { GitStatus } from '../../lib/types';
import { checkoutPullRequest, dismissGuard, returnFromPullRequest, returnLabel, switchBranch, useCheckoutState } from './pr-checkout';
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
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!guard) {
      return;
    }
    cancelRef.current?.focus();
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
  const isBack = guard.kind === 'back' || guard.kind === 'branch';
  const title = `Uncommitted changes on ${branch}`;
  const target = guard.kind === 'back' ? returnLabel(guard.point) : guard.kind === 'branch' ? guard.branch : `pull request ${guard.label}`;
  const confirmLabel = guard.kind === 'checkout' ? `Stash and check out ${guard.label}` : `Stash and switch to ${target}`;

  const stashAndContinue = () => {
    if (guard.kind === 'branch') {
      void switchBranch(guard.repoPath, guard.branch, nav.toDiff, { stash: true });
      return;
    }
    if (guard.kind === 'back') {
      void returnFromPullRequest(guard.repoPath, nav.toDiff, { stash: true });
      return;
    }
    void checkoutPullRequest(guard.repoPath, guard.input, nav.toDiff, { stash: true });
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
              You have {summary(guard.status)}. Switching to {target} would mix them with {isBack ? 'that branch' : 'the pull request'}, so
              Diffity won’t switch while they are there.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-text-secondary">
              <li>
                <span className="font-medium text-text">Stash and {isBack ? 'switch' : 'check out'}</span> runs{' '}
                <code className="rounded bg-bg-tertiary px-1 font-mono text-[11px]">git stash push --include-untracked</code>.
                {isBack
                  ? ' The stash keeps these changes safe; get them back later with git stash pop.'
                  : ' When you choose “Back to your branch”, Diffity puts the changes back for you.'}
              </li>
              <li>
                <span className="font-medium text-text">Cancel</span> leaves everything as it is, so you can commit or stash yourself.
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={dismissGuard}
            className={buttonOutline}
          >
            Cancel
          </button>
          <button
            onClick={stashAndContinue}
            className={buttonPrimary}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
