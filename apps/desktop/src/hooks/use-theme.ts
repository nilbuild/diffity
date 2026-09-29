import { useEffect, useLayoutEffect } from 'react';
import { create } from 'zustand';
import { syncWindowBackground } from '../lib/window';

type Theme = 'light' | 'dark';
export type ThemePreference = 'system' | Theme;

const STORAGE_KEY = 'diffity-theme';

function getStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === 'light' || value === 'dark') {
    return value;
  }
  return 'system';
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(preference: ThemePreference): Theme {
  return preference === 'system' ? systemTheme() : preference;
}

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

interface ThemeState {
  preference: ThemePreference;
  theme: Theme;
  setPreference: (preference: ThemePreference) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  syncSystem: () => void;
}

const initialPreference = getStoredPreference();

export const useThemeStore = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  theme: resolve(initialPreference),
  setPreference: (preference) => {
    if (preference === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
    set({ preference, theme: resolve(preference) });
  },
  setTheme: (theme) => get().setPreference(theme),
  toggleTheme: () => get().setPreference(get().theme === 'light' ? 'dark' : 'light'),
  syncSystem: () => {
    if (get().preference !== 'system') {
      return;
    }
    set({ theme: systemTheme() });
  },
}));

export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const preference = useThemeStore((state) => state.preference);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setPreference = useThemeStore((state) => state.setPreference);
  const syncSystem = useThemeStore((state) => state.syncSystem);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    syncWindowBackground(theme);
  }, [theme]);

  useEffect(() => {
    if (preference !== 'system' || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', syncSystem);
    return () => query.removeEventListener('change', syncSystem);
  }, [preference, syncSystem]);

  return { theme, preference, toggleTheme, setTheme, setPreference };
}
