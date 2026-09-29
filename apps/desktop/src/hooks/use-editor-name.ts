import { useQuery } from '@tanstack/react-query';
import * as tauri from '../lib/tauri';

const NAMES: Record<string, string> = { code: 'VS Code', cursor: 'Cursor', zed: 'Zed' };

/** The editor's display name, plus whether the setting is still loading (so a label can hold its place). */
export function useEditorNameState(): { name: string; loading: boolean } {
  const { data, isPending, isError } = useQuery({ queryKey: ['setting', 'editor'], queryFn: () => tauri.getSetting('editor'), staleTime: 60_000 });
  if (!data) {
    return { name: 'editor', loading: isPending && !isError };
  }
  return { name: NAMES[data] ?? data, loading: false };
}

export function useEditorName(): string {
  return useEditorNameState().name;
}
