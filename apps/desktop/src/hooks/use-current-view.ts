import { useLocation, useSearchParams } from 'react-router';
import { TREE_REF } from '../lib/types';

/** The ref of the view on screen: the diff ref, `__tree__` for the file browser, null elsewhere. */
export function useCurrentViewRef(): string | null {
  const location = useLocation();
  const [params] = useSearchParams();
  if (location.pathname.endsWith('/diff')) {
    return params.get('ref') || 'work';
  }
  if (location.pathname.endsWith('/tree')) {
    return TREE_REF;
  }
  return null;
}
