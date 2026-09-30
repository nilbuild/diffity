import { cn } from '../../lib/cn';
import { SpinnerIcon } from '../ui/icon';

export function Spinner(props: { className?: string; label?: string }) {
  const { className, label } = props;

  return (
    <SpinnerIcon
      title={label}
      className={cn(
        'w-3 h-3 text-text-muted animate-spin motion-reduce:[animation-duration:2.4s]',
        className,
      )}
    />
  );
}
