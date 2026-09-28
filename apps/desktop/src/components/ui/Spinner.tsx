import { cn } from '@/lib/cn';

export function Spinner(props: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-3.5 animate-spin rounded-full border-2 border-fg-subtle/40 border-t-fg-muted', props.className)}
    />
  );
}
