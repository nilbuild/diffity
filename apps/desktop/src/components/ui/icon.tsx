import type { CSSProperties } from 'react';
import {
  ArrowClockwise,
  ArrowCounterClockwise,
  ArrowDown,
  ArrowLeft,
  ArrowLineDown,
  ArrowLineUp,
  ArrowSquareOut,
  ArrowUp,
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
  ClockCounterClockwise,
  Code,
  Columns,
  Copy,
  DotsThree,
  DownloadSimple,
  Eye,
  EyeSlash,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderSimple,
  GearSix,
  GitBranch,
  GitCommit,
  GitDiff,
  GitPullRequest,
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
export const ExpandBothIcon = glyph(ArrowsDownUp, 'bold', 14);
export const CheckCircleIcon = glyph(CheckCircle);
export const CheckIcon = glyph(Check, 'bold');
export const ChevronDownIcon = glyph(CaretDown, 'bold');
export const ChevronRightIcon = glyph(CaretRight, 'bold');
export const ChevronUpIcon = glyph(CaretUp, 'bold');
export const ChevronUpDownIcon = glyph(CaretUpDown, 'bold', 14);
export const CodeIcon = glyph(Code, 'bold');
export const CommentIcon = glyph(ChatCircleText);
export const CopyIcon = glyph(Copy);
export const DownloadIcon = glyph(DownloadSimple, 'bold');
export const EllipsisIcon = glyph(DotsThree, 'bold');
export const ExternalLinkIcon = glyph(ArrowSquareOut, 'bold');
export const EyeIcon = glyph(Eye);
export const EyeOffIcon = glyph(EyeSlash);
export const FileTextIcon = glyph(FileText);
export const FolderOpenIcon = glyph(FolderOpen);
export const FolderSimpleIcon = glyph(FolderSimple);
export const GitBranchIcon = glyph(GitBranch);
export const GitCommitIcon = glyph(GitCommit, 'bold');
export const GitCompareIcon = glyph(GitDiff);
export const GitPullRequestIcon = glyph(GitPullRequest);
export const GitHubIcon = glyph(GithubLogo);
export const HistoryIcon = glyph(ClockCounterClockwise, 'bold');
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

const FileGlyph = glyph(File);
const FolderGlyph = glyph(Folder);
const FolderOpenGlyph = glyph(FolderOpen);

export function FileIcon(props: GlyphProps) {
  const { className, ...rest } = props;

  return <FileGlyph size="sm" className={className ?? 'text-text-muted'} {...rest} />;
}

export function FolderIcon(props: { open: boolean; className?: string }) {
  const { open, className } = props;
  const Component = open ? FolderOpenGlyph : FolderGlyph;

  return <Component size="sm" className={cn('text-[#5b9cf5]', className)} />;
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
