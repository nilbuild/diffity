import { useSearchParams } from 'react-router';
import { DiffPage } from '../components/diff/diff-page';

export function DiffRoute() {
  const [params] = useSearchParams();
  const ref = params.get('ref') || 'work';

  return <DiffPage key={ref} diffRef={ref} />;
}
