/**
 * Glyphs copied from the app's icon set (src/components/ui/icon.tsx) so the site uses the same icons.
 * `soft` glyphs are solid shapes on a 24px grid that shrink optically inside their box, `stroke` glyphs keep the full
 * box, `line` glyphs are the older 20px line set. `body` gets a unique id for knock-out masks.
 */
export type GlyphKind = 'soft' | 'stroke' | 'line' | 'sparkle';

interface Glyph {
  kind: GlyphKind;
  body: (id: string) => string;
}

const GRID: Record<GlyphKind, number> = { soft: 24, stroke: 24, line: 20, sparkle: 256 };

function knockout(id: string, children: string) {
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24"><rect width="24" height="24" fill="#fff" stroke="none"/>${children}</mask>`;
}

function strokePath(d: string, width = 2.5) {
  return `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

const COMMENT_BUBBLE = 'M6.75 3.5h10.5a3.75 3.75 0 0 1 3.75 3.75v7a3.75 3.75 0 0 1-3.75 3.75h-4.6l-4.35 3.1a.9.9 0 0 1-1.42-.73V18h-.13A3.75 3.75 0 0 1 3 14.25v-7A3.75 3.75 0 0 1 6.75 3.5z';

export const GLYPHS = {
  comment: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M7.75 8.75h8.5M7.75 12.5h5" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      `<path mask="url(#${id})" d="${COMMENT_BUBBLE}"/>`,
  },
  send: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M6.5 12h5" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      `<path mask="url(#${id})" d="M4.5 5.5a1 1 0 0 1 1.4-1.1l14.2 6.7a1 1 0 0 1 0 1.8L5.9 19.6a1 1 0 0 1-1.4-1.1L6 12z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  },
  approve: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M8.25 12.25l2.5 2.5 5-5.25" fill="none" stroke="#000" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>') +
      `<path mask="url(#${id})" d="M8.9 4.52Q12 0.6 15.1 4.52Q20.06 3.94 19.48 8.9Q23.4 12 19.48 15.1Q20.06 20.06 15.1 19.48Q12 23.4 8.9 19.48Q3.94 20.06 4.52 15.1Q0.6 12 4.52 8.9Q3.94 3.94 8.9 4.52z" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>`,
  },
  sparkle: {
    kind: 'sparkle',
    body: () =>
      '<path d="M208,144a15.78,15.78,0,0,1-10.42,14.94L146,178l-19,51.62a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88L78,110l19-51.62a15.92,15.92,0,0,1,29.88,0L146,110l51.62,19A15.78,15.78,0,0,1,208,144ZM152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z"/>',
  },
  gitCompare: {
    kind: 'soft',
    body: () =>
      strokePath('M18 15.5v-5A3.5 3.5 0 0 0 14.5 7H11M13 4.25 10.25 7 13 9.75M6 8.5v5A3.5 3.5 0 0 0 9.5 17H13M11 14.25l2.75 2.75L11 19.75') +
      '<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/>',
  },
  gitPullRequest: {
    kind: 'soft',
    body: () =>
      strokePath('M6.5 8v8M17.5 16v-5.5A3.5 3.5 0 0 0 14 7h-3.5M13 4.25 10.25 7 13 9.75') +
      '<circle cx="6.5" cy="5.5" r="3"/><circle cx="6.5" cy="18.5" r="3"/><circle cx="17.5" cy="18.5" r="3"/>',
  },
  fileText: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M8 14.75h8M8 18h5" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      `<path mask="url(#${id})" d="M7.5 2.5h5v5a3.5 3.5 0 0 0 3.5 3.5h4V18a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 18V6a3.5 3.5 0 0 1 3.5-3.5z"/>` +
      '<path d="M14.5 3.2v4.3c0 .83.67 1.5 1.5 1.5h4.3c.45 0 .67-.54.35-.85L15.35 2.85c-.31-.32-.85-.1-.85.35z"/>',
  },
  keyboard: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M6.75 9.25h.01M10.25 9.25h.01M13.75 9.25h.01M17.25 9.25h.01M8 14.5h8" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>') +
      `<rect mask="url(#${id})" x="2" y="4.5" width="20" height="15" rx="3.5"/>`,
  },
  folder: {
    kind: 'soft',
    body: () => '<path d="M2.5 7a3 3 0 0 1 3-3h3.7a2.2 2.2 0 0 1 1.6.7l1.3 1.4a2.2 2.2 0 0 0 1.6.7h4.8a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z"/>',
  },
  terminal: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M7 9.25 9.75 12 7 14.75M12.5 15h4.5" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>') +
      `<rect mask="url(#${id})" x="2.5" y="4" width="19" height="16" rx="4"/>`,
  },
  home: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<rect x="10" y="14" width="4" height="9" rx="2" fill="#000"/>') +
      `<path mask="url(#${id})" d="M3.5 10.4c0-.75.33-1.45.9-1.93l5.9-4.95a2.6 2.6 0 0 1 3.4 0l5.9 4.95c.57.48.9 1.18.9 1.93V18a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z"/>`,
  },
  book: {
    kind: 'soft',
    body: () =>
      '<path d="M2.5 5.6c0-.88.74-1.58 1.62-1.52 2.85.2 5.25.98 7.13 2.3V20.4c-1.9-1.22-4.3-1.92-7.18-2.08A1.6 1.6 0 0 1 2.5 16.73z"/>' +
      '<path d="M21.5 5.6c0-.88-.74-1.58-1.62-1.52-2.85.2-5.25.98-7.13 2.3V20.4c1.9-1.22 4.3-1.92 7.18-2.08a1.6 1.6 0 0 0 1.57-1.6z"/>',
  },
  gitBranch: {
    kind: 'soft',
    body: () => strokePath('M7 8v8M17 8c0 5-10 3-10 8') + '<circle cx="7" cy="5.5" r="3"/><circle cx="7" cy="18.5" r="3"/><circle cx="17" cy="5.5" r="3"/>',
  },
  plus: {
    kind: 'stroke',
    body: () => strokePath('M12 4.5v15M4.5 12h15'),
  },
  externalLink: {
    kind: 'soft',
    body: (id) =>
      knockout(id, '<path d="M20.5 3.5l-8.5 8.5" fill="none" stroke="#000" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><rect x="12" y="0" width="12" height="11.5" rx="3.5" fill="#000"/>') +
      `<rect mask="url(#${id})" x="3" y="5" width="16" height="16" rx="3.75"/>` +
      strokePath('M14 3.5h6.5V10M20.5 3.5 12.5 11.5'),
  },
  gitHub: {
    kind: 'soft',
    body: () =>
      '<g transform="translate(1.5 1.5) scale(.875)"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></g>',
  },
  pull: {
    kind: 'line',
    body: () => strokePath('M10 3.5V12M6 8.5l4 4 4-4M4.5 16.25h11', 2.4),
  },
} satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

let glyphCount = 0;

/** Mask ids must be unique on the page, so every rendered glyph gets its own. */
export function nextGlyphId(name: IconName) {
  glyphCount += 1;
  return `glyph-${name}-${glyphCount}`;
}

/** Same optical sizing as the app: solid glyphs read heavier, so they shrink a little inside their box. */
function softOptical(pixels: number) {
  if (pixels <= 13) {
    return 1;
  }
  if (pixels <= 15) {
    return 0.96;
  }
  if (pixels <= 18) {
    return 0.92;
  }
  return 0.9;
}

export function glyphViewBox(kind: GlyphKind, pixels: number) {
  const grid = GRID[kind];
  const scale = kind === 'soft' ? softOptical(pixels) : 1;
  const pad = (grid * (1 / scale - 1)) / 2;
  const extent = grid + pad * 2;

  return `${-pad} ${-pad} ${extent} ${extent}`;
}
