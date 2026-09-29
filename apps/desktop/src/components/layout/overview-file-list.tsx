import type { OverviewFile } from '../../lib/api';

interface OverviewFileListProps {
  files: OverviewFile[];
  onViewAll: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  staged: 'text-added',
  modified: 'text-modified',
  added: 'text-added',
};

const STATUS_LABELS: Record<string, string> = {
  staged: 'S',
  modified: 'M',
  added: 'A',
};

const STATUS_TITLES: Record<string, string> = {
  staged: 'Staged',
  modified: 'Modified, not staged',
  added: 'New file, not tracked yet',
};

export function OverviewFileList(props: OverviewFileListProps) {
  const { files, onViewAll } = props;

  if (files.length === 0) {
    return null;
  }

  return (
    <div className="border border-border rounded-lg bg-bg-secondary overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-text">Uncommitted files</h3>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bg-tertiary text-text-secondary">
            {files.length}
          </span>
        </div>
        <button
          onClick={onViewAll}
          className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
        >
          Review changes
        </button>
      </div>
      <ul className="divide-y divide-border max-h-72 overflow-y-auto">
        {files.map((file) => (
          <li key={file.path} className="flex items-center gap-3 px-4 py-2">
            <span className={`text-xs font-mono font-bold w-4 shrink-0 ${STATUS_COLORS[file.status]}`} title={STATUS_TITLES[file.status]}>
              {STATUS_LABELS[file.status]}
            </span>
            <span className="text-sm font-mono text-text-secondary truncate">
              {file.path}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
