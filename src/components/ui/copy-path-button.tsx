import { useCopy } from '../../hooks/use-copy';
import { cn } from '../../lib/cn';
import { CheckIcon, CopyIcon } from './icon';

interface CopyPathButtonProps {
  path: string;
  className?: string;
}

export function CopyPathButton(props: CopyPathButtonProps) {
  const { path, className } = props;
  const { copied, copy } = useCopy();

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        copy(path);
      }}
      className={cn(
        'w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-md text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer',
        className
      )}
      title={copied ? 'Copied!' : 'Copy path'}
      aria-label={copied ? 'Copied path' : 'Copy path'}
    >
      {copied ? <CheckIcon size="sm" className="text-added" /> : <CopyIcon size="sm" />}
    </button>
  );
}
