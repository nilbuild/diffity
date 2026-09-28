import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parsePatch, type ParsedFileDiff } from '@/components/diff-surface';
import { hashString } from '@/lib/hash';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { DiffFileSummary, DiffResult } from '@/lib/types';
import { useViewStore } from '@/features/workspace/view-store';
import { useWorkspace } from '@/features/workspace/workspace-context';

export interface DiffEntry {
  summary: DiffFileSummary;
  fileDiff: ParsedFileDiff | null;
  changedLines: number;
}

export interface DiffData {
  result: DiffResult | undefined;
  entries: DiffEntry[];
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

export function useDiffData(): DiffData {
  const { repoPath, ref } = useWorkspace();
  const hideWhitespace = useViewStore((s) => s.hideWhitespace);
  const query = useQuery({
    queryKey: queryKeys.diff(repoPath, ref, hideWhitespace),
    queryFn: () => api.getDiff(repoPath, ref, hideWhitespace),
    staleTime: Infinity,
  });

  const entries = useMemo(() => {
    const data = query.data;
    if (!data) {
      return [];
    }
    const parsed = parsePatch(data.patch, `${data.fingerprint}:${hideWhitespace ? 'w' : ''}`);
    return data.files.map((summary) => ({
      summary,
      fileDiff: parsed.get(summary.path) ?? null,
      changedLines: summary.additions + summary.deletions,
    }));
  }, [query.data, hideWhitespace]);

  return {
    result: query.data,
    entries,
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}

export function contentHash(entry: DiffEntry): string {
  const diff = entry.fileDiff;
  if (!diff) {
    return `${entry.summary.status}:${entry.summary.additions}:${entry.summary.deletions}`;
  }
  let text = `${diff.prevObjectId ?? ''}:${diff.newObjectId ?? ''}:`;
  for (const hunk of diff.hunks) {
    text += hunk.hunkSpecs ?? '';
  }
  text += `${entry.summary.additions}:${entry.summary.deletions}`;
  return hashString(text);
}
