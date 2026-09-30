import { useId, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<IconSize, number> = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 };

export interface GlyphProps {
  className?: string;
  size?: IconSize | number;
  style?: CSSProperties;
  title?: string;
  'aria-hidden'?: boolean;
}

function resolveSize(size: IconSize | number | undefined, fallback: number) {
  if (size === undefined) {
    return fallback;
  }
  if (typeof size === 'number') {
    return size;
  }
  return SIZES[size];
}

interface GlyphSpec {
  grid: number;
  defaultSize: number;
  optical?: (pixels: number) => number;
}

function makeGlyph(render: (id: string) => ReactNode, spec: GlyphSpec) {
  function Glyph(props: GlyphProps) {
    const { className, size, style, title } = props;
    const pixels = resolveSize(size, spec.defaultSize);
    const id = useId();
    const scale = spec.optical ? spec.optical(pixels) : 1;
    const pad = (spec.grid * (1 / scale - 1)) / 2;
    const extent = spec.grid + pad * 2;

    return (
      <svg
        viewBox={`${-pad} ${-pad} ${extent} ${extent}`}
        width={pixels}
        height={pixels}
        fill="currentColor"
        aria-hidden={title ? undefined : true}
        className={cn('shrink-0', className)}
        style={style}
      >
        {title ? <title>{title}</title> : null}
        {render(id)}
      </svg>
    );
  }
  return Glyph;
}

/**
 * Soft set: filled shapes with knocked-out details and 2.5px round strokes on a 24px grid.
 * Solid shapes read heavier than line icons at text sizes, so from 14px up they shrink slightly inside their box (96% at 14px, 92% at 16–18px, 90% above).
 * Stroke-only glyphs (arrows, chevrons, check) keep the full box so their strokes do not thin out.
 */
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

function softGlyph(render: (id: string) => ReactNode, defaultSize = 16) {
  return makeGlyph(render, { grid: 24, defaultSize, optical: softOptical });
}

function softStroke(render: (id: string) => ReactNode, defaultSize = 16) {
  return makeGlyph(render, { grid: 24, defaultSize });
}

function Knockout(props: { id: string; children: ReactNode }) {
  const { id, children } = props;

  return (
    <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
      <rect width="24" height="24" fill="#fff" stroke="none" />
      {children}
    </mask>
  );
}

/**
 * The older line glyphs kept by choice: a 20px grid with 2.4px round-capped strokes.
 */
function lineGlyph(d: string, defaultSize = 16) {
  return makeGlyph(() => <path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" d={d} />, { grid: 20, defaultSize });
}

export const PushIcon = lineGlyph('M10 16.5V8M6 11.5l4-4 4 4M4.5 3.75h11', 14);
export const PullIcon = lineGlyph('M10 3.5V12M6 8.5l4 4 4-4M4.5 16.25h11', 14);
export const CodeIcon = lineGlyph('M7 5.5 3 10l4 4.5M13 5.5l4 4.5-4 4.5');
export const CollapseAllIcon = lineGlyph('M6 3.5l4 4 4-4M6 16.5l4-4 4 4');
export const ExpandAllIcon = lineGlyph('M6 7.5l4-4 4 4M6 12.5l4 4 4-4');
export const ChevronUpDownIcon = lineGlyph('M6.5 7.5 10 4 13.5 7.5M6.5 12.5 10 16l3.5-3.5', 14);

export const ListIcon = makeGlyph(() => (
  <>
    <circle cx="4.5" cy="5.5" r="1.6" />
    <circle cx="4.5" cy="10" r="1.6" />
    <circle cx="4.5" cy="14.5" r="1.6" />
    <path fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" d="M8.5 5.5h7.5M8.5 10h7.5M8.5 14.5h7.5" />
  </>
), { grid: 20, defaultSize: 16 });

export const SparkleIcon = makeGlyph(() => (
  <path d="M208,144a15.78,15.78,0,0,1-10.42,14.94L146,178l-19,51.62a15.92,15.92,0,0,1-29.88,0L78,178l-51.62-19a15.92,15.92,0,0,1,0-29.88L78,110l19-51.62a15.92,15.92,0,0,1,29.88,0L146,110l51.62,19A15.78,15.78,0,0,1,208,144ZM152,48h16V64a8,8,0,0,0,16,0V48h16a8,8,0,0,0,0-16H184V16a8,8,0,0,0-16,0V32H152a8,8,0,0,0,0,16Zm88,32h-8V72a8,8,0,0,0-16,0v8h-8a8,8,0,0,0,0,16h8v8a8,8,0,0,0,16,0V96h8a8,8,0,0,0,0-16Z" />
), { grid: 256, defaultSize: 16 });

export const HomeIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <rect x="10" y="14" width="4" height="9" rx="2" fill="#000" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M3.5 10.4c0-.75.33-1.45.9-1.93l5.9-4.95a2.6 2.6 0 0 1 3.4 0l5.9 4.95c.57.48.9 1.18.9 1.93V18a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3z" />
  </>
));

