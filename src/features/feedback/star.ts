/** How many times the app has been opened, counted once per launch of the main window. */
export const LAUNCHES_KEY = 'diffity-launches';
/** Set once the star prompt has been shown, so it never comes back. */
export const STAR_PROMPT_KEY = 'diffity-star-prompt';
/** The launch the prompt waits for. */
export const STAR_PROMPT_LAUNCH = 3;

export function shouldShowStarPrompt(launches: number, shown: boolean): boolean {
  return !shown && launches >= STAR_PROMPT_LAUNCH;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable; the prompt then simply never shows.
  }
}

export function launchCount(): number {
  const value = Number(read(LAUNCHES_KEY));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function countLaunch() {
  write(LAUNCHES_KEY, String(launchCount() + 1));
}

export function starPromptShown(): boolean {
  return read(STAR_PROMPT_KEY) !== null;
}

export function markStarPromptShown() {
  write(STAR_PROMPT_KEY, new Date().toISOString());
}
