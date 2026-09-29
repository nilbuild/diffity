import { useId, type CSSProperties, type ReactNode } from 'react';
import {
  CheckCircle,
  GearSix,
  GithubLogo,
  Info,
  Key,
  Keyboard,
  Moon,
  PaperPlaneTilt,
  Sparkle,
  Stop,
  Sun,
  TreeStructure,
  WarningCircle,
  type Icon as PhosphorIcon,
  type IconWeight,
} from '@phosphor-icons/react';
import { cn } from '../../lib/cn';

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<IconSize, number> = { xs: 12, sm: 14, md: 16, lg: 18, xl: 20 };

export interface GlyphProps {
  className?: string;
  size?: IconSize | number;
  weight?: IconWeight;
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

function glyph(Component: PhosphorIcon, defaultWeight: IconWeight = 'fill', defaultSize = 16) {
  function Glyph(props: GlyphProps) {
    const { className, size, weight, style, title } = props;

    return (
      <Component
        aria-hidden={title ? undefined : true}
        size={resolveSize(size, defaultSize)}
        weight={weight ?? defaultWeight}
        className={cn('shrink-0', className)}
        style={style}
      >
        {title ? <title>{title}</title> : null}
      </Component>
    );
  }
  return Glyph;
}

/**
 * The house style: a 20px grid, filled rounded shapes, and 2.4px round-capped strokes for line glyphs
 * (about 2px at 16px), so every icon has the same weight whether it is a shape or a line.
 */
function customGlyph(render: (id: string) => ReactNode, defaultSize = 16) {
  function Custom(props: GlyphProps) {
    const { className, size, style, title } = props;
    const pixels = resolveSize(size, defaultSize);
    const id = useId();

    return (
      <svg
        viewBox="0 0 20 20"
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
  return Custom;
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const thin = { ...line, strokeWidth: 2 } as const;

function lineGlyph(d: string, defaultSize = 16) {
  return customGlyph(() => <path {...line} d={d} />, defaultSize);
}

export const AlertCircleIcon = glyph(WarningCircle);
export const CheckCircleIcon = glyph(CheckCircle);
export const GitHubIcon = glyph(GithubLogo);
export const InfoIcon = glyph(Info);
export const KeyIcon = glyph(Key);
export const KeyboardIcon = glyph(Keyboard);
export const MoonIcon = glyph(Moon);
export const SendIcon = glyph(PaperPlaneTilt);
export const SettingsIcon = glyph(GearSix);
export const SparkleIcon = glyph(Sparkle);
export const StopIcon = glyph(Stop);
export const SunIcon = glyph(Sun);
export const TreeIcon = glyph(TreeStructure);

export const ChevronDownIcon = lineGlyph('M5.5 8 10 12.5 14.5 8');
export const ChevronRightIcon = lineGlyph('M8 5.5 12.5 10 8 14.5');
export const ChevronUpIcon = lineGlyph('M5.5 12 10 7.5 14.5 12');
export const ChevronUpDownIcon = lineGlyph('M6.5 7.5 10 4 13.5 7.5M6.5 12.5 10 16l3.5-3.5', 14);
export const XIcon = lineGlyph('M5.5 5.5l9 9M14.5 5.5l-9 9');
export const CheckIcon = lineGlyph('M4.5 10.5 8.25 14 15.5 6.5');
export const PlusIcon = lineGlyph('M10 4.5v11M4.5 10h11');
export const ArrowLeftIcon = lineGlyph('M15.5 10h-11M9 5.5 4.5 10 9 14.5');
export const ArrowUpIcon = lineGlyph('M10 15.5v-11M5.5 9 10 4.5 14.5 9', 14);
export const ArrowDownIcon = lineGlyph('M10 4.5v11M5.5 11l4.5 4.5 4.5-4.5', 14);
export const PushIcon = lineGlyph('M10 16.5V8M6 11.5l4-4 4 4M4.5 3.75h11', 14);
export const PullIcon = lineGlyph('M10 3.5V12M6 8.5l4 4 4-4M4.5 16.25h11', 14);
export const ExpandUpIcon = PushIcon;
export const ExpandDownIcon = PullIcon;
export const ExpandBothIcon = lineGlyph('M10 3.5v13M6.5 7 10 3.5 13.5 7M6.5 13l3.5 3.5 3.5-3.5', 14);
export const UploadIcon = PushIcon;
export const DownloadIcon = PullIcon;
export const FetchIcon = lineGlyph('M15.6 7.5A6 6 0 0 0 4.9 6.3M4.4 12.5a6 6 0 0 0 10.7 1.2M15.8 3.6v3.9h-3.9M4.2 16.4v-3.9h3.9', 14);
export const RefreshIcon = lineGlyph('M15.5 10a5.5 5.5 0 1 1-1.8-4.1M15.5 3.8v3.7h-3.7');
export const UndoIcon = lineGlyph('M7.5 4.75 4.5 7.75l3 3M4.5 7.75h7.25a4 4 0 0 1 0 8H8');
export const SwapIcon = lineGlyph('M6.5 4 3.5 7l3 3M3.5 7h12M13.5 10l3 3-3 3M16.5 13h-12');
export const CodeIcon = lineGlyph('M7 5.5 3 10l4 4.5M13 5.5l4 4.5-4 4.5');
export const CollapseAllIcon = lineGlyph('M6 3.5l4 4 4-4M6 16.5l4-4 4 4');
export const ExpandAllIcon = lineGlyph('M6 7.5l4-4 4 4M6 12.5l4 4 4-4');
export const ExternalLinkIcon = lineGlyph('M9 4.5H6.5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V11M11.5 4.5h4v4M15.5 4.5 9.5 10.5');
export const SearchIcon = customGlyph(() => <path {...line} d="M8.75 3.75a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12.5 12.5l3.75 3.75" />);

export const EllipsisIcon = customGlyph(() => (
  <>
    <circle cx="4.5" cy="10" r="1.75" />
    <circle cx="10" cy="10" r="1.75" />
    <circle cx="15.5" cy="10" r="1.75" />
  </>
));

export const ListIcon = customGlyph(() => (
  <>
    <circle cx="4.5" cy="5.5" r="1.6" />
    <circle cx="4.5" cy="10" r="1.6" />
    <circle cx="4.5" cy="14.5" r="1.6" />
    <path {...line} d="M8.5 5.5h7.5M8.5 10h7.5M8.5 14.5h7.5" />
  </>
));

export const PencilIcon = customGlyph(() => (
  <path d="M12.9 3.4a2.2 2.2 0 0 1 3.1 0l.6.6a2.2 2.2 0 0 1 0 3.1l-8.3 8.3a2 2 0 0 1-.9.52l-3.4.93a.75.75 0 0 1-.92-.92l.93-3.4a2 2 0 0 1 .52-.9z" />
));

export const SidebarIcon = customGlyph(() => (
  <>
    <rect {...thin} x="2.75" y="3.75" width="14.5" height="12.5" rx="3" />
    <path d="M5.75 3.75H8.5v12.5H5.75a3 3 0 0 1-3-3v-6.5a3 3 0 0 1 3-3z" />
  </>
));

export const UnifiedViewIcon = customGlyph(() => (
  <>
    <rect x="3" y="3.5" width="14" height="5.75" rx="2" />
    <rect x="3" y="10.75" width="14" height="5.75" rx="2" />
  </>
));

export const SplitViewIcon = customGlyph(() => (
  <>
    <rect x="3" y="3.5" width="6.25" height="13" rx="2" />
    <rect x="10.75" y="3.5" width="6.25" height="13" rx="2" />
  </>
));

const eyePath = 'M10 4.25c-4.1 0-6.75 3.3-7.55 4.75a2.1 2.1 0 0 0 0 2c.8 1.45 3.45 4.75 7.55 4.75s6.75-3.3 7.55-4.75a2.1 2.1 0 0 0 0-2C16.75 7.55 14.1 4.25 10 4.25zm0 3.25a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z';

export const EyeIcon = customGlyph(() => <path fillRule="evenodd" d={eyePath} />);

export const EyeOffIcon = customGlyph((id) => (
  <>
    <mask id={`${id}-m`}>
      <rect width="20" height="20" fill="white" />
      <path d="M3.5 2.5l14 15" stroke="black" strokeWidth="4.4" strokeLinecap="round" />
    </mask>
    <path fillRule="evenodd" d={eyePath} mask={`url(#${id}-m)`} />
    <path {...line} d="M3.5 2.5l14 15" />
  </>
));

export const CommentIcon = customGlyph(() => (
  <path
    fillRule="evenodd"
    d="M5.5 3h9a3 3 0 0 1 3 3v5.5a3 3 0 0 1-3 3h-4.1l-3.55 2.66a.7.7 0 0 1-1.12-.56V14.5A3 3 0 0 1 2.5 11.5V6a3 3 0 0 1 3-3zM6.5 6.9v1.6h7V6.9zM6.5 9.9v1.6h4.5V9.9z"
  />
));

export const CopyIcon = customGlyph(() => (
  <>
    <path {...thin} d="M12.75 5.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5.75a2 2 0 0 0 2 2h.5" />
    <rect x="7" y="7" width="10.5" height="10.5" rx="2.5" />
  </>
));

export const TrashIcon = customGlyph(() => (
  <>
    <path {...thin} d="M3.5 5.25h13M8 5V4a1.25 1.25 0 0 1 1.25-1.25h1.5A1.25 1.25 0 0 1 12 4v1" />
    <path d="M4.9 7h10.2l-.72 8.4a2.2 2.2 0 0 1-2.2 2H7.82a2.2 2.2 0 0 1-2.2-2z" />
  </>
));

export const ChangesIcon = customGlyph(() => (
  <path
    fillRule="evenodd"
    d="M7 2.5h6a3.5 3.5 0 0 1 3.5 3.5v8a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 14V6A3.5 3.5 0 0 1 7 2.5zM9.2 4.8v2h-2v1.6h2v2h1.6v-2h2V6.8h-2v-2zM7.2 12.2v1.6h5.6v-1.6z"
  />
));

const folderPath = 'M5.5 3.5h2.6c.52 0 1.02.2 1.4.58l1.1 1.1c.2.2.45.32.72.32h3.18a2.5 2.5 0 0 1 2.5 2.5V14a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 14V6a2.5 2.5 0 0 1 2.5-2.5z';

export const FolderSimpleIcon = customGlyph(() => <path d={folderPath} />);
export const FolderOpenIcon = FolderSimpleIcon;

export const HistoryIcon = customGlyph(() => (
  <path
    fillRule="evenodd"
    d="M10 2.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zM9.2 6.2v4.2c0 .28.14.53.38.68l2.48 1.52a.8.8 0 1 0 .84-1.36l-2.1-1.3V6.2a.8.8 0 0 0-1.6 0z"
  />
));

export const GitBranchIcon = customGlyph(() => (
  <>
    <path {...line} d="M6 6.5v7M14 8.75c0 3.2-8 2.2-8 4.75" />
    <circle cx="6" cy="4.5" r="2.75" />
    <circle cx="6" cy="15.5" r="2.75" />
    <circle cx="14" cy="6.5" r="2.75" />
  </>
));

export const GitPullRequestIcon = customGlyph(() => (
  <>
    <path {...line} d="M5.5 6.5v7M14.5 13.5V9.25a3 3 0 0 0-3-3H9.5M11.25 4.25 9.25 6.25l2 2" />
    <circle cx="5.5" cy="4.5" r="2.75" />
    <circle cx="5.5" cy="15.5" r="2.75" />
    <circle cx="14.5" cy="15.5" r="2.75" />
  </>
));

export const GitCommitIcon = customGlyph(() => (
  <>
    <path {...line} d="M2.5 10h3.25M14.25 10h3.25" />
    <circle cx="10" cy="10" r="3.75" />
  </>
));

export const GitCompareIcon = customGlyph(() => (
  <>
    <path {...line} d="M5 7.5v2.75A3.25 3.25 0 0 0 8.25 13.5h2.25M8.75 11.75l1.75 1.75-1.75 1.75M15 12.5V9.75A3.25 3.25 0 0 0 11.75 6.5H9.5M11.25 4.75 9.5 6.5l1.75 1.75" />
    <circle cx="5" cy="5" r="2.75" />
    <circle cx="15" cy="15" r="2.75" />
  </>
));

export const EditorIcon = customGlyph((id) => (
  <>
    <mask id={`${id}-m`}>
      <rect width="20" height="20" fill="white" />
      <path d="M8 7.25 5.5 10 8 12.75M12 7.25 14.5 10 12 12.75" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </mask>
    <rect x="2.5" y="3" width="15" height="14" rx="3.5" mask={`url(#${id}-m)`} />
  </>
));

export const HomeIcon = customGlyph(() => (
  <path d="M8.7 2.95a2 2 0 0 1 2.6 0l5.1 4.3c.45.38.7.93.7 1.52v6.23a2.5 2.5 0 0 1-2.5 2.5h-2.1a.9.9 0 0 1-.9-.9v-3.1a1.6 1.6 0 0 0-3.2 0v3.1a.9.9 0 0 1-.9.9H5.4a2.5 2.5 0 0 1-2.5-2.5V8.77c0-.59.26-1.14.7-1.52z" />
));

export const FileTextIcon = ChangesIcon;

const FileGlyph = customGlyph(() => (
  <path {...thin} d="M6.5 2.75h4.3c.5 0 .98.2 1.33.55l2.57 2.57c.35.35.55.83.55 1.33v7.3a2.75 2.75 0 0 1-2.75 2.75h-6a2.75 2.75 0 0 1-2.75-2.75v-9A2.75 2.75 0 0 1 6.5 2.75z" />
));

export function FileIcon(props: GlyphProps) {
  const { className, ...rest } = props;

  return <FileGlyph size="sm" className={className ?? 'text-text-muted'} {...rest} />;
}

export function FolderIcon(props: { open: boolean; className?: string }) {
  const { className } = props;

  return <FolderSimpleIcon size="sm" className={cn('text-text-muted/80', className)} />;
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
