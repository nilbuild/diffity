import { Dashboard } from '../components/layout/dashboard';
import { useRepoNav } from '../hooks/use-repo';

export function OverviewRoute() {
  const nav = useRepoNav();

  return <Dashboard onNavigate={nav.toDiff} />;
}
