import { useRepoNav } from '../../hooks/use-repo';
import { cn } from '../../lib/cn';
import { FileDiff, FolderTree, History, type LucideIcon } from 'lucide-react';

export type RepoView = 'diff' | 'tree' | 'overview';

const TABS: { value: RepoView; label: string; icon: LucideIcon }[] = [
  { value: 'diff', label: 'Changes', icon: FileDiff },
  { value: 'tree', label: 'Files', icon: FolderTree },
  { value: 'overview', label: 'History', icon: History },
];

export function ViewTabs(props: { current: RepoView; vertical?: boolean }) {
  const { current, vertical = false } = props;
  const nav = useRepoNav();

  const go = (view: RepoView) => {
    if (view === current && view !== 'diff') {
      return;
    }
    if (view === 'diff') {
      nav.toDiff('work');
      return;
    }
    if (view === 'tree') {
      nav.toTree();
      return;
    }
    nav.toOverview();
  };

  if (vertical) {
    return (
      <nav className="flex flex-col items-center gap-1" aria-label="Views">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.value === current;
          return (
            <button
              key={tab.value}
              onClick={() => go(tab.value)}
              aria-current={active ? 'page' : undefined}
              title={tab.label}
              className={cn(
                'w-7 h-7 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer',
                active ? 'bg-active text-text' : 'text-text-secondary hover:text-text hover:bg-hover',
              )}
            >
              <Icon size={16} strokeWidth={1.75} />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1 px-2 pt-2 pb-1 shrink-0" aria-label="Views">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.value === current;
        return (
          <button
            key={tab.value}
            onClick={() => go(tab.value)}
            aria-current={active ? 'page' : undefined}
            title={tab.label}
            className={cn(
              'flex flex-1 min-w-0 items-center justify-center gap-1.5 h-8 px-2 rounded-md text-[13px] transition-colors cursor-pointer',
              active ? 'bg-active text-text font-medium' : 'text-text-secondary hover:text-text hover:bg-hover',
            )}
          >
            <Icon size={15} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
