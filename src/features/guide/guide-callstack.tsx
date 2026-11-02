import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';
import type { GuideCall } from '../../lib/types';
import { MarkdownContent } from '../../components/layout/markdown-content';
import { linkRefs, refLabel, useGuideRefs } from './guide-refs';
import { StepControls, useStepper } from './guide-stepper';

/** Another row at `depth` comes before the stack climbs above it, so the branch at that depth continues. */
function continues(rows: GuideCall[], from: number, depth: number): boolean {
  for (let j = from + 1; j < rows.length; j++) {
    if (rows[j].depth < depth) {
      return false;
    }
    if (rows[j].depth === depth) {
      return true;
    }
  }
  return false;
}

/** The tree drawing in front of a row: `│  ` for each open branch above it, then `├─ ` or `└─ `. */
export function treePrefix(rows: GuideCall[], index: number): string {
  const depth = rows[index].depth;
  if (depth === 0) {
    return '';
  }
  let prefix = '';
  for (let level = 1; level < depth; level++) {
    prefix += continues(rows, index, level) ? '│  ' : '   ';
  }
  return prefix + (continues(rows, index, depth) ? '├─ ' : '└─ ');
}

const changeMark: Record<GuideCall['change'], string> = { added: '+', removed: '−', same: ' ' };

/**
 * A chapter's calls in the order they run. A click on a row, or stepping with the arrows or Play, marks the row and
 * opens its line in the diff, so the reader follows the code one call at a time.
 */
export function GuideCallStack(props: { rows: GuideCall[]; compact?: boolean }) {
  const { rows, compact = false } = props;
  const refs = useGuideRefs();
  const listRef = useRef<HTMLDivElement>(null);
  const stepper = useStepper(rows.length, (index) => {
    const row = rows[index];
    if (row.path) {
      refs?.open({ path: row.path, line: row.line, side: row.side });
    }
  });
  const { active } = stepper;

  useEffect(() => {
    if (active === null) {
      return;
    }
    listRef.current?.querySelector(`[data-call-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const why = active !== null ? rows[active]?.why : undefined;

  return (
    <section
      tabIndex={0}
      aria-label="Call order"
      onKeyDown={stepper.onKeyDown}
      className="mt-4 rounded-lg border border-border bg-bg outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      <div className="flex items-center gap-1 pl-3 pr-1.5 h-8 border-b border-border-muted">
        <span className="text-xs font-medium text-text-secondary">How it runs</span>
        <span className="flex-1" />
        <StepControls stepper={stepper} count={rows.length} idleLabel={`${rows.length} calls`} noun="call" />
      </div>
      <div ref={listRef} className="py-1 overflow-x-auto">
        {rows.map((row, index) => (
          <button
            key={index}
            type="button"
            data-call-index={index}
            onClick={() => stepper.select(index)}
            title={row.path ? `${row.call}\n${row.path}${row.line ? `:${row.line}` : ''}` : row.call}
            className={cn(
              'flex items-center w-full min-w-max pr-3 text-left font-mono whitespace-pre cursor-pointer transition-colors outline-none border-l-2',
              compact ? 'h-[22px] text-[11px]' : 'h-6 text-xs',
              index === active ? 'bg-claude/15 border-claude' : 'border-transparent hover:bg-hover focus-visible:bg-hover',
            )}
          >
            <span className={cn('w-4 shrink-0 text-center', row.change === 'added' ? 'text-added' : row.change === 'removed' ? 'text-deleted' : 'text-text-muted')}>{changeMark[row.change]}</span>
            <span className="text-text-muted">{treePrefix(rows, index)}</span>
            <span className={cn(row.change === 'removed' ? 'text-text-muted line-through decoration-deleted/60' : 'text-text', index === active && 'font-medium')}>{row.call}</span>
            {row.path && !compact && <span className="ml-2 text-[10px] text-text-muted">{refLabel({ path: row.path, line: row.line, side: row.side })}</span>}
          </button>
        ))}
      </div>
      {why && (
        <div className="px-3 py-2 border-t border-border-muted text-[12px] leading-[18px] text-text select-text [&_p]:m-0">
          <MarkdownContent content={linkRefs(why)} />
        </div>
      )}
    </section>
  );
}
