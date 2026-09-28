import {
  FileCodeIcon,
  FileCssIcon,
  FileHtmlIcon,
  FileIcon,
  FileImageIcon,
  FileJsIcon,
  FileLockIcon,
  FileMdIcon,
  FilePyIcon,
  FileRsIcon,
  FileSvgIcon,
  FileTextIcon,
  FileTsIcon,
  FolderIcon,
  FolderOpenIcon,
  type IconComponent,
} from '@/components/ui/icon';
import { cn } from '@/lib/cn';

interface Kind {
  icon: IconComponent;
  tone: string;
}

const CODE: Kind = { icon: FileCodeIcon, tone: 'text-fg-muted' };

const BY_EXT: Record<string, Kind> = {
  ts: { icon: FileTsIcon, tone: 'text-info' },
  tsx: { icon: FileTsIcon, tone: 'text-info' },
  mts: { icon: FileTsIcon, tone: 'text-info' },
  js: { icon: FileJsIcon, tone: 'text-warning' },
  jsx: { icon: FileJsIcon, tone: 'text-warning' },
  mjs: { icon: FileJsIcon, tone: 'text-warning' },
  cjs: { icon: FileJsIcon, tone: 'text-warning' },
  css: { icon: FileCssIcon, tone: 'text-accent' },
  scss: { icon: FileCssIcon, tone: 'text-accent' },
  html: { icon: FileHtmlIcon, tone: 'text-danger' },
  md: { icon: FileMdIcon, tone: 'text-fg-muted' },
  mdx: { icon: FileMdIcon, tone: 'text-fg-muted' },
  py: { icon: FilePyIcon, tone: 'text-info' },
  rs: { icon: FileRsIcon, tone: 'text-danger' },
  svg: { icon: FileSvgIcon, tone: 'text-success' },
  png: { icon: FileImageIcon, tone: 'text-success' },
  jpg: { icon: FileImageIcon, tone: 'text-success' },
  jpeg: { icon: FileImageIcon, tone: 'text-success' },
  gif: { icon: FileImageIcon, tone: 'text-success' },
  webp: { icon: FileImageIcon, tone: 'text-success' },
  ico: { icon: FileImageIcon, tone: 'text-success' },
  lock: { icon: FileLockIcon, tone: 'text-fg-subtle' },
  txt: { icon: FileTextIcon, tone: 'text-fg-subtle' },
  json: CODE,
  toml: CODE,
  yaml: CODE,
  yml: CODE,
  go: CODE,
  java: CODE,
  rb: CODE,
  sh: CODE,
  swift: CODE,
  c: CODE,
  cpp: CODE,
  h: CODE,
};

export function fileKind(name: string): Kind {
  const lower = name.toLowerCase();
  if (lower.endsWith('.lock') || lower === 'pnpm-lock.yaml' || lower === 'package-lock.json') {
    return BY_EXT.lock;
  }
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) {
    return { icon: FileIcon, tone: 'text-fg-subtle' };
  }
  return BY_EXT[lower.slice(dot + 1)] ?? { icon: FileIcon, tone: 'text-fg-subtle' };
}

export function FileTypeIcon(props: { name: string; size?: number; className?: string }) {
  const { name, size = 14, className } = props;
  const kind = fileKind(name);
  const Icon = kind.icon;
  return <Icon size={size} className={cn('shrink-0', kind.tone, className)} />;
}

export function FolderTypeIcon(props: { open: boolean; size?: number; className?: string }) {
  const { open, size = 14, className } = props;
  const Icon = open ? FolderOpenIcon : FolderIcon;
  return <Icon size={size} className={cn('shrink-0 text-accent/80', className)} />;
}
