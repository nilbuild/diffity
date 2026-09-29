import { useSearchParams } from 'react-router';
import { DiffPage } from '../components/diff/diff-page';
import { useRepoPath } from '../hooks/use-repo';

export function DiffRoute() {
  const [params] = useSearchParams();
  const ref = params.get('ref') || 'work';
  const repoPath = useRepoPath();

  return <DiffPage key={`${repoPath}\n${ref}`} diffRef={ref} />;
}
