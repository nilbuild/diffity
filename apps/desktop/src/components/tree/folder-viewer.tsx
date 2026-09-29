import type { TreeEntryResponse } from '../../lib/api';
import { FileIcon } from '../icons/file-icon';
import { FolderIcon } from '../icons/folder-icon';

interface FolderViewerProps {
  entries: TreeEntryResponse[];
  onNavigate: (path: string, type: 'file' | 'dir') => void;
}

export function FolderViewer(props: FolderViewerProps) {
  const { entries, onNavigate } = props;

  const dirs = entries.filter(e => e.type === 'tree');
  const files = entries.filter(e => e.type === 'blob');
  const sorted = [...dirs, ...files];

  return (
    <div className="border border-border/70 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {sorted.map((entry, i) => (
            <tr
              key={entry.path}
              className={`hover:bg-hover cursor-pointer ${i > 0 ? 'border-t border-border/70' : ''}`}
              onClick={() => onNavigate(entry.path, entry.type === 'tree' ? 'dir' : 'file')}
            >
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  {entry.type === 'tree' ? (
                    <FolderIcon open={false} />
                  ) : (
                    <FileIcon />
                  )}
                  <span className="text-text">{entry.name}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
