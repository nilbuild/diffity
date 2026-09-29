import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  className?: string;
}

export function IconButton(props: IconButtonProps) {
  const { children, className, ...rest } = props;

  return (
    <button
      className={cn(
        'flex items-center justify-center rounded text-text-muted hover:bg-hover hover:text-text cursor-pointer',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
