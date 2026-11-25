import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getRepoPathOrNull } from '../../lib/api';
import * as tauri from '../../lib/tauri';
import { PreferencesRow, SettingsButton } from './preferences';
import { GrowingTextarea } from '../../components/ui/growing-textarea';

function withoutFinalNewline(text: string) {
  return text.replace(/\n$/, '');
}

function repoName(path: string) {
  return path.split('/').filter(Boolean).pop() ?? path;
}

/** The open repo's own "hide from diffs" patterns, kept in its git dir next to `.git/info/exclude`. */
export function DiffIgnoreRow() {
  const repoPath = getRepoPathOrNull();
  const queryClient = useQueryClient();
  const rules = useQuery({
    queryKey: ['diff-ignore-rules', repoPath],
    queryFn: () => tauri.getDiffIgnoreRules(repoPath ?? ''),
    enabled: !!repoPath,
  });
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rules.data === undefined) {
      return;
    }
    setDraft(withoutFinalNewline(rules.data));
  }, [rules.data]);

  if (!repoPath) {
    return (
      <PreferencesRow label="Hide these files from diffs" hint="Open a repository to set the files it hides from diffs." />
    );
  }

  const saved = withoutFinalNewline(rules.data ?? '');
  const dirty = rules.data !== undefined && draft !== saved;

  const save = async () => {
    setSaving(true);
    try {
      await tauri.setDiffIgnoreRules(repoPath, draft);
      await queryClient.invalidateQueries({ queryKey: ['diff-ignore-rules', repoPath] });
      queryClient.invalidateQueries({ queryKey: ['diff'] });
      queryClient.invalidateQueries({ queryKey: ['tree-paths'] });
      queryClient.invalidateQueries({ queryKey: ['overview'] });
      toast.success('Saved the hidden files list');
    } catch (error) {
      toast.error('Could not save the list', { description: tauri.errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PreferencesRow
      stacked
      label={<>Hide these files from diffs <span className="text-text-muted">· {repoName(repoPath)}</span></>}
      hint={<>Gitignore patterns, one per line, for this repository only. Adds to a <code className="font-mono">.diffityignore</code> file at the repo root, if there is one. Hidden files stay in the Files tab.</>}
    >
      <GrowingTextarea
        value={draft}
        growTo={320}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={'For example:\ndist/\n*.min.js'}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        rows={5}
        id="diff-ignore-rules"
        aria-label="Patterns to hide from diffs"
        className="w-full rounded-md border border-border bg-bg px-2.5 py-2 font-mono text-xs leading-5 text-text outline-none placeholder:text-text-muted focus:border-focus"
      />
      <div className="flex justify-end gap-2">
        {dirty && (
          <SettingsButton onClick={() => setDraft(saved)} disabled={saving}>
            Revert
          </SettingsButton>
        )}
        <SettingsButton variant="primary" onClick={save} busy={saving} disabled={!dirty}>
          Save
        </SettingsButton>
      </div>
    </PreferencesRow>
  );
}