export const ChangesIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M12 6.5v6.5M8.75 9.75h6.5M8.75 16.5h6.5" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="4" y="2.5" width="16" height="19" rx="4" />
  </>
));

export const FilesIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-a`}>
      <rect x="2" y="5" width="16" height="18" rx="4.5" fill="#000" />
    </Knockout>
    <rect mask={`url(#${id}-a)`} x="7.5" y="2.5" width="13" height="15.5" rx="3.5" />
    <Knockout id={`${id}-b`}>
      <path d="M7.5 11.5h5M7.5 15.25h3" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <rect mask={`url(#${id}-b)`} x="4" y="7" width="12" height="14.5" rx="3" />
  </>
));

export const SidebarIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <rect x="10.5" y="6.25" width="8.75" height="11.5" rx="2" fill="#000" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="2.5" y="4" width="19" height="16" rx="4" />
  </>
));

export const SettingsIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <circle cx="12" cy="12" r="3.1" fill="#000" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M10.08 4.85L10.55 2.81L13.45 2.81L13.92 4.85A7.4 7.4 0 0 1 15.7 5.59L15.7 5.59L17.47 4.48L19.52 6.53L18.41 8.3A7.4 7.4 0 0 1 19.15 10.08L19.15 10.08L21.19 10.55L21.19 13.45L19.15 13.92A7.4 7.4 0 0 1 18.41 15.7L18.41 15.7L19.52 17.47L17.47 19.52L15.7 18.41A7.4 7.4 0 0 1 13.92 19.15L13.92 19.15L13.45 21.19L10.55 21.19L10.08 19.15A7.4 7.4 0 0 1 8.3 18.41L8.3 18.41L6.53 19.52L4.48 17.47L5.59 15.7A7.4 7.4 0 0 1 4.85 13.92L4.85 13.92L2.81 13.45L2.81 10.55L4.85 10.08A7.4 7.4 0 0 1 5.59 8.3L5.59 8.3L4.48 6.53L6.53 4.48L8.3 5.59A7.4 7.4 0 0 1 10.08 4.85z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </>
));

export const SearchIcon = softStroke(() => (
  <>
    <circle cx="10.5" cy="10.5" r="6.1" fill="none" stroke="currentColor" strokeWidth="2.8" />
    <path d="M15.6 15.6l4.15 4.15" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const KeyboardIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M6.75 9.25h.01M10.25 9.25h.01M13.75 9.25h.01M17.25 9.25h.01M8 14.5h8" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="2" y="4.5" width="20" height="15" rx="3.5" />
  </>
));

