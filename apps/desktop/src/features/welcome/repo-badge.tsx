import { cn } from '../../lib/cn';

export function repoInitials(name: string) {
  const parts = name.split(/[-_.\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function RepoBadge(props: { name: string; className?: string }) {
  const { name, className } = props;
  return (
    <span
      aria-hidden
      className={cn('inline-flex items-center justify-center shrink-0 font-semibold bg-fill text-text-secondary', className)}
    >
      {repoInitials(name)}
    </span>
  );
}
