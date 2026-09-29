import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import {
  PreferencesGroup,
  PreferencesPane,
  PreferencesRow,
  SegmentedControl,
  SettingsButton,
  settingsInputClass,
} from './preferences';

type KnownEditor = 'code' | 'cursor' | 'zed' | 'system';

const EDITORS: { value: KnownEditor; label: string }[] = [
  { value: 'code', label: 'VS Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'zed', label: 'Zed' },
  { value: 'system', label: 'System' },
];

function toKnown(value: string): KnownEditor | null {
  if (value === '') {
    return 'system';
  }
  if (value === 'code' || value === 'cursor' || value === 'zed') {
    return value;
  }
  return null;
}

export function EditorPane() {
  const queryClient = useQueryClient();
  const { data: saved = '' } = useQuery({ queryKey: ['setting', 'editor'], queryFn: () => tauri.getSetting('editor') });
  const editor = saved ?? '';
  const known = toKnown(editor);
  const [custom, setCustom] = useState('');

  useEffect(() => {
    setCustom(known ? '' : editor);
  }, [editor, known]);

  const save = async (value: string) => {
    try {
      await tauri.setSetting('editor', value);
      queryClient.setQueryData(['setting', 'editor'], value);
    } catch (error) {
      toast.error('Could not save the editor', { description: tauri.errorMessage(error) });
    }
  };

  const customDirty = custom.trim() !== '' && custom.trim() !== editor;

  return (
    <PreferencesPane>
      <PreferencesGroup label="Open in editor">
        <PreferencesRow
          label="Open files with"
          hint="Used by “Open in editor” on files and comments. Falls back to the system default app when the command is missing."
        >
          <SegmentedControl<KnownEditor>
            ariaLabel="Editor"
            value={known}
            options={EDITORS}
            onChange={(value) => void save(value === 'system' ? '' : value)}
          />
        </PreferencesRow>
        <PreferencesRow stacked label="Custom command" hint="Any CLI that opens a file, e.g. subl, idea or webstorm.">
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!customDirty) {
                return;
              }
              void save(custom.trim()).then(() => toast.success(`Opening files with ${custom.trim()}`));
            }}
          >
            <input
              autoComplete="off"
              autoCorrect="off"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              placeholder={known ? 'Not set' : ''}
              spellCheck={false}
              className={cn(settingsInputClass, 'font-mono')}
            />
            <SettingsButton type="submit" variant={customDirty ? 'primary' : 'default'} disabled={!customDirty}>
              Use command
            </SettingsButton>
          </form>
        </PreferencesRow>
      </PreferencesGroup>
    </PreferencesPane>
  );
}
