import { useCallback, useEffect, useRef, useState } from 'react';
import { splitCharsPerSide, splitFits } from '../lib/split-room';
import { useTypography } from '../lib/typography';

let canvas: HTMLCanvasElement | null = null;

function measureCharWidth(codeSize: number): number {
  canvas ??= document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return codeSize * 0.6;
  }
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim() || 'monospace';
  context.font = `${codeSize}px ${family}`;
  return context.measureText('0'.repeat(20)).width / 20;
}

/**
 * Whether the diff column (attach `ref`) is wide enough for split view at the current code font. Measured on attach,
 * so the first paint already uses the right layout, then on every resize.
 */
export function useSplitRoom(): { ref: (node: HTMLElement | null) => void; fits: boolean } {
  const codeSize = useTypography((state) => state.codeSize);
  const codeFont = useTypography((state) => state.codeFont);
  const [fits, setFits] = useState(true);
  const fitsRef = useRef<boolean | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  const charWidthRef = useRef(0);
  const observerRef = useRef<ResizeObserver | null>(null);

  const evaluate = useCallback((width: number) => {
    if (width <= 0) {
      return;
    }
    const next = splitFits(fitsRef.current, splitCharsPerSide(width, codeSize, charWidthRef.current));
    fitsRef.current = next;
    setFits(next);
  }, [codeSize]);

  useEffect(() => {
    charWidthRef.current = measureCharWidth(codeSize);
    if (nodeRef.current) {
      evaluate(nodeRef.current.clientWidth);
    }
  }, [codeSize, codeFont, evaluate]);

  const ref = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    nodeRef.current = node;
    if (!node) {
      return;
    }
    if (charWidthRef.current === 0) {
      charWidthRef.current = measureCharWidth(codeSize);
    }
    evaluate(node.clientWidth);
    const observer = new ResizeObserver((entries) => {
      evaluate(entries[0]?.contentRect.width ?? node.clientWidth);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, [codeSize, evaluate]);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, fits };
}
