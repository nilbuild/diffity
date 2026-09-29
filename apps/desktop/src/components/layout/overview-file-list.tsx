import type { OverviewFile } from '../../lib/api';

interface OverviewFileListProps {
  files: OverviewFile[];
  onViewAll: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  staged: 'text-added',
  modified: 'text-changed',
  added: 'text-added',
};

const STATUS_LABELS: Record<string, string> = {
  staged: 'S',
  modified: 'M',
  added: 'A',
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
          <h3 className="font-medium text-text">Changed files</h3>
          <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-bg-tertiary text-text-secondary">
            {files.length}
          </span>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs font-medium text-accent hover:text-accent/80 transition-colors"
        >
          View diff
        </button>
      </div>
      <ul className="divide-y divide-border">
        {files.map((file) => (
          <li key={file.path} className="flex items-center gap-3 px-4 py-2">
            <span className={`text-xs font-mono font-bold w-4 shrink-0 ${STATUS_COLORS[file.status]}`}>
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
