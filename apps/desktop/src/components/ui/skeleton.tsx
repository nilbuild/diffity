import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  circle?: boolean;
}

/**
 * A fixed-size loading placeholder. It stays invisible for the first 150ms, so loads that finish quickly never
 * flash, then shows a quiet shimmer (static with reduced motion). Give it the size of what it stands in for.
 */
export function Skeleton(props: SkeletonProps) {
  const { className, style, circle } = props;

  return (
    <span
      data-skeleton
      aria-hidden
      className={cn('skeleton block shrink-0', circle ? 'rounded-full' : 'rounded', className)}
      style={style}
    />
  );
}

/**
 * Class for content that may replace a placeholder: it cross-fades in only when this component actually showed a
 * placeholder first. Content available at once (from the cache) renders without any animation.
 */
export function useRevealClass(loading: boolean): string {
  const waited = useRef(loading);
  if (loading) {
    waited.current = true;
  }
  return !loading && waited.current ? 'reveal' : '';
}

/** True once `ms` have passed since mount (a budget for slow, optional inputs such as GitHub lookups). */
export function useElapsed(ms: number): boolean {
  const [mountedAt] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setElapsed(true), Math.max(0, ms - (Date.now() - mountedAt)));
    return () => clearTimeout(timer);
  }, [ms, mountedAt]);
  return elapsed;
}

/** Stays true once `value` has been true: a decision that is made once and not taken back by a refetch. */
export function useLatch(value: boolean): boolean {
  const latched = useRef(value);
  if (value) {
    latched.current = true;
  }
  return latched.current;
}
