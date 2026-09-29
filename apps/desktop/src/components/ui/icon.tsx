import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowLineDown,
  ArrowLineUp,
  ArrowSquareOut,
  ArrowUp,
  ArrowsClockwise,
  ArrowsDownUp,
  ArrowsInLineVertical,
  ArrowsLeftRight,
  ArrowsOutLineVertical,
  CaretDown,
  CaretRight,
  CaretUp,
  CaretUpDown,
  ChatCircleText,
  Check,
  CheckCircle,
  Code,
  CodeBlock,
  Columns,
  Copy,
  DotsThree,
  DownloadSimple,
  Eye,
  EyeSlash,
  File,
  GearSix,
  GithubLogo,
  Info,
  Key,
  Keyboard,
  ListBullets,
  MagnifyingGlass,
  Moon,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Rows,
  SidebarSimple,
  Sparkle,
  Stop,
  Sun,
  Trash,
  TreeStructure,
  UploadSimple,
  WarningCircle,
  X,
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

export const AlertCircleIcon = glyph(WarningCircle);
export const ArrowDownIcon = glyph(ArrowDown, 'bold', 14);
export const ArrowLeftIcon = glyph(ArrowLeft, 'bold');
export const ArrowUpIcon = glyph(ArrowUp, 'bold', 14);
export const ExpandDownIcon = glyph(ArrowLineDown, 'bold', 14);
export const ExpandUpIcon = glyph(ArrowLineUp, 'bold', 14);
export const FetchIcon = glyph(ArrowsClockwise, 'bold', 14);
export const PullIcon = glyph(ArrowLineDown, 'bold', 14);
export const PushIcon = glyph(ArrowLineUp, 'bold', 14);
export const ExpandBothIcon = glyph(ArrowsDownUp, 'bold', 14);
export const CheckCircleIcon = glyph(CheckCircle);
export const CheckIcon = glyph(Check, 'bold');
export const ChevronDownIcon = glyph(CaretDown, 'bold');
export const ChevronRightIcon = glyph(CaretRight, 'bold');
export const ChevronUpIcon = glyph(CaretUp, 'bold');
export const ChevronUpDownIcon = glyph(CaretUpDown, 'bold', 14);
export const CodeIcon = glyph(Code, 'bold');
export const EditorIcon = glyph(CodeBlock);
export const CommentIcon = glyph(ChatCircleText);
export const CopyIcon = glyph(Copy);
export const DownloadIcon = glyph(DownloadSimple, 'bold');
export const EllipsisIcon = glyph(DotsThree, 'bold');
export const ExternalLinkIcon = glyph(ArrowSquareOut, 'bold');
export const EyeIcon = glyph(Eye);
export const EyeOffIcon = glyph(EyeSlash);
export const GitHubIcon = glyph(GithubLogo);
export const InfoIcon = glyph(Info);
export const KeyIcon = glyph(Key);
export const KeyboardIcon = glyph(Keyboard);
export const ListIcon = glyph(ListBullets, 'bold');
export const MoonIcon = glyph(Moon);
export const PencilIcon = glyph(PencilSimple);
export const PlusIcon = glyph(Plus, 'bold');
export const RefreshIcon = glyph(ArrowClockwise, 'bold');
export const SearchIcon = glyph(MagnifyingGlass, 'bold');
export const SendIcon = glyph(PaperPlaneTilt);
export const SettingsIcon = glyph(GearSix);
export const SidebarIcon = glyph(SidebarSimple);
export const SparkleIcon = glyph(Sparkle);
export const SplitViewIcon = glyph(Columns);
export const StopIcon = glyph(Stop);
export const SunIcon = glyph(Sun);
export const SwapIcon = glyph(ArrowsLeftRight, 'bold');
export const TrashIcon = glyph(Trash);
export const TreeIcon = glyph(TreeStructure);
export const UndoIcon = glyph(ArrowCounterClockwise, 'bold');
export const UnifiedViewIcon = glyph(Rows);
export const UploadIcon = glyph(UploadSimple, 'bold');
export const XIcon = glyph(X, 'bold');
export const CollapseAllIcon = glyph(ArrowsInLineVertical, 'bold');
export const ExpandAllIcon = glyph(ArrowsOutLineVertical, 'bold');

const FileGlyph = glyph(File, 'duotone');

function customGlyph(render: () => ReactNode, defaultSize = 16) {
  function Custom(props: GlyphProps) {
    const { className, size, style, title } = props;
    const pixels = resolveSize(size, defaultSize);

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
        {render()}
      </svg>
    );
  }
  return Custom;
}

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

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
    <path {...line} d="M6 6.5v7M14 8.5c0 3.2-8 2.3-8 5" />
    <circle cx="6" cy="4.5" r="2.4" />
    <circle cx="6" cy="15.5" r="2.4" />
    <circle cx="14" cy="6.5" r="2.4" />
  </>
));

export const GitPullRequestIcon = customGlyph(() => (
  <>
    <path {...line} d="M6 6.5v7M14 13.5V9a3 3 0 0 0-3-3H9.25M11 4.25 9.25 6 11 7.75" />
    <circle cx="6" cy="4.5" r="2.4" />
    <circle cx="6" cy="15.5" r="2.4" />
    <circle cx="14" cy="15.5" r="2.4" />
  </>
));

export const GitCommitIcon = customGlyph(() => (
  <>
    <path {...line} d="M2.75 10h3.5M13.75 10h3.5" />
    <circle cx="10" cy="10" r="3.4" />
  </>
));

export const GitCompareIcon = customGlyph(() => (
  <>
    <path {...line} d="M5 7.5v2.75A3.25 3.25 0 0 0 8.25 13.5h2.25M9 12l1.5 1.5L9 15M15 12.5V9.75A3.25 3.25 0 0 0 11.75 6.5H9.5M11 5 9.5 6.5 11 8" />
    <circle cx="5" cy="5" r="2.4" />
    <circle cx="15" cy="15" r="2.4" />
  </>
));

export const FileTextIcon = ChangesIcon;

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
