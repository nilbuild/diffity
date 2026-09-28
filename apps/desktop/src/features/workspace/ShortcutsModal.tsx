import { Dialog } from '@/components/ui/Dialog';
import { Kbd } from '@/components/ui/Kbd';
import { modKey } from '@/lib/platform';
import { useViewStore } from './view-store';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'Navigation',
    items: [
      [['j'], 'Next file'],
      [['k'], 'Previous file'],
      [['n'], 'Next hunk'],
      [['p'], 'Previous hunk'],
      [['/'], 'Filter files'],
    ],
  },
  {
    title: 'Review',
    items: [
      [['x'], 'Collapse / expand file'],
      [['⇧', 'X'], 'Collapse / expand all'],
      [['r'], 'Toggle viewed'],
      [['u'], 'Unified view'],
      [['s'], 'Split view'],
      [['Esc'], 'Clear selection / cancel'],
    ],
  },
  {
    title: 'Comments & AI',
    items: [
      [[modKey, '↵'], 'Submit comment'],
      [[modKey, 'L'], 'Ask AI about selection'],
      [[modKey, 'O'], 'Open repository'],
      [['?'], 'Show shortcuts'],
    ],
  },
];

export function ShortcutsModal() {
  const open = useViewStore((s) => s.shortcutsOpen);
  const setOpen = useViewStore((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" className="w-[560px]">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 py-1">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{group.title}</div>
            {group.items.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between py-1 text-[13px]">
                <span className="text-fg-muted">{label}</span>
                <span className="flex gap-1">
                  {keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
