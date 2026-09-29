import { useCallback, useRef, useState } from 'react';
import { useRepoNav } from '../../hooks/use-repo';
import { useDismiss } from '../../hooks/use-dismiss';
import { ChevronDownIcon } from '../icons/chevron-down-icon';
import { CheckIcon } from '../icons/check-icon';
import { GitBranchIcon } from '../icons/git-branch-icon';
import { menuItemClass } from './options-menu';

interface RefMenuProps {
  diffRef: string;
  description: string;
}

const WORKING_REFS = [
  { ref: 'work', label: 'All changes' },
  { ref: 'staged', label: 'Staged changes' },
  { ref: 'unstaged', label: 'Unstaged changes' },
];

export function RefMenu(props: RefMenuProps) {
  const { diffRef, description } = props;
  const nav = useRepoNav();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  return (
    <div className="relative hidden lg:block min-w-0" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 max-w-full text-text-muted hover:text-text transition-colors cursor-pointer"
        title="Change what is compared"
      >
        <span className="truncate">{description}</span>
        <ChevronDownIcon className="w-3 h-3 shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-56 py-1 bg-bg-secondary rounded-md shadow-lg ring-1 ring-border z-50">
          {WORKING_REFS.map((item) => (
            <button
              key={item.ref}
              className={menuItemClass}
              onClick={() => {
                close();
                nav.toDiff(item.ref);
              }}
            >
              <span className="w-3.5 h-3.5 shrink-0">{diffRef === item.ref && <CheckIcon className="w-3.5 h-3.5 text-accent" />}</span>
              {item.label}
            </button>
          ))}
          <div className="border-t border-border my-1" />
          <button
            className={menuItemClass}
            onClick={() => {
              close();
              nav.toOverview();
            }}
          >
            <GitBranchIcon className="w-3.5 h-3.5" />
            Commits and branches…
          </button>
        </div>
      )}
    </div>
  );
}
