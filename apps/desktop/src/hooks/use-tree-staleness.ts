import { useEffect, useRef, useState } from 'react';
import { fetchTreeFingerprint } from '../lib/api';
import { useRepoChange } from './use-repo';

export function useTreeStaleness() {
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
    let cancelled = false;
    fetchTreeFingerprint().then((fingerprint) => {
      if (!cancelled) {
        baselineRef.current = fingerprint;
      }
    }, () => undefined);
    return () => {
      cancelled = true;
    };
  }, [generation]);

  useEffect(() => {
    if (tick === 0) {
      return;
    }
    let cancelled = false;
    fetchTreeFingerprint().then((fingerprint) => {
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
  }, [tick]);

  return { isStale, resetStaleness };
}
