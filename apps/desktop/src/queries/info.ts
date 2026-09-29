import { queryOptions } from '@tanstack/react-query';
import { fetchRepoInfo } from '../lib/api';

export function repoInfoOptions(ref?: string) {
  return queryOptions({
    queryKey: ['repo-info', ref],
    queryFn: () => fetchRepoInfo(ref),
  });
}
