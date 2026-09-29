import { useRepoNav } from '../../hooks/use-repo';
import { cn } from '../../lib/cn';
import { FileTextIcon, FolderSimpleIcon, HistoryIcon, type GlyphProps } from '../ui/icon';
import type { ComponentType } from 'react';

export type RepoView = 'diff' | 'tree' | 'overview';

const TABS: { value: RepoView; label: string; hint: string; icon: ComponentType<GlyphProps> }[] = [
  { value: 'diff', label: 'Changes', hint: 'Uncommitted changes', icon: FileTextIcon },
  { value: 'tree', label: 'Files', hint: 'Browse and comment on any file', icon: FolderSimpleIcon },
  { value: 'overview', label: 'History', hint: 'Commits, branches and comparisons', icon: HistoryIcon },
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
              title={tab.hint}
              className={cn(
                'w-8 h-8 inline-flex items-center justify-center rounded-md transition-colors cursor-pointer',
                active ? 'bg-active text-text' : 'text-text-secondary hover:text-text hover:bg-hover',
              )}
            >
              <Icon size="md" />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-0.5 mx-3 mt-3 mb-2 p-0.5 rounded-lg bg-fill shrink-0" aria-label="Views">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.value === current;
        return (
          <button
            key={tab.value}
            onClick={() => go(tab.value)}
            aria-current={active ? 'page' : undefined}
            title={tab.hint}
            className={cn(
              'flex flex-1 min-w-0 items-center justify-center gap-1.5 h-7 px-2 rounded-md text-[13px] transition-colors cursor-pointer',
              active ? 'bg-raised text-text font-medium ring-1 ring-control-border' : 'text-text-secondary hover:text-text',
            )}
          >
            <Icon size="sm" className={active ? 'text-text' : 'text-text-muted'} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
