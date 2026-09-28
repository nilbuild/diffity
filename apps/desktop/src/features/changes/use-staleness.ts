import { useEffect, useState } from 'react';
import * as api from '@/lib/api';
import { useRepoEvents } from '@/features/workspace/repo-events';
import { useWorkspace } from '@/features/workspace/workspace-context';

export function useDiffStaleness(fingerprint: string | undefined): boolean {
  const { repoPath, ref } = useWorkspace();
  const changeCount = useRepoEvents((s) => s.changeCount);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    setLatest(null);
  }, [fingerprint]);

  useEffect(() => {
    if (changeCount === 0 || !fingerprint) {
      return;
    }
    let cancelled = false;
    api
      .diffFingerprint(repoPath, ref)
      .then((value) => {
        if (cancelled) {
          return;
        }
        setLatest(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [changeCount, repoPath, ref, fingerprint]);

  return latest !== null && fingerprint !== undefined && latest !== fingerprint;
}
