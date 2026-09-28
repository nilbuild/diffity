import type { ReactNode } from 'react';
import { Code, IconContext, Plus, X, type Icon, type IconProps } from '@phosphor-icons/react';

/**
 * The only icon source for the app: Phosphor, `fill` weight.
 * Import icons from this module (never from '@phosphor-icons/react' directly) so
 * the set stays curated. Add new re-exports here when a feature needs one.
 * Sizes: 12 (inline in 11-12px text, badges, chips), 14 (default), 16 (28px toolbar buttons), 20-24 (empty states).
 */
export {
  ArrowCounterClockwise as UndoIcon,
  ArrowDown as ArrowDownIcon,
  ArrowSquareOut as ExternalLinkIcon,
  ArrowUp as ArrowUpIcon,
  ArrowsClockwise as RefreshIcon,
  ArrowsInLineVertical as CollapseAllIcon,
  ArrowsOutLineVertical as ExpandAllIcon,
  BookOpen as BookIcon,
  Brain as BrainIcon,
  CaretDown as ChevronDownIcon,
  CaretRight as ChevronRightIcon,
  CaretUp as ChevronUpIcon,
  ChatCircleText as CommentIcon,
  CheckFat as CheckIcon,
  CheckCircle as CheckCircleIcon,
  Circle as CircleIcon,
  CircleNotch as SpinnerIcon,
  ClockCounterClockwise as HistoryIcon,
  Columns as ColumnsIcon,
  Copy as CopyIcon,
  DotsThreeOutline as MoreIcon,
  File as FileIcon,
  Folder as FolderIcon,
  GearSix as SettingsIcon,
  GitBranch as GitBranchIcon,
  GitCommit as GitCommitIcon,
  GitDiff as GitCompareIcon,
  GitPullRequest as PullRequestIcon,
  GithubLogo as GithubIcon,
  Globe as GlobeIcon,
  Keyboard as KeyboardIcon,
  Lightbulb as LightbulbIcon,
  MagnifyingGlass as SearchIcon,
  Paragraph as PilcrowIcon,
  PencilSimple as PencilIcon,
  Rows as RowsIcon,
  SidebarSimple as PanelRightIcon,
  Sparkle as SparklesIcon,
  Stop as StopIcon,
  Terminal as TerminalIcon,
  TextAa as TextIcon,
  Trash as TrashIcon,
  Warning as AlertIcon,
  Wrench as ToolIcon,
} from '@phosphor-icons/react';

export type { Icon as IconComponent, IconProps } from '@phosphor-icons/react';

/**
 * Phosphor's `fill` variant of a few bare glyphs (X, Plus, Code) draws them inside a filled
 * square. Those use the `bold` weight instead, which reads as the same solid style.
 */
function solidGlyph(Base: Icon) {
  function SolidGlyph(props: IconProps) {
    return <Base weight="bold" {...props} />;
  }
  SolidGlyph.displayName = `Solid(${Base.displayName ?? 'Icon'})`;
  return SolidGlyph;
}

export const XIcon = solidGlyph(X);
export const PlusIcon = solidGlyph(Plus);
export const CodeIcon = solidGlyph(Code);

const ICON_DEFAULTS = { weight: 'fill', size: 14, mirrored: false, color: 'currentColor' } as const;

export function IconProvider(props: { children: ReactNode }) {
  return <IconContext.Provider value={ICON_DEFAULTS}>{props.children}</IconContext.Provider>;
}
