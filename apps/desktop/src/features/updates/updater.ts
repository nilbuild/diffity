import { create } from 'zustand';
import { toast } from 'sonner';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { isTauri } from '../../lib/platform';
import { errorMessage } from '../../lib/tauri';
import { updatesSupported, worthOffering } from './update-policy';

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; version: string }
  | { kind: 'failed'; message: string };

interface UpdateState {
  status: UpdateStatus;
}

export const useUpdates = create<UpdateState>(() => ({ status: { kind: 'idle' } }));

export const canUpdate = updatesSupported({
  isTauri,
  dev: import.meta.env.DEV,
  tauriDebug: import.meta.env.TAURI_ENV_DEBUG,
});

const TOAST_ID = 'diffity-update';

let pending: Update | null = null;
let declined: string | null = null;
let inFlight: Promise<void> | null = null;

function setStatus(status: UpdateStatus) {
  useUpdates.setState({ status });
}

function offer(update: Update) {
  toast(`Diffity ${update.version} is available`, {
    id: TOAST_ID,
    duration: Infinity,
    action: {
      label: 'Restart to update',
      onClick: (event) => {
        event.preventDefault();
        void installUpdate();
      },
    },
    cancel: { label: 'Later', onClick: () => declineUpdate(update.version) },
    onDismiss: () => declineUpdate(update.version),
  });
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
  if (!update) {
    return;
  }
  setStatus({ kind: 'installing', version: update.version });
  toast.loading(`Updating to Diffity ${update.version}…`, { id: TOAST_ID, duration: Infinity });
  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    setStatus({ kind: 'available', version: update.version });
    toast.error('Could not install the update', { id: TOAST_ID, description: errorMessage(error), duration: 10_000 });
  }
}
