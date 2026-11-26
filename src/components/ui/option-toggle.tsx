import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** A small on/off search option (Match case, Whole word, Regex), shared by code search and find. */
export function OptionToggle(props: { label: ReactNode; title: string; active: boolean; onToggle: () => void }) {
  const { label, title, active, onToggle } = props;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'w-7 h-[22px] shrink-0 inline-flex items-center justify-center rounded-[5px] border font-mono text-[11px] cursor-pointer transition-colors',
        active ? 'bg-accent/12 border-accent/40 text-accent' : 'border-transparent text-text-muted hover:bg-hover hover:text-text',
      )}
    >
      {label}
    </button>
  );
}
