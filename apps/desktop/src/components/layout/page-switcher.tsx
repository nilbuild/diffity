import { cn } from '../../lib/cn';
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

  const go = (value: Page) => {
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
  };

  return (
    <nav className="flex items-center gap-0.5 shrink-0" aria-label="Pages">
      {PAGES.map((page) => {
        const active = page.value === current;
        return (
          <button
            key={page.value}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'h-7 px-2.5 rounded-md text-[13px] transition-colors cursor-pointer',
              active ? 'bg-active text-text font-medium' : 'text-text-secondary hover:text-text hover:bg-hover',
            )}
            onClick={() => go(page.value)}
          >
            {page.label}
          </button>
        );
      })}
    </nav>
  );
}
