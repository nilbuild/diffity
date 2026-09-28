import { cn } from '@/lib/cn';

export interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner(props: SpinnerProps) {
  const { size = 14, className } = props;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={cn('shrink-0 animate-spin', className)} aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
