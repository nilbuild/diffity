import { Dashboard } from '../components/layout/dashboard';
import { useRepoNav } from '../hooks/use-repo';

export function OverviewRoute() {
  const nav = useRepoNav();

  return <Dashboard key={nav.repoPath} onNavigate={nav.toDiff} />;
}
