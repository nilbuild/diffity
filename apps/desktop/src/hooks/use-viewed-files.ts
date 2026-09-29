import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ParsedDiff, DiffFile } from '@diffity/parser';
import { toast } from 'sonner';
import * as tauri from '../lib/tauri';
import { hashString } from '../lib/hash';
import { getFilePath } from '../lib/diff-utils';

function fileHash(file: DiffFile): string {
  const parts: string[] = [file.status, file.oldPath, file.newPath];
  for (const hunk of file.hunks) {
    parts.push(hunk.header);
    for (const line of hunk.lines) {
      parts.push(line.type, line.content);
    }
  }
  return hashString(parts.join('\n'));
}

export function useViewedFiles(sessionId: string | null, diff: ParsedDiff | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ['viewed', sessionId];
  const { data: viewed } = useQuery({
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

  const reviewedFiles = useMemo(() => {
    const set = new Set<string>();
    for (const entry of viewed ?? []) {
      if (hashes.get(entry.filePath) === entry.contentHash) {
        set.add(entry.filePath);
      }
    }
    return set;
  }, [viewed, hashes]);

  const setReviewed = useCallback((path: string, reviewed: boolean) => {
    if (!sessionId) {
      return;
    }
    const contentHash = hashes.get(path) ?? '';
    queryClient.setQueryData<{ filePath: string; contentHash: string }[]>(['viewed', sessionId], (prev) => {
      const rest = (prev ?? []).filter((entry) => entry.filePath !== path);
      return reviewed ? [...rest, { filePath: path, contentHash }] : rest;
    });
    tauri.setViewed(sessionId, path, contentHash, reviewed).catch((error) => {
      toast.error(tauri.errorMessage(error));
      queryClient.invalidateQueries({ queryKey: ['viewed', sessionId] });
    });
  }, [sessionId, hashes, queryClient]);

  return { reviewedFiles, setReviewed };
}
