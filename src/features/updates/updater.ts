import { createElement } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isDevBuild, isTauri } from '../../lib/platform';
import { errorMessage } from '../../lib/tauri';
import { updatesSupported, worthOffering } from './update-policy';
import { UpdateToast } from './update-toast';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; version: string }
  /** `progress` runs 0–1 while downloading; null until the size is known. */
  | { kind: 'installing'; version: string; progress: number | null }
  | { kind: 'installFailed'; version: string; message: string }
  | { kind: 'failed'; message: string };

interface UpdateState {
  status: UpdateStatus;
}

export const useUpdates = create<UpdateState>(() => ({ status: { kind: 'idle' } }));

export const canUpdate = updatesSupported({
  isTauri,
  dev: import.meta.env.DEV,
  tauriDebug: import.meta.env.TAURI_ENV_DEBUG,
  devBuild: isDevBuild,
});

const TOAST_ID = 'diffity-update';

let pending: Update | null = null;
let declined: string | null = null;
let inFlight: Promise<void> | null = null;

function setStatus(status: UpdateStatus) {
  useUpdates.setState({ status });
}

/** The update prompt; it follows the update's status, so the same toast shows progress and failures. */
function offer(update: Update) {
  toast.custom(
    () =>
      createElement(UpdateToast, {
        onInstall: () => void installUpdate(),
        onLater: () => {
          declineUpdate(update.version);
          toast.dismiss(TOAST_ID);
        },
      }),
    { id: TOAST_ID, duration: Infinity, onDismiss: () => declineUpdate(update.version) },
  );
}

function declineUpdate(version: string) {
  if (useUpdates.getState().status.kind === 'installing') {
    return;
  }
  declined = version;
}

async function run(asked: boolean) {
  setStatus({ kind: 'checking' });
  try {
    const update = await check();
    if (!update) {
      pending = null;
      setStatus({ kind: 'upToDate' });
      return;
    }
    pending = update;
    setStatus({ kind: 'available', version: update.version });
    if (asked || !worthOffering(declined, update.version)) {
      return;
    }
    offer(update);
  } catch (error) {
    console.warn('Could not check for updates', error);
    setStatus({ kind: 'failed', message: errorMessage(error) });
  }
}

/**
 * A check from the app menu or ⌘K: always answers with a toast — the update prompt, "up to date", or the error.
 */
export async function checkForUpdatesAndTell() {
  if (!canUpdate) {
    toast('Updates are only available in the installed app', { id: TOAST_ID });
    return;
  }
  toast.loading('Checking for updates…', { id: TOAST_ID });
  await checkForUpdates({ asked: true });
  const status = useUpdates.getState().status;
  if (status.kind === 'available' && pending) {
    offer(pending);
    return;
  }
  if (status.kind === 'upToDate') {
    toast.success('Diffity is up to date', { id: TOAST_ID, duration: 4000 });
    return;
  }
  if (status.kind === 'failed') {
    toast.error('Could not check for updates', { id: TOAST_ID, description: status.message, duration: 8000 });
    return;
  }
  toast.dismiss(TOAST_ID);
}

/**
 * One check at a time: a second would stack another prompt and could start a second download into the same bundle.
 * A check the viewer asked for (Settings → About) answers there instead of raising the prompt.
 */
export function checkForUpdates(options: { asked: boolean }) {
  if (!canUpdate) {
    return Promise.resolve();
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = run(options.asked).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function installUpdate() {
  const update = pending;
  if (!update || useUpdates.getState().status.kind === 'installing') {
    return;
  }
  const base = { version: update.version };
  setStatus({ kind: 'installing', ...base, progress: null });
  // From Settings the prompt may not be on screen; it carries the progress either way.
  offer(update);
  let total = 0;
  let received = 0;
  try {
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0;
        return;
      }
      if (event.event === 'Progress') {
        received += event.data.chunkLength;
        setStatus({ kind: 'installing', ...base, progress: total > 0 ? Math.min(received / total, 0.99) : null });
        return;
      }
      setStatus({ kind: 'installing', ...base, progress: 1 });
    });
    await relaunch();
  } catch (error) {
    setStatus({ kind: 'installFailed', ...base, message: errorMessage(error) });
  }
}