export const HistoryIcon = softGlyph(() => (
  <>
    <path d="M3.9 12a8.1 8.1 0 1 0 2.9-6.2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 4.9v3.6a1 1 0 0 0 1 1h3.6c.9 0 1.33-1.07.7-1.7L4.7 4.2C4.07 3.57 3 4 3 4.9z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
    <path d="M12 8v4.25l2.75 1.75" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const GitBranchIcon = softGlyph(() => (
  <>
    <path d="M7 8v8M17 8c0 5-10 3-10 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="7" cy="5.5" r="3" fill="currentColor" stroke="none" />
    <circle cx="7" cy="18.5" r="3" fill="currentColor" stroke="none" />
    <circle cx="17" cy="5.5" r="3" fill="currentColor" stroke="none" />
  </>
));

export const GitCommitIcon = softGlyph(() => (
  <>
    <path d="M3.25 12h5M15.75 12h5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="4.6" fill="currentColor" stroke="none" />
  </>
));

export const GitPullRequestIcon = softGlyph(() => (
  <>
    <path d="M6.5 8v8M17.5 16v-5.5A3.5 3.5 0 0 0 14 7h-3.5M13 4.25 10.25 7 13 9.75" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6.5" cy="5.5" r="3" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="18.5" r="3" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="18.5" r="3" fill="currentColor" stroke="none" />
  </>
));

export const GitCompareIcon = softGlyph(() => (
  <>
    <path d="M18 15.5v-5A3.5 3.5 0 0 0 14.5 7H11M13 4.25 10.25 7 13 9.75M6 8.5v5A3.5 3.5 0 0 0 9.5 17H13M11 14.25l2.75 2.75L11 19.75" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6" cy="6" r="3" fill="currentColor" stroke="none" />
    <circle cx="18" cy="18" r="3" fill="currentColor" stroke="none" />
  </>
));

export const GitMergeIcon = softGlyph(() => (
  <>
    <path d="M6.5 8v8M6.5 8c0 2.8 2.7 4.5 6 4.5H15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="6.5" cy="5.5" r="3" fill="currentColor" stroke="none" />
    <circle cx="6.5" cy="18.5" r="3" fill="currentColor" stroke="none" />
    <circle cx="17.5" cy="12.5" r="3" fill="currentColor" stroke="none" />
  </>
));

export const FetchIcon = softStroke(() => <path d="M4 12a8 8 0 0 1 13.66-5.66L19.5 8M19.5 3.5V8H15M20 12a8 8 0 0 1-13.66 5.66L4.5 16M4.5 20.5V16H9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />, 14);

export const CloneIcon = softGlyph(() => (
  <>
    <path d="M12 3.5v10.5M7.75 10 12 14.25 16.25 10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.5 15.5a1 1 0 0 1 2 0V17a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-1.5a1 1 0 0 1 2 0V17a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17z" stroke="currentColor" strokeWidth="0.5" strokeLinejoin="round" />
  </>
));

export const FileGlyph = softGlyph(() => (
  <>
    <path d="M7.5 2.5h5v5a3.5 3.5 0 0 0 3.5 3.5h4V18a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 18V6a3.5 3.5 0 0 1 3.5-3.5z" />
    <path d="M14.5 3.2v4.3c0 .83.67 1.5 1.5 1.5h4.3c.45 0 .67-.54.35-.85L15.35 2.85c-.31-.32-.85-.1-.85.35z" />
  </>
));

export const FileTextIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M8 14.75h8M8 18h5" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M7.5 2.5h5v5a3.5 3.5 0 0 0 3.5 3.5h4V18a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 18V6a3.5 3.5 0 0 1 3.5-3.5z" />
    <path d="M14.5 3.2v4.3c0 .83.67 1.5 1.5 1.5h4.3c.45 0 .67-.54.35-.85L15.35 2.85c-.31-.32-.85-.1-.85.35z" />
  </>
));

export const FolderSimpleIcon = softGlyph(() => <path d="M2.5 7a3 3 0 0 1 3-3h3.7a2.2 2.2 0 0 1 1.6.7l1.3 1.4a2.2 2.2 0 0 0 1.6.7h4.8a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" />);

export const FolderOpenIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M5.6 11.3a2.5 2.5 0 0 1 2.35-1.65H20.6c1.05 0 1.77 1.05 1.4 2.03l-2.55 6.7A2.5 2.5 0 0 1 17.1 20H4.3c-1.05 0-1.77-1.05-1.4-2.03z" fill="#000" stroke="#000" strokeWidth="3.5" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M2.5 7a3 3 0 0 1 3-3h3.7a2.2 2.2 0 0 1 1.6.7l1.3 1.4a2.2 2.2 0 0 0 1.6.7h4.8a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" />
    <path d="M5.6 11.3a2.5 2.5 0 0 1 2.35-1.65H20.6c1.05 0 1.77 1.05 1.4 2.03l-2.55 6.7A2.5 2.5 0 0 1 17.1 20H4.3c-1.05 0-1.77-1.05-1.4-2.03z" />
  </>
));

