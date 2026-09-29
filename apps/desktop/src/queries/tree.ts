import { queryOptions } from '@tanstack/react-query';
import { fetchTreePaths, fetchTreeEntries, fetchTreeInfo, fetchTreeFileContent } from '../lib/api';

export function treePathsOptions() {
  return queryOptions({
    queryKey: ['tree-paths'],
    queryFn: () => fetchTreePaths(),
    staleTime: 60_000,
  });
}

export function treeEntriesOptions(dirPath?: string) {
  return queryOptions({
    queryKey: ['tree-entries', dirPath ?? null],
    queryFn: () => fetchTreeEntries(dirPath),
    staleTime: 30_000,
  });
}

export function treeInfoOptions() {
  return queryOptions({
    queryKey: ['tree-info'],
    queryFn: () => fetchTreeInfo(),
    staleTime: 60_000,
  });
}

export function treeFileContentOptions(filePath: string) {
  return queryOptions({
    queryKey: ['tree-file-content', filePath],
    queryFn: () => fetchTreeFileContent(filePath),
    staleTime: 30_000,
  });
}
