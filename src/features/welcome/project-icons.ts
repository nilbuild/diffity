import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import * as tauri from '../../lib/tauri';

const HIDDEN_KEY = 'diffity-project-logos-hidden';

function readHidden(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Projects whose logo the user turned off, shown with initials instead. */
const useHiddenLogos = create<{ paths: string[] }>(() => ({ paths: readHidden() }));

export function setLogoShown(path: string, shown: boolean) {
  const rest = useHiddenLogos.getState().paths.filter((item) => item !== path);
  const paths = shown ? rest : [...rest, path];
  useHiddenLogos.setState({ paths });
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(paths));
  } catch {
    return;
  }
}

/** Decoded logos, kept so every new <img> of one paints in its first frame instead of blinking while it decodes. */
const decoded = new Map<string, HTMLImageElement>();

/** The project's logo as a decoded blob URL, or null when it has none or it doesn't decode. */
async function loadLogo(path: string): Promise<string | null> {
  const dataUrl = await tauri.projectIcon(path);
  const match = dataUrl?.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    return null;
  }
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: match[1] }));
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
  decoded.set(path, image);
  return url;
}

/** The logo the project ships, and whether to show it in place of its initials. */
export function useProjectLogo(path: string | undefined) {
  const hidden = useHiddenLogos((state) => !!path && state.paths.includes(path));
  const query = useQuery({
    queryKey: ['project-logo', path],
    queryFn: () => loadLogo(path ?? ''),
    enabled: !!path,
    staleTime: Infinity,
  });
  const logo = query.data ?? null;
  return { logo, shown: !!logo && !hidden };
}
