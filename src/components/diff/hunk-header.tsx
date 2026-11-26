import type { DiffHunk } from '@/lib/diff-parser';
import { Spinner } from '../icons/spinner';
import { ExpandBothIcon, ExpandDownIcon, ExpandUpIcon } from '../ui/icon';

export interface ExpandControls {
  position: 'top' | 'between' | 'bottom';
  remainingLines: number;
  remainingUp: number;
  remainingDown: number;
  loadingDirection: 'up' | 'down' | 'all' | null;
  wasExpanded: boolean;
  onExpand: (direction: 'up' | 'down' | 'all') => void;
}

interface HunkHeaderProps {
  hunk: DiffHunk;
  expandControls?: ExpandControls;
}

export function formatHunkHeader(hunk: DiffHunk): string {
  const range = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
  if (hunk.context) {
    return `${range} ${hunk.context}`;
  }
  return range;
}

/** The single hunk of an added or deleted file: its `@@ -0,0 +1,N @@` header says nothing the card doesn't. */
export function isWholeFileHunk(hunk: DiffHunk): boolean {
  return (hunk.oldStart === 0 && hunk.oldCount === 0) || (hunk.newStart === 0 && hunk.newCount === 0);
}

export function expandLabel(lines: number, all = false): string {
  const count = Math.min(lines, all ? lines : 20);
  if (count === 1) {
    return 'Expand 1 line';
  }
  return `Expand ${all ? 'all ' : ''}${count} lines`;
}

const SMALL_GAP_THRESHOLD = 40;

const gutterCell = 'w-[25px] min-w-[25px] bg-diff-hunk-bg border-r border-border-muted p-0';
const expandBtn = 'flex items-center justify-center w-full h-6 cursor-pointer text-diff-hunk-text/70 hover:text-diff-hunk-text transition-colors';
const expandRow = 'bg-diff-hunk-bg';

function SpinnerCell() {
  return (
    <td className={gutterCell}>
      <div className="flex items-center justify-center h-6">
        <Spinner />
      </div>
    </td>
  );
}

export function HunkHeader(props: HunkHeaderProps) {
  const { hunk, expandControls } = props;

  if (!expandControls && (!hunk.header || isWholeFileHunk(hunk))) {
    return null;
  }
  if (!expandControls) {
    return (
      <tr className="bg-diff-hunk-bg group/hunk">
        <td colSpan={4} className="px-3 py-0.5 code-text text-diff-hunk-text select-none">
          {formatHunkHeader(hunk)}
        </td>
      </tr>
    );
  }

  const { position, remainingLines, remainingUp, remainingDown, loadingDirection, wasExpanded, onExpand } = expandControls;

  if (remainingLines <= 0) {
    if (wasExpanded) {
      return null;
    }
    return (
      <tr className="bg-diff-hunk-bg group/hunk">
        <td colSpan={4} className="px-3 py-0.5 code-text text-diff-hunk-text select-none">
          {formatHunkHeader(hunk)}
        </td>
      </tr>
    );
  }

  const isSmallGap = remainingLines <= SMALL_GAP_THRESHOLD;
  const showUp = remainingUp > 0;
  const showDown = remainingDown > 0;

  if (position === 'top') {
    return (
      <tr className="bg-diff-hunk-bg group/hunk">
        {loadingDirection ? <SpinnerCell /> : (
          <td className={gutterCell}>
            <button className={expandBtn} onClick={() => onExpand('up')} title={expandLabel(remainingLines)}>
              <ExpandUpIcon />
            </button>
          </td>
        )}
        <td colSpan={3} className="px-3 py-0.5 code-text text-diff-hunk-text select-none">
          {formatHunkHeader(hunk)}
        </td>
      </tr>
    );
  }

  if (isSmallGap || (!showUp && showDown) || (showUp && !showDown)) {
    return (
      <tr className="bg-diff-hunk-bg group/hunk">
        {loadingDirection ? <SpinnerCell /> : (
          <td className={gutterCell}>
            <button
              className={expandBtn}
              onClick={() => onExpand(isSmallGap ? 'all' : showUp ? 'up' : 'down')}
              title={expandLabel(remainingLines, isSmallGap)}
            >
              {isSmallGap ? <ExpandBothIcon /> : showUp ? <ExpandUpIcon /> : <ExpandDownIcon />}
            </button>
          </td>
        )}
        <td colSpan={3} className="px-3 py-0.5 code-text text-diff-hunk-text select-none">
          {formatHunkHeader(hunk)}
        </td>
      </tr>
    );
  }

  return (
    <>
      <tr className={expandRow}>
        {loadingDirection === 'down' ? <SpinnerCell /> : (
          <td className={gutterCell}>
            <button className={expandBtn} onClick={() => onExpand('down')} title="Expand down">
              <ExpandDownIcon />
            </button>
          </td>
        )}
        <td colSpan={3} />
      </tr>
      <tr className="bg-diff-hunk-bg group/hunk">
        <td className={gutterCell} />
        <td colSpan={3} className="px-3 py-0.5 code-text text-diff-hunk-text select-none">
          {formatHunkHeader(hunk)}
        </td>
      </tr>
      <tr className={expandRow}>
        {loadingDirection === 'up' ? <SpinnerCell /> : (
          <td className={gutterCell}>
            <button className={expandBtn} onClick={() => onExpand('up')} title="Expand up">
              <ExpandUpIcon />
            </button>
          </td>
        )}
        <td colSpan={3} />
      </tr>
    </>
  );
}
