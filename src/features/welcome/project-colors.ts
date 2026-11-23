import type { CSSProperties } from 'react';
import { create } from 'zustand';

export interface ProjectColor {
  id: string;
  label: string;
  value: string;
  /** Text on a tile filled with this colour. */
  ink: string;
}

export const PROJECT_COLORS: ProjectColor[] = [
  { id: 'blue', label: 'Blue', value: '#3b82f6', ink: '#ffffff' },
  { id: 'violet', label: 'Violet', value: '#8b5cf6', ink: '#ffffff' },
  { id: 'pink', label: 'Pink', value: '#ec4899', ink: '#ffffff' },
  { id: 'red', label: 'Red', value: '#ef4444', ink: '#ffffff' },
  { id: 'orange', label: 'Orange', value: '#f97316', ink: '#ffffff' },
  { id: 'yellow', label: 'Yellow', value: '#eab308', ink: '#1c1917' },
  { id: 'green', label: 'Green', value: '#22c55e', ink: '#052e16' },
  { id: 'teal', label: 'Teal', value: '#14b8a6', ink: '#ffffff' },
  { id: 'gray', label: 'Gray', value: '#71717a', ink: '#ffffff' },
];

const AUTO = PROJECT_COLORS.filter((color) => color.id !== 'gray');
const COLORS_KEY = 'diffity-project-colors';

function readColors(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(COLORS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export const useProjectColors = create<{ byPath: Record<string, string> }>(() => ({ byPath: readColors() }));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== COLORS_KEY) {
      return;
    }
    useProjectColors.setState({ byPath: readColors() });
  });
}

function save(byPath: Record<string, string>) {
  useProjectColors.setState({ byPath });
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(byPath));
  } catch {
    return;
  }
}

function hash(text: string): number {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}

function byId(id: string | undefined): ProjectColor | null {
  return PROJECT_COLORS.find((color) => color.id === id) ?? null;
}

export function projectColor(path: string, byPath: Record<string, string> = useProjectColors.getState().byPath): ProjectColor {
  return byId(byPath[path]) ?? AUTO[hash(path) % AUTO.length];
}

export function useProjectColor(path: string): ProjectColor {
  return useProjectColors((state) => projectColor(path, state.byPath));
}

export function setProjectColor(path: string, id: string) {
  save({ ...useProjectColors.getState().byPath, [path]: id });
}

/** Gives each project without a colour the one fewest of `paths` have, so projects next to each other rarely match. */
export function pickColors(paths: string[], byPath: Record<string, string>): Record<string, string> {
  const next = { ...byPath };
  for (const path of paths) {
    if (byId(next[path])) {
      continue;
    }
    const used = new Map(AUTO.map((color) => [color.id, 0]));
    for (const other of paths) {
      const id = next[other];
      if (used.has(id)) {
        used.set(id, (used.get(id) ?? 0) + 1);
      }
    }
    const fewest = Math.min(...used.values());
    const start = hash(path) % AUTO.length;
    const choice = [...AUTO.slice(start), ...AUTO.slice(0, start)].find((color) => used.get(color.id) === fewest) ?? AUTO[start];
    next[path] = choice.id;
  }
  return next;
}

export function assignColors(paths: string[]) {
  const byPath = useProjectColors.getState().byPath;
  const next = pickColors(paths, byPath);
  if (paths.every((path) => next[path] === byPath[path])) {
    return;
  }
  save(next);
}

export function colorStyle(color: ProjectColor): CSSProperties {
  return { '--project': color.value, '--project-ink': color.ink } as CSSProperties;
}
