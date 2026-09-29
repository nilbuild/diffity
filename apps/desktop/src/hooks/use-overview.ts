import { useQuery } from '@tanstack/react-query';
import { overviewOptions } from '../queries/overview';

export function useOverview() {
  const { data, isLoading, error } = useQuery(overviewOptions());

  return {
    data: data ?? null,
    loading: isLoading,
    error: error?.message ?? null,
  };
}
