import { FileIcon, FolderIcon, FolderOpenIcon } from '@/components/ui/icon';
import { cn } from '@/lib/cn';

export function FileTypeIcon(props: { name: string; size?: number; className?: string }) {
  const { size = 14, className } = props;
  return <FileIcon size={size} className={cn('shrink-0 text-fg-subtle', className)} />;
}

export function FolderTypeIcon(props: { open: boolean; size?: number; className?: string }) {
  const { open, size = 14, className } = props;
  const Icon = open ? FolderOpenIcon : FolderIcon;
  return <Icon size={size} className={cn('shrink-0 text-folder', className)} />;
}
