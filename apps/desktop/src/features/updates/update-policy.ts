/** How often a window left open asks again; a check at launch alone could leave it a release behind for weeks. */
export const RECHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** Waits for launch work (repo open, diff load) to settle before the first check. */
export const FIRST_CHECK_DELAY_MS = 5_000;

/** A version the viewer said "Later" to is not raised again until a newer one ships. */
export function worthOffering(declined: string | null, version: string) {
  return declined !== version;
}

/**
 * Only an installed release updates itself. A dev or `--debug` build carries the placeholder version from
 * tauri.conf.json, so it would be offered every release and then fail to swap a bundle it was never installed as.
 */
export function updatesSupported(env: { isTauri: boolean; dev: boolean; tauriDebug: string | undefined }) {
  return env.isTauri && !env.dev && env.tauriDebug !== 'true';
}
