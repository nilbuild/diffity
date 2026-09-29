import { TreePage } from '../components/tree/tree-page';
import { useRepoPath } from '../hooks/use-repo';

export function TreeRoute() {
  const repoPath = useRepoPath();

  return <TreePage key={repoPath} />;
}