export const RevealIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M9.5 16.5l4.75-4.75M10.25 11.75h4v4" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M2.5 7a3 3 0 0 1 3-3h3.7a2.2 2.2 0 0 1 1.6.7l1.3 1.4a2.2 2.2 0 0 0 1.6.7h4.8a3 3 0 0 1 3 3V17a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z" />
  </>
));

export const EditorIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M2 8.25h20" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10.25 11.75 8 14l2.25 2.25M13.75 11.75 16 14l-2.25 2.25" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="2.5" y="3.5" width="19" height="17" rx="4" />
  </>
));

export const TerminalIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M7 9.25 9.75 12 7 14.75M12.5 15h4.5" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="2.5" y="4" width="19" height="16" rx="4" />
  </>
));

export const UnifiedViewIcon = softGlyph(() => (
  <>
    <rect x="3" y="3.5" width="18" height="7.75" rx="2.75" />
    <rect x="3" y="12.75" width="18" height="7.75" rx="2.75" />
  </>
));

export const SplitViewIcon = softGlyph(() => (
  <>
    <rect x="3" y="3.5" width="8.25" height="17" rx="2.75" />
    <rect x="12.75" y="3.5" width="8.25" height="17" rx="2.75" />
  </>
));

export const EyeIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <circle cx="12" cy="12" r="3.6" fill="#000" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M2.4 13.1a2.3 2.3 0 0 1 0-2.2C4 7.9 7.4 5 12 5s8 2.9 9.6 5.9a2.3 2.3 0 0 1 0 2.2C20 16.1 16.6 19 12 19s-8-2.9-9.6-5.9z" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </>
));

export const EyeOffIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M4 3.5 20.5 20" fill="none" stroke="#000" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3.4" fill="#000" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M2.4 13.1a2.3 2.3 0 0 1 0-2.2C4 7.9 7.4 5 12 5s8 2.9 9.6 5.9a2.3 2.3 0 0 1 0 2.2C20 16.1 16.6 19 12 19s-8-2.9-9.6-5.9z" />
    <path d="M4 3.5 20.5 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const ExpandUpIcon = softStroke(() => <path d="M12 16V4.5M7.5 9 12 4.5 16.5 9M4.5 20h2M11 20h2M17.5 20h2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />, 14);

