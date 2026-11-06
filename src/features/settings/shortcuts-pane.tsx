import { KeyCaps } from '../../components/ui/key-caps';
import { useShortcutSections } from '../../components/layout/shortcuts-sheet';
import { PreferencesGroup, PreferencesPane } from './preferences';

export function ShortcutsPane() {
  const sections = useShortcutSections();

  return (
    <PreferencesPane>
      {sections.map((section) => (
        <PreferencesGroup key={section.title} label={section.title}>
          <div className="flex flex-col">
            {section.shortcuts.map((shortcut) => (
              <div key={`${shortcut.label}-${shortcut.keys.join()}`} className="flex items-center justify-between gap-4 py-1.5">
                <span className="text-[13px] text-text">{shortcut.label}</span>
                <KeyCaps keys={shortcut.keys} join={shortcut.join} />
              </div>
            ))}
          </div>
        </PreferencesGroup>
      ))}
    </PreferencesPane>
  );
}
