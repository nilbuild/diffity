import type { TreeEntryResponse } from '../../lib/api';
import { FileIcon } from '../icons/file-icon';
import { FolderIcon } from '../icons/folder-icon';

interface FolderViewerProps {
  entries: TreeEntryResponse[];
  onNavigate: (path: string, type: 'file' | 'dir') => void;
}

export function FolderViewer(props: FolderViewerProps) {
  const { entries, onNavigate } = props;

  const dirs = entries.filter((entry) => entry.type === 'tree');
  const files = entries.filter((entry) => entry.type === 'blob');
  const sorted = [...dirs, ...files];

  return (
    <ul className="-mx-2">
      {sorted.map((entry) => (
        <li key={entry.path}>
          <button
            className="flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-left text-[13px] text-text hover:bg-hover transition-colors cursor-pointer"
            onClick={() => onNavigate(entry.path, entry.type === 'tree' ? 'dir' : 'file')}
          >
            {entry.type === 'tree' ? <FolderIcon open={false} /> : <FileIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />}
            <span className="truncate">{entry.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