export const ExpandDownIcon = softStroke(() => <path d="M12 8v11.5M7.5 15 12 19.5l4.5-4.5M4.5 4h2M11 4h2M17.5 4h2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />, 14);

export const ExpandBothIcon = softStroke(() => <path d="M12 9V3.5M8.75 6.75 12 3.5l3.25 3.25M12 15v5.5M8.75 17.25 12 20.5l3.25-3.25M3.5 12h2.5M18 12h2.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />, 14);

export const TreeIcon = softGlyph(() => (
  <>
    <circle cx="5.5" cy="5.5" r="2.6" fill="currentColor" stroke="none" />
    <path d="M10 5.5h10M5.5 8v8a2 2 0 0 0 2 2h1.5M5.5 10a2 2 0 0 0 2 2h1.5M12.5 12H20M12.5 18H20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const CopyIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <rect x="6.25" y="6.25" width="16.5" height="16.5" rx="4.75" fill="#000" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="3" y="3" width="13" height="13" rx="3" />
    <rect x="8" y="8" width="13" height="13" rx="3" />
  </>
));

export const TrashIcon = softGlyph((id) => (
  <>
    <rect x="3.5" y="5" width="17" height="2.5" rx="1.25" />
    <path d="M9.25 5.5V5a1.75 1.75 0 0 1 1.75-1.75h2A1.75 1.75 0 0 1 14.75 5v.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <Knockout id={`${id}-m`}>
      <path d="M10 12.5v5.25M14 12.5v5.25" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M5.25 9h13.5l-.8 9.75a3 3 0 0 1-3 2.75h-5.9a3 3 0 0 1-3-2.75z" />
  </>
));

export const PencilIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M13 6.25l4.75 4.75" fill="none" stroke="#000" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M14.9 4.3a2.6 2.6 0 0 1 3.7 0l1.1 1.1a2.6 2.6 0 0 1 0 3.7L9.6 19.2a2.5 2.5 0 0 1-1.2.66l-3.9.95a.9.9 0 0 1-1.1-1.1l.95-3.9a2.5 2.5 0 0 1 .66-1.2z" />
  </>
));

export const UndoIcon = softStroke(() => <path d="M9 5.25 4.5 9.75 9 14.25M4.5 9.75h10a4.75 4.75 0 0 1 0 9.5H11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const RefreshIcon = softStroke(() => <path d="M20 12a8 8 0 1 1-2.34-5.66L19.5 8M19.5 3.5V8H15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const ExternalLinkIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M20.5 3.5l-8.5 8.5" fill="none" stroke="#000" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="0" width="12" height="11.5" rx="3.5" fill="#000" />
    </Knockout>
    <rect mask={`url(#${id}-m)`} x="3" y="5" width="16" height="16" rx="3.75" />
    <path d="M14 3.5h6.5V10M20.5 3.5 12.5 11.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const CheckIcon = softStroke(() => <path d="M4.75 12.5 9.5 17.25 19.25 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const XIcon = softStroke(() => <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const PlusIcon = softStroke(() => <path d="M12 4.5v15M4.5 12h15" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const EllipsisIcon = softGlyph(() => (
  <>
    <circle cx="5" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="2.2" fill="currentColor" stroke="none" />
  </>
));

export const ChevronDownIcon = softStroke(() => <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const ChevronRightIcon = softStroke(() => <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const ChevronUpIcon = softStroke(() => <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const ChevronLeftIcon = softStroke(() => <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const ArrowLeftIcon = softStroke(() => <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const ArrowUpIcon = softStroke(() => <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />, 14);

export const ArrowDownIcon = softStroke(() => <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />, 14);

export const SwapIcon = softStroke(() => <path d="M7.5 4 4 7.5 7.5 11M4 7.5h15M16.5 13l3.5 3.5-3.5 3.5M20 16.5H5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />);

export const CommentIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M7.75 8.75h8.5M7.75 12.5h5" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M6.75 3.5h10.5a3.75 3.75 0 0 1 3.75 3.75v7a3.75 3.75 0 0 1-3.75 3.75h-4.6l-4.35 3.1a.9.9 0 0 1-1.42-.73V18h-.13A3.75 3.75 0 0 1 3 14.25v-7A3.75 3.75 0 0 1 6.75 3.5z" />
  </>
));

export const SendIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M6.5 12h5" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M4.5 5.5a1 1 0 0 1 1.4-1.1l14.2 6.7a1 1 0 0 1 0 1.8L5.9 19.6a1 1 0 0 1-1.4-1.1L6 12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </>
));

export const StopIcon = softGlyph(() => <rect x="4.5" y="4.5" width="15" height="15" rx="4" />);

export const CheckCircleIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M8 12.25l2.75 2.75 5.25-5.5" fill="none" stroke="#000" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <circle mask={`url(#${id}-m)`} cx="12" cy="12" r="9.5" />
  </>
));

export const AlertCircleIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M12 7.25v5.25" fill="none" stroke="#000" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="16.4" r="1.4" fill="#000" />
    </Knockout>
    <circle mask={`url(#${id}-m)`} cx="12" cy="12" r="9.5" />
  </>
));

export const InfoIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M12 11v5.5" fill="none" stroke="#000" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7.6" r="1.4" fill="#000" />
    </Knockout>
    <circle mask={`url(#${id}-m)`} cx="12" cy="12" r="9.5" />
  </>
));

