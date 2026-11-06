import { useRepoNav } from '../../hooks/use-repo';
import { cn } from '../../lib/cn';
import { segmentActive, segmentInactive } from '../ui/button-styles';
import { BookIcon, ChangesIcon, FilesIcon, type GlyphProps } from '../ui/icon';
import type { ComponentType } from 'react';

/** `guide` is the diff page reading the change chapter by chapter. */
export type RepoView = 'diff' | 'guide' | 'tree' | 'overview';

const TABS: { value: RepoView; label: string; hint: string; icon: ComponentType<GlyphProps> }[] = [
  { value: 'tree', label: 'Files', hint: 'Browse and comment on any file', icon: FilesIcon },
  { value: 'diff', label: 'Diff', hint: 'Every changed file (G toggles the guide)', icon: ChangesIcon },
  { value: 'guide', label: 'Guide', hint: 'The change chapter by chapter, explained by an agent (G)', icon: BookIcon },
];

/** The same tabs on every page, so switching views never shifts them. */
export function ViewTabs(props: { current: RepoView; disabled?: Partial<Record<RepoView, string>>; vertical?: boolean }) {
  const { current, disabled, vertical = false } = props;
  const nav = useRepoNav();

  const go = (view: RepoView) => {
    if (view === current || disabled?.[view]) {
      return;
    }
    if (view === 'diff' || view === 'guide') {
      nav.toLastDiff(view === 'guide' ? 'guide' : 'files');
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
          const off = disabled?.[tab.value];
          return (
            <button
              key={tab.value}
              onClick={() => go(tab.value)}
              aria-current={active ? 'page' : undefined}
              aria-disabled={off ? true : undefined}
              title={off ?? tab.hint}
              className={cn(
                'w-8 h-8 inline-flex items-center justify-center rounded-md transition-colors',
                active && 'bg-active text-text cursor-pointer',
                !active && !off && 'text-text-secondary hover:text-text hover:bg-hover cursor-pointer',
                off && 'text-text-muted opacity-40 cursor-default',
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
        const off = disabled?.[tab.value];
        return (
          <button
            key={tab.value}
            onClick={() => go(tab.value)}
            aria-current={active ? 'page' : undefined}
            aria-disabled={off ? true : undefined}
            title={off ?? tab.hint}
            className={cn(
              'flex flex-1 basis-0 min-w-0 items-center justify-center gap-1.5 h-7 px-2 rounded-md text-[13px] transition-colors',
              active && cn(segmentActive, 'cursor-pointer'),
              !active && !off && cn(segmentInactive, 'cursor-pointer'),
              off && 'text-text-muted opacity-50 cursor-default',
            )}
          >
            <Icon size="md" className={active ? 'text-text' : 'text-text-muted'} />
            <span className="truncate">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
