import { useState, useLayoutEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('diffity-theme') as Theme | null;
}

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function useTheme(initialTheme?: Theme | null) {
  const [theme, setTheme] = useState<Theme>(
    () => getStoredTheme() || initialTheme || 'light'
  );

  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('diffity-theme', next);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
