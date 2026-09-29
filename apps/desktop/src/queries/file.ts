import { queryOptions } from '@tanstack/react-query';
import { fetchFileContent, fetchFileVersions } from '../lib/api';

export function fileContentOptions(filePath: string, enabled: boolean, ref?: string) {
  return queryOptions({
    queryKey: ['file-content', filePath, ref],
    queryFn: () => fetchFileContent(filePath, ref),
    enabled,
  });
}

export function fileVersionsOptions(filePath: string, oldPath: string | undefined, ref?: string) {
  return queryOptions({
    queryKey: ['file-versions', filePath, oldPath ?? null, ref ?? null],
    queryFn: () => fetchFileVersions(filePath, oldPath, ref),
  });
}
