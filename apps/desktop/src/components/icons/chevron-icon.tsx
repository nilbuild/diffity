import { cn } from '../../lib/cn';

interface ChevronIconProps {
  expanded: boolean;
}

export function ChevronIcon(props: ChevronIconProps) {
  return (
    <svg
      className={cn(
        'w-3 h-3 shrink-0 text-text-muted transition-transform duration-150',
        props.expanded && 'rotate-90'
      )}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
    </svg>
  );
}
