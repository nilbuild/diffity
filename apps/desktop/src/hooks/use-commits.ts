import { useQuery } from '@tanstack/react-query';
import { commitsOptions } from '../queries/commits';

export function useCommits() {
  const { data, isLoading, error } = useQuery(commitsOptions());

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
