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

interface Logo {
  url: string;
  /** A solid square (an app icon, a filled favicon) cropped to its edges, to fill its tile like Slack's workspace icons. */
  fill: boolean;
}

const SAMPLE = 128;
const OPAQUE = 128;

interface Box {
  left: number;
  top: number;
  size: number;
}

/** Where the logo's solid square sits, as fractions of the image, or null when it's a mark on transparency that needs its padded tile. */
function solidBox(image: HTMLImageElement): Box | null {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (width && height && Math.abs(width / height - 1) > 0.05) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return null;
  }
  let data: Uint8ClampedArray;
  try {
    context.drawImage(image, 0, 0, SAMPLE, SAMPLE);
    data = context.getImageData(0, 0, SAMPLE, SAMPLE).data;
  } catch {
    return null;
  }
  const solid = (x: number, y: number) => data[(y * SAMPLE + x) * 4 + 3] >= OPAQUE;

  let left = SAMPLE;
  let top = SAMPLE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < SAMPLE; y++) {
    for (let x = 0; x < SAMPLE; x++) {
      if (solid(x, y)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  const boxWidth = right - left + 1;
  const boxHeight = bottom - top + 1;
  if (right < 0 || boxWidth < SAMPLE / 2 || Math.abs(boxWidth - boxHeight) > 2) {
    return null;
  }

  // A square or rounded square is solid along the middle of every side; a circle or a glyph isn't.
  const from = Math.round(boxWidth * 0.3);
  const to = boxWidth - from;
  let hits = 0;
  let total = 0;
  for (let offset = from; offset < to; offset++) {
    const edges = [solid(left + offset, top + 1), solid(left + offset, bottom - 1), solid(left + 1, top + offset), solid(right - 1, top + offset)];
    hits += edges.filter(Boolean).length;
    total += edges.length;
  }
  if (hits / total < 0.95) {
    return null;
  }
  return { left: left / SAMPLE, top: top / SAMPLE, size: Math.max(boxWidth, boxHeight) / SAMPLE };
}

/** The logo redrawn with its transparent margin cut off, as a blob URL. */
async function crop(image: HTMLImageElement, box: Box): Promise<string | null> {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE;
  canvas.height = SAMPLE;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  const scale = SAMPLE / box.size;
  context.drawImage(image, -box.left * scale, -box.top * scale, scale, scale);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}

async function decode(url: string) {
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** The project's logo as a decoded blob URL, or null when it has none or it doesn't decode. */
async function loadLogo(path: string): Promise<Logo | null> {
  const dataUrl = await tauri.projectIcon(path);
  const match = dataUrl?.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    return null;
  }
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
  const image = await decode(URL.createObjectURL(new Blob([bytes], { type: match[1] })));
  if (!image) {
    return null;
  }

  const box = solidBox(image);
  const trimmed = box && box.size < 0.98 ? await crop(image, box) : null;
  const cropped = trimmed ? await decode(trimmed) : null;
  if (cropped) {
    URL.revokeObjectURL(image.src);
  }
  const final = cropped ?? image;
  decoded.set(path, final);
  return { url: final.src, fill: !!box };
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
  const logo = query.data?.url ?? null;
  return { logo, fill: !!query.data?.fill, shown: !!logo && !hidden };
}
