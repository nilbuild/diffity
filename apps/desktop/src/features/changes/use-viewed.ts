import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryClient, queryKeys } from '@/lib/query';
import type { ViewedFile } from '@/lib/types';

export function useViewed(sessionId: string | null) {
  const query = useQuery({
    queryKey: queryKeys.viewed(sessionId ?? ''),
    queryFn: () => api.listViewed(sessionId ?? ''),
    enabled: sessionId !== null,
  });

  const mutation = useMutation({
    mutationFn: (input: { filePath: string; contentHash: string; viewed: boolean }) =>
      api.setViewed(sessionId ?? '', input.filePath, input.contentHash, input.viewed),
    onMutate: (input) => {
      const key = queryKeys.viewed(sessionId ?? '');
      const previous = queryClient.getQueryData<ViewedFile[]>(key) ?? [];
      const next = previous.filter((v) => v.filePath !== input.filePath);
      if (input.viewed) {
        next.push({ filePath: input.filePath, contentHash: input.contentHash });
      }
      queryClient.setQueryData(key, next);
      return { previous };
    },
    onError: (error, _input, context) => {
      queryClient.setQueryData(queryKeys.viewed(sessionId ?? ''), context?.previous);
      toast.error(api.errorMessage(error));
    },
  });

  const viewedMap = new Map((query.data ?? []).map((v) => [v.filePath, v.contentHash]));
  return { viewedMap, setViewed: mutation.mutate };
}
