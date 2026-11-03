import { cn } from '../../lib/cn';
import { useUpdates } from './updater';

const link = 'shrink-0 cursor-pointer text-xs font-medium hover:underline underline-offset-2 focus-visible:underline outline-none';

/**
 * The update prompt, inside the app's toast frame: a title, then the details on the left and the actions as links on
 * the right, kept well apart so nothing reads as one run of text.
 */
export function UpdateToast(props: { onInstall: () => void; onLater: () => void }) {
  const { onInstall, onLater } = props;
  const status = useUpdates((state) => state.status);

  if (status.kind !== 'available' && status.kind !== 'installing' && status.kind !== 'installFailed') {
    return null;
  }
  const percent = status.kind === 'installing' && status.progress !== null ? Math.round(status.progress * 100) : null;

  return (
    <div className="flex w-[330px] max-w-full flex-col gap-1 py-0.5 font-sans text-[13px] text-text" role="status" aria-live="polite">
      {status.kind === 'installing' ? (
        <>
          <div className="flex items-baseline justify-between gap-6">
            <span className="font-medium">Updating to {status.version}</span>
            <span className="text-xs text-text-secondary tabular-nums">{percent === 100 ? 'Installing…' : percent === null ? '' : `${percent}%`}</span>
          </div>
          <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-fill">
            <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${percent ?? 4}%` }} />
          </div>
        </>
      ) : (
        <>
          <span className="font-medium">{status.kind === 'installFailed' ? 'Update failed' : 'Update ready'}</span>
          <div className="flex items-baseline gap-6">
            <span className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={status.kind === 'installFailed' ? status.message : undefined}>
              {status.kind === 'installFailed' ? status.message : `Diffity ${status.version}`}
            </span>
            <div className="flex shrink-0 items-baseline gap-4">
              <button type="button" onClick={onLater} className={cn(link, 'text-text-secondary hover:text-text')}>
                Dismiss
              </button>
              <button type="button" onClick={onInstall} className={cn(link, 'text-accent')}>
                {status.kind === 'installFailed' ? 'Try again' : 'Restart to install'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
