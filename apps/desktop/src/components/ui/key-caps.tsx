import { cn } from '../../lib/cn';

interface KeyCapsProps {
  keys: string[];
  /** "J or K" between alternatives; nothing between the caps of one gesture. */
  join?: 'or' | 'none';
  className?: string;
}

/** Decorative: the label beside the caps is what a screen reader reads. */
export function KeyCaps(props: KeyCapsProps) {
  const { keys, join = 'or', className } = props;

  return (
    <span className={cn('flex flex-none items-center gap-1 text-[11px] text-text-muted', className)} aria-hidden="true">
      {keys.map((key, index) => (
        <span key={key} className="flex items-center gap-1">
          {index > 0 && join === 'or' && <span>or</span>}
          <kbd className="rounded-[4px] bg-fill px-1.5 py-[3px] font-sans text-[11px] leading-none text-text-secondary">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}
