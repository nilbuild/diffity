import { forwardRef, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useAutoGrow } from '../../hooks/use-auto-grow';

interface GrowingTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  growTo: number;
}

export const GrowingTextarea = forwardRef<HTMLTextAreaElement, GrowingTextareaProps>(function GrowingTextarea(props, ref) {
  const { growTo, className, ...rest } = props;
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);
  useAutoGrow(innerRef, rest.value, growTo);

  return <textarea ref={innerRef} {...rest} className={cn(className, 'resize-none')} />;
});
