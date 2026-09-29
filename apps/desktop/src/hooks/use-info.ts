import { useSuspenseQuery } from '@tanstack/react-query';
import { repoInfoOptions } from '../queries/info';

export function useInfo(ref?: string) {
  const { data, error } = useSuspenseQuery(repoInfoOptions(ref));

  return {
    data,
    error: error?.message ?? null,
  };
}
