import { forwardRef, useImperativeHandle, useRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useAutoGrow } from '../../hooks/use-auto-grow';

interface GrowingTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  /** The tallest it grows, in pixels, before it scrolls. */
  growTo: number;
}

/** A textarea that grows with its text instead of showing a drag handle. */
export const GrowingTextarea = forwardRef<HTMLTextAreaElement, GrowingTextareaProps>(function GrowingTextarea(props, ref) {
  const { growTo, className, ...rest } = props;
  const innerRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);
  useAutoGrow(innerRef, rest.value, growTo);

  return <textarea ref={innerRef} {...rest} className={cn(className, 'resize-none')} />;
});
