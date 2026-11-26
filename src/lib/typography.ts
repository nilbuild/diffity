import { create } from 'zustand';
import { getSystemFonts } from 'tauri-plugin-system-fonts-api';
import { isTauri } from './platform';

export const CODE_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];
export const TAB_SIZES = [2, 4, 8] as const;

export type TabSize = (typeof TAB_SIZES)[number];

export const DEFAULT_CODE_SIZE = 13;
export const DEFAULT_TAB_SIZE: TabSize = 4;

const UI_FONT_KEY = 'diffity-ui-font';
const CODE_FONT_KEY = 'diffity-code-font';
const CODE_SIZE_KEY = 'diffity-code-size';
const TAB_SIZE_KEY = 'diffity-tab-size';
const NOWRAP_KEY = 'diffity-nowrap';

interface TypographyState {
  /** null keeps the system font. */
  uiFont: string | null;
  /** null keeps the built-in monospace stack. */
  codeFont: string | null;
  codeSize: number;
  tabSize: TabSize;
  wrapLines: boolean;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Still applies for this session.
  }
}

function readNumber(key: string, allowed: readonly number[], fallback: number): number {
  const value = Number(read(key));
  return allowed.includes(value) ? value : fallback;
}

function readState(): TypographyState {
  return {
    uiFont: read(UI_FONT_KEY) || null,
    codeFont: read(CODE_FONT_KEY) || null,
    codeSize: readNumber(CODE_SIZE_KEY, CODE_SIZES, DEFAULT_CODE_SIZE),
    tabSize: readNumber(TAB_SIZE_KEY, TAB_SIZES, DEFAULT_TAB_SIZE) as TabSize,
    wrapLines: read(NOWRAP_KEY) !== '1',
  };
}

/** Line height that keeps the 13px / 22px rhythm of the default code size. */
export function codeLineHeight(size = useTypography.getState().codeSize): number {
  return Math.round(size * (22 / 13));
}

function setFont(variable: string, font: string | null, fallback: string) {
  const root = document.documentElement.style;
  if (font === null) {
    root.removeProperty(variable);
    return;
  }
  root.setProperty(variable, `"${font.replace(/"/g, '')}", ${fallback}`);
}

/** Overrides the `--font-*` and `--code-*` tokens in app.css; a cleared setting falls back to them. */
function apply(state: TypographyState) {
  setFont('--font-sans', state.uiFont, 'system-ui, sans-serif');
  setFont('--font-mono', state.codeFont, 'ui-monospace, Menlo, monospace');
  const root = document.documentElement.style;
  root.setProperty('--code-size', `${state.codeSize}px`);
  root.setProperty('--code-line', `${codeLineHeight(state.codeSize)}px`);
  root.setProperty('--tab-size', String(state.tabSize));
  document.documentElement.toggleAttribute('data-nowrap', !state.wrapLines);
}

export const useTypography = create<TypographyState>(() => readState());

function update(next: Partial<TypographyState>) {
  useTypography.setState(next);
  apply(useTypography.getState());
}

export function setUiFont(uiFont: string | null) {
  write(UI_FONT_KEY, uiFont);
  update({ uiFont });
}

export function setCodeFont(codeFont: string | null) {
  write(CODE_FONT_KEY, codeFont);
  update({ codeFont });
}

export function setCodeSize(codeSize: number) {
  write(CODE_SIZE_KEY, codeSize === DEFAULT_CODE_SIZE ? null : String(codeSize));
  update({ codeSize });
}

/** Always stored, so a later change of the default never moves a width someone picked. */
export function setTabSize(tabSize: TabSize) {
  write(TAB_SIZE_KEY, String(tabSize));
  update({ tabSize });
}

export function setWrapLines(wrapLines: boolean) {
  write(NOWRAP_KEY, wrapLines ? null : '1');
  update({ wrapLines });
}

export interface InstalledFonts {
  all: string[];
  monospaced: string[];
}

/** Installed font families, by name. Empty outside the app. */
export async function installedFonts(): Promise<InstalledFonts> {
  if (!isTauri) {
    return { all: [], monospaced: [] };
  }
  const fonts = await getSystemFonts();
  const names = (list: typeof fonts) => Array.from(new Set(list.map((font) => font.name))).sort((a, b) => a.localeCompare(b));
  return { all: names(fonts), monospaced: names(fonts.filter((font) => font.monospaced)) };
}

const KEYS = [UI_FONT_KEY, CODE_FONT_KEY, CODE_SIZE_KEY, TAB_SIZE_KEY, NOWRAP_KEY];

if (typeof window !== 'undefined') {
  apply(useTypography.getState());
  window.addEventListener('storage', (event) => {
    if (!event.key || !KEYS.includes(event.key)) {
      return;
    }
    const next = readState();
    apply(next);
    useTypography.setState(next);
  });
}
