import { SegmentedToggle } from '../ui/segmented-toggle';
import { useRepoNav } from '../../hooks/use-repo';

type Page = 'diff' | 'tree' | 'overview';

interface PageSwitcherProps {
  current: Page;
}

const PAGES: { value: Page; label: string }[] = [
  { value: 'diff', label: 'Changes' },
  { value: 'tree', label: 'Files' },
  { value: 'overview', label: 'History' },
];

export function PageSwitcher(props: PageSwitcherProps) {
  const { current } = props;
  const nav = useRepoNav();

  return (
    <SegmentedToggle
      options={PAGES}
      value={current}
      onChange={(value) => {
        if (value === current && value !== 'diff') {
          return;
        }
        if (value === 'diff') {
          nav.toDiff('work');
          return;
        }
        if (value === 'overview') {
          nav.toOverview();
          return;
        }
        nav.toTree();
      }}
    />
  );
}
