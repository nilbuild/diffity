import { queryOptions } from '@tanstack/react-query';
import { fetchDiff } from '../lib/api';

export function diffOptions(hideWhitespace: boolean, ref?: string) {
  return queryOptions({
    queryKey: ['diff', hideWhitespace, ref ?? null],
    queryFn: () => fetchDiff(hideWhitespace, ref),
  });
}
