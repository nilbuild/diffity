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

const CODE = FileCodeIcon;

const BY_EXT: Record<string, IconComponent> = {
  ts: FileTsIcon,
  tsx: FileTsIcon,
  mts: FileTsIcon,
  js: FileJsIcon,
  jsx: FileJsIcon,
  mjs: FileJsIcon,
  cjs: FileJsIcon,
  css: FileCssIcon,
  scss: FileCssIcon,
  html: FileHtmlIcon,
  md: FileMdIcon,
  mdx: FileMdIcon,
  py: FilePyIcon,
  rs: FileRsIcon,
  svg: FileSvgIcon,
  png: FileImageIcon,
  jpg: FileImageIcon,
  jpeg: FileImageIcon,
  gif: FileImageIcon,
  webp: FileImageIcon,
  ico: FileImageIcon,
  lock: FileLockIcon,
  txt: FileTextIcon,
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

export function fileKind(name: string): IconComponent {
  const lower = name.toLowerCase();
  if (lower.endsWith('.lock') || lower === 'pnpm-lock.yaml' || lower === 'package-lock.json') {
    return BY_EXT.lock;
  }
  const dot = lower.lastIndexOf('.');
  if (dot <= 0) {
    return FileIcon;
  }
  return BY_EXT[lower.slice(dot + 1)] ?? FileIcon;
}

export function FileTypeIcon(props: { name: string; size?: number; className?: string }) {
  const { name, size = 14, className } = props;
  const Icon = fileKind(name);
  return <Icon size={size} className={cn('shrink-0 text-fg-subtle', className)} />;
}

export function FolderTypeIcon(props: { open: boolean; size?: number; className?: string }) {
  const { open, size = 14, className } = props;
  const Icon = open ? FolderOpenIcon : FolderIcon;
  return <Icon size={size} className={cn('shrink-0 text-accent', className)} />;
}
