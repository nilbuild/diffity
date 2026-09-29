import { useQuery } from '@tanstack/react-query';
import * as tauri from '../lib/tauri';

const NAMES: Record<string, string> = { code: 'VS Code', cursor: 'Cursor', zed: 'Zed' };

export function useEditorName(): string {
  const { data } = useQuery({ queryKey: ['setting', 'editor'], queryFn: () => tauri.getSetting('editor'), staleTime: 60_000 });
  if (!data) {
    return 'your editor';
  }
  return NAMES[data] ?? data;
}
