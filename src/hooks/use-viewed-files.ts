import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParsedDiff } from '@/lib/diff-parser';
import { toast } from 'sonner';
import * as tauri from '../lib/tauri';
import type { ViewedFile } from '../lib/types';
import { getFilePath } from '../lib/diff-utils';
import { computeViewedState, fileHash, isLegacyHash, legacyFileHash } from '../lib/viewed-state';

export function useViewedFiles(sessionId: string | null, diff: ParsedDiff | undefined, viewRef: string) {
  const queryClient = useQueryClient();
  const queryKey = ['viewed', sessionId];
  const { data: viewed, isPending, isError } = useQuery({
    queryKey,
    queryFn: () => tauri.listViewed(sessionId ?? ''),
    enabled: sessionId !== null,
  });

  const hashes = useMemo(() => {
    const map = new Map<string, string>();
    for (const file of diff?.files ?? []) {
      map.set(getFilePath(file), fileHash(file));
    }
    return map;
  }, [diff]);
  const legacy = useMemo(() => {
    const map = new Map<string, string>();
    if (!viewed?.some((entry) => isLegacyHash(entry.contentHash))) {
      return map;
    }
    for (const file of diff?.files ?? []) {
      map.set(getFilePath(file), legacyFileHash(file));
    }
    return map;
  }, [diff, viewed]);

  const { reviewed: reviewedFiles, changed: changedFiles, upgrade } = useMemo(() => computeViewedState(viewed ?? [], hashes, legacy), [viewed, hashes, legacy]);
  const upgraded = useRef(new Set<string>());

  useEffect(() => {
    if (!sessionId || upgrade.length === 0) {
      return;
    }
    for (const path of upgrade) {
      const key = `${sessionId}\u0000${path}`;
      const contentHash = hashes.get(path);
      if (upgraded.current.has(key) || !contentHash) {
        continue;
      }
      upgraded.current.add(key);
      queryClient.setQueryData<ViewedFile[]>(['viewed', sessionId], (prev) => (prev ?? []).map((entry) => (entry.filePath === path ? { ...entry, contentHash } : entry)));
      tauri.setViewed(sessionId, path, contentHash, true, viewRef).catch(() => undefined);
    }
  }, [sessionId, upgrade, hashes, queryClient, viewRef]);

  const setReviewed = useCallback((path: string, reviewed: boolean) => {
    if (!sessionId) {
      return;
    }
    const contentHash = hashes.get(path) ?? '';
    queryClient.setQueryData<ViewedFile[]>(['viewed', sessionId], (prev) => {
      const rest = (prev ?? []).filter((entry) => entry.filePath !== path);
      return reviewed ? [...rest, { filePath: path, contentHash, blobId: null }] : rest;
    });
    tauri.setViewed(sessionId, path, contentHash, reviewed, viewRef).then(
      () => {
        if (reviewed) {
          queryClient.invalidateQueries({ queryKey: ['viewed', sessionId] });
        }
      },
      (error) => {
        toast.error(tauri.errorMessage(error));
        queryClient.invalidateQueries({ queryKey: ['viewed', sessionId] });
      },
    );
  }, [sessionId, hashes, queryClient, viewRef]);

  return { reviewedFiles, changedFiles, hashes, setReviewed, loading: sessionId !== null && isPending && !isError };
}
