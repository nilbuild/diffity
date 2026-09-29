import { shortcuts } from '../../components/layout/shortcut-modal';
import { PreferencesGroup, PreferencesPane } from './preferences';

export function ShortcutsPane() {
  return (
    <PreferencesPane>
      {shortcuts.map((group) => (
        <PreferencesGroup key={group.category} label={group.category}>
          <div className="flex flex-col">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-[13px] text-text">{item.description}</span>
                <kbd className="inline-flex h-5 min-w-6 items-center justify-center rounded border border-border bg-bg-secondary px-1.5 font-mono text-[11px] text-text-secondary">
                  {item.key}
                </kbd>
              </div>
            ))}
          </div>
        </PreferencesGroup>
      ))}
    </PreferencesPane>
  );
}
