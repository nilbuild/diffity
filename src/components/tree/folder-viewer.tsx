import { useQuery } from '@tanstack/react-query';
import type { TreeEntryResponse } from '../../lib/api';
import { treeFileContentOptions } from '../../queries/tree';
import { FileIcon, FolderIcon } from '../ui/icon';
import { MarkdownPreview } from './markdown-preview';
import { StatusLetter } from './file-tree-item';
import { DelayedFileSkeleton } from '../layout/skeleton';

interface FolderViewerProps {
  entries: TreeEntryResponse[];
  onNavigate: (path: string, type: 'file' | 'dir') => void;
  /** Uncommitted status by path, so changed files carry their letter here too. */
  statuses?: Map<string, string>;
}

/** The folder's README (any case), shown in place of the listing: the sidebar tree already lists the folder. */
export function findReadme(entries: TreeEntryResponse[]): TreeEntryResponse | null {
  return entries.find((entry) => entry.type === 'blob' && entry.name.toLowerCase() === 'readme.md') ?? null;
}

function FolderReadme(props: { entry: TreeEntryResponse }) {
  const { entry } = props;
  const { data: content, isPending, isError } = useQuery(treeFileContentOptions(entry.path));

  if (isError) {
    return null;
  }
  if (isPending || !content) {
    return <DelayedFileSkeleton lines={8} />;
  }
  return <MarkdownPreview content={content} filePath={entry.path} bare />;
}

export function FolderViewer(props: FolderViewerProps) {
  const { entries, onNavigate, statuses } = props;

  const dirs = entries.filter((entry) => entry.type === 'tree');
  const files = entries.filter((entry) => entry.type === 'blob');
  const sorted = [...dirs, ...files];
  const readme = findReadme(entries);

  if (readme) {
    return <FolderReadme key={readme.path} entry={readme} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <ul className={sorted.length > 12 ? '-mx-2 columns-[240px] gap-x-4' : '-mx-2 max-w-xl'}>
        {sorted.map((entry) => {
          const status = entry.type === 'blob' ? statuses?.get(entry.path) : undefined;
          return (
            <li key={entry.path} className="break-inside-avoid">
              <button
                className="flex items-center gap-2 w-full h-7 px-2 rounded-md text-left text-[13px] text-text hover:bg-hover transition-colors cursor-pointer"
                onClick={() => onNavigate(entry.path, entry.type === 'tree' ? 'dir' : 'file')}
                title={entry.path}
              >
                {entry.type === 'tree' ? <FolderIcon open={false} /> : <FileIcon className="w-3.5 h-3.5 shrink-0 text-text-muted" />}
                <span className="min-w-0 truncate">{entry.name}</span>
                {status && <StatusLetter status={status} />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