export const ApproveIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M8.25 12.25l2.5 2.5 5-5.25" fill="none" stroke="#000" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M8.9 4.52Q12 0.6 15.1 4.52Q20.06 3.94 19.48 8.9Q23.4 12 19.48 15.1Q20.06 20.06 15.1 19.48Q12 23.4 8.9 19.48Q3.94 20.06 4.52 15.1Q0.6 12 4.52 8.9Q3.94 3.94 8.9 4.52z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
  </>
));

export const RequestChangesIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <path d="M12 7.25v3.75" fill="none" stroke="#000" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="14.25" r="1.4" fill="#000" />
    </Knockout>
    <path mask={`url(#${id}-m)`} d="M6.75 3.5h10.5a3.75 3.75 0 0 1 3.75 3.75v7a3.75 3.75 0 0 1-3.75 3.75h-4.6l-4.35 3.1a.9.9 0 0 1-1.42-.73V18h-.13A3.75 3.75 0 0 1 3 14.25v-7A3.75 3.75 0 0 1 6.75 3.5z" />
  </>
));

export const SunIcon = softGlyph(() => (
  <>
    <circle cx="12" cy="12" r="4.6" fill="currentColor" stroke="none" />
    <path d="M12 4.1L12 2.7M17.59 6.41L18.58 5.42M19.9 12L21.3 12M17.59 17.59L18.58 18.58M12 19.9L12 21.3M6.41 17.59L5.42 18.58M4.1 12L2.7 12M6.41 6.41L5.42 5.42" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const MoonIcon = softGlyph(() => <path d="M20.2 14.3A8.8 8.8 0 1 1 9.7 3.8a7.2 7.2 0 0 0 10.5 10.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />);

export const KeyIcon = softGlyph((id) => (
  <>
    <Knockout id={`${id}-m`}>
      <circle cx="7.25" cy="16.75" r="1.6" fill="#000" />
    </Knockout>
    <circle mask={`url(#${id}-m)`} cx="8.25" cy="15.75" r="5.25" />
    <path d="M11.5 12.5 20 4M17.25 6.75l2.5 2.5M14.5 9.5l2 2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export const GitHubIcon = softGlyph(() => (
  <>
    <g transform="translate(1.5 1.5) scale(.875)">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></g>
  </>
));

export const SpinnerIcon = softStroke(() => (
  <>
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" strokeOpacity=".25" />
    <path d="M12 4a8 8 0 0 1 8 8" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </>
));

export function FileIcon(props: GlyphProps) {
  const { className, ...rest } = props;

  return <FileGlyph size="sm" className={className ?? 'text-text-muted'} {...rest} />;
}

export function FolderIcon(props: { open: boolean; className?: string }) {
  const { open, className } = props;
  const Glyph = open ? FolderOpenIcon : FolderSimpleIcon;

  return <Glyph size="sm" className={cn('text-text-muted/80', className)} />;
}

export function ChevronIcon(props: { expanded: boolean; className?: string }) {
  const { expanded, className } = props;

  return (
    <ChevronRightIcon
      size="xs"
      className={cn('text-text-muted transition-transform duration-150', expanded && 'rotate-90', className)}
    />
  );
}
