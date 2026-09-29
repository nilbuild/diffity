import { SegmentedToggle } from '../ui/segmented-toggle';
import { useRepoNav } from '../../hooks/use-repo';

type Page = 'diff' | 'tree' | 'overview';

interface PageSwitcherProps {
  current: Page;
}

const PAGES: { value: Page; label: string }[] = [
  { value: 'diff', label: 'Changes' },
  { value: 'tree', label: 'Files' },
];

export function PageSwitcher(props: PageSwitcherProps) {
  const { current } = props;
  const nav = useRepoNav();

  return (
    <div className="shrink-0">
    <SegmentedToggle
      options={PAGES}
      value={current}
      onChange={(value) => {
        if (value === 'diff') {
          nav.toDiff('work');
          return;
        }
        if (current !== 'tree') {
          nav.toTree();
        }
      }}
    />
    </div>
  );
}
