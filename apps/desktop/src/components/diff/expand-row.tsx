import { Spinner } from '../icons/spinner';
import { ExpandDownIcon, ExpandUpIcon } from '../ui/icon';

interface ExpandRowProps {
  position: 'top' | 'bottom';
  remainingLines: number;
  loading: boolean;
  onExpand: (dir: 'up' | 'down' | 'all') => void;
}

const gutterCell = 'w-[25px] min-w-[25px] bg-diff-hunk-bg border-r border-border-muted p-0';
const expandBtn = 'flex items-center justify-center w-full h-6 cursor-pointer text-diff-hunk-text/70 hover:text-diff-hunk-text transition-colors';
const expandRowClass = 'bg-diff-hunk-bg';

export function ExpandRow(props: ExpandRowProps) {
  const { position, remainingLines, loading, onExpand } = props;

  if (remainingLines <= 0) {
    return null;
  }

  return (
    <tr className={expandRowClass}>
      {loading ? (
        <td className={gutterCell}>
          <div className="flex items-center justify-center h-6">
            <Spinner />
          </div>
        </td>
      ) : (
        <td className={gutterCell}>
          <button
            className={expandBtn}
            onClick={() => onExpand('down')}
            title={`Expand ${Math.min(remainingLines, 20)} lines`}
          >
            {position === 'bottom' ? <ExpandDownIcon /> : <ExpandUpIcon />}
          </button>
        </td>
      )}
      <td colSpan={3} className="px-3 py-0.5 text-[11px] text-diff-hunk-text/80 select-none">
        {Number.isFinite(remainingLines) && `${remainingLines} unmodified line${remainingLines === 1 ? '' : 's'}`}
      </td>
    </tr>
  );
}
