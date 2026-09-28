import { useEffect } from 'react';
import { create } from 'zustand';
import * as api from './api';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference !== 'system') {
    return preference;
  }
  return media?.matches ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>(() => ({
  preference: 'system',
  resolved: resolve('system'),
}));

function apply(preference: ThemePreference) {
  const resolved = resolve(preference);
  document.documentElement.dataset.theme = resolved;
  useThemeStore.setState({ preference, resolved });
}

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Applies a theme preference immediately and persists it via the `theme` setting. */
export async function setThemePreference(preference: ThemePreference) {
  apply(preference);
  await api.setSetting('theme', preference);
}

export function useResolvedTheme(): ResolvedTheme {
  return useThemeStore((s) => s.resolved);
}

export function useThemeBootstrap() {
  useEffect(() => {
    apply(useThemeStore.getState().preference);
    api
      .getSetting('theme')
      .then((value) => {
        if (isPreference(value)) {
          apply(value);
        }
      })
      .catch(() => undefined);

    const onChange = () => {
      const { preference } = useThemeStore.getState();
      if (preference !== 'system') {
        return;
      }
      apply('system');
    };
    media?.addEventListener('change', onChange);
    return () => media?.removeEventListener('change', onChange);
  }, []);
}
