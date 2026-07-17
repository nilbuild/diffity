import { useState, useEffect, useLayoutEffect, useCallback } from 'react';

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

function getStoredColorblind(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = localStorage.getItem('diffity-colorblind');
  return stored === null ? null : stored === 'true';
}

// Colorblind mode is an orthogonal axis to light/dark — it swaps the diff
// palette to a colorblind-safe blue/orange scheme via the `data-colorblind`
// attribute (see styles/app.css).
export function useColorblind(initialColorblind?: boolean | null) {
  const [colorblind, setColorblind] = useState<boolean>(
    () => getStoredColorblind() ?? initialColorblind ?? false
  );

  useLayoutEffect(() => {
    if (colorblind) {
      document.documentElement.setAttribute('data-colorblind', 'true');
    } else {
      document.documentElement.removeAttribute('data-colorblind');
    }
  }, [colorblind]);

  const toggleColorblind = useCallback(() => {
    setColorblind(prev => {
      const next = !prev;
      localStorage.setItem('diffity-colorblind', String(next));
      return next;
    });
  }, []);

  return { colorblind, toggleColorblind };
}
