import { create } from 'zustand';

const EMOJIS_KEY = 'diffity-project-emojis';

function readEmojis(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(EMOJIS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Emojis picked for projects, shown in place of their logo or initials. */
const useProjectEmojis = create<{ byPath: Record<string, string> }>(() => ({ byPath: readEmojis() }));

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== EMOJIS_KEY) {
      return;
    }
    useProjectEmojis.setState({ byPath: readEmojis() });
  });
}

export function useProjectEmoji(path: string | undefined): string | null {
  return useProjectEmojis((state) => (path && typeof state.byPath[path] === 'string' ? state.byPath[path] || null : null));
}

/** Sets the project's emoji; an empty one goes back to its logo or initials. */
export function setProjectEmoji(path: string, emoji: string) {
  const byPath = { ...useProjectEmojis.getState().byPath, [path]: emoji };
  if (!emoji) {
    delete byPath[path];
  }
  useProjectEmojis.setState({ byPath });
  try {
    localStorage.setItem(EMOJIS_KEY, JSON.stringify(byPath));
  } catch {
    return;
  }
}
