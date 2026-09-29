import { useEffect, useRef, useState } from 'react';
import { fetchDiffFingerprint } from '../lib/api';
import { useRepoChange } from './use-repo';

export function useDiffStaleness(ref?: string, enabled = true) {
  const [isStale, setIsStale] = useState(false);
  const [generation, setGeneration] = useState(0);
  const baselineRef = useRef<string | null>(null);
  const tick = useRepoChange((state) => state.tick);

  function resetStaleness() {
    baselineRef.current = null;
    setIsStale(false);
    setGeneration((value) => value + 1);
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    baselineRef.current = null;
    fetchDiffFingerprint(ref).then((fingerprint) => {
      if (!cancelled && baselineRef.current === null) {
        baselineRef.current = fingerprint;
      }
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [ref, enabled, generation]);

  useEffect(() => {
    if (!enabled || tick === 0) {
      return;
    }
    let cancelled = false;
    fetchDiffFingerprint(ref).then((fingerprint) => {
      if (cancelled || baselineRef.current === null) {
        return;
      }
      if (fingerprint !== baselineRef.current) {
        setIsStale(true);
      }
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [tick, ref, enabled]);

  return { isStale, resetStaleness };
}
