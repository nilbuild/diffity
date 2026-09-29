import { useLayoutEffect } from 'react';
import { create } from 'zustand';
import { syncWindowBackground } from '../lib/window';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'diffity-theme';

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const value = localStorage.getItem(STORAGE_KEY);
  if (value === 'light' || value === 'dark') {
    return value;
  }
  return null;
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getStoredTheme() ?? systemTheme(),
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEY, theme);
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'light' ? 'dark' : 'light'),
}));

export function useTheme() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);
  const setTheme = useThemeStore((state) => state.setTheme);

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    syncWindowBackground(theme);
  }, [theme]);

  return { theme, toggleTheme, setTheme };
}
