import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { cn } from '../../lib/cn';
import type { ProjectData } from '../../lib/types';
import { forgetRepoCaches } from '../../lib/repo-locations';
import { buttonOutline, inputField } from '../../components/ui/button-styles';
import { useBusyRepoPaths } from '../claude/claude-runner';
import { PreferencesGroup, PreferencesPane, SettingsButton } from './preferences';

const PROJECT_DATA_KEY = ['project-data'];

/** Per-project browser data tied to comments: unsent drafts and remembered composer state. */
const LOCAL_PREFIXES = ['diffity-draft:', 'diffity-view:'];
/** Also dropped by a reset: per-project recent files in the palette. */
const RESET_PREFIXES = [...LOCAL_PREFIXES, 'diffity-recent-files:'];

function forgetLocalData(prefixes: string[], repoPath: string | null) {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => !!key);
    for (const key of keys) {
      if (prefixes.some((prefix) => key.startsWith(prefix)) && (repoPath === null || key.includes(repoPath))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    return;
  }
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function summary(project: ProjectData): string {
  const parts = [plural(project.comments, 'comment')];
  if (project.chats > 0) {
    parts.push(plural(project.chats, 'agent chat'));
  }
  return parts.join(' · ');
}

const REMOVED = [
  'Comments and replies, including resolved ones and unsent drafts',
  'Reviews you finished in Diffity and agents’ review comments',
  'Files marked as viewed',
  'Agent chat history',
];

const KEPT = [
  'Your code, branches and git history',
  'Anything on GitHub. Comments you posted stay there and come back the next time a PR syncs',
  'Your settings, GitHub sign-in and agent logins',
];

function DataList(props: { title: string; items: string[]; tone: 'removed' | 'kept' }) {
  const { title, items, tone } = props;

  return (
    <div>
      <div className="mb-1 text-xs font-medium text-text">{title}</div>
      <ul className="flex flex-col gap-0.5 pl-4 text-xs leading-5 text-text-secondary list-disc marker:text-text-muted">
        {items.map((item) => (
          <li key={item} className={cn(tone === 'removed' && 'marker:text-deleted/70')}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

interface DataDialogProps {
  title: string;
  intro: ReactNode;
  removed: string[];
  confirmLabel: string;
  /** Text the user must type before confirming. */
  typeToConfirm?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DataDialog(props: DataDialogProps) {
  const { title, intro, removed, confirmLabel, typeToConfirm, busy, onConfirm, onCancel } = props;
  const [typed, setTyped] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm;

  useEffect(() => {
    (inputRef.current ?? cancelRef.current)?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
      onMouseDown={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          if (!busy) {
            onCancel();
          }
        }
      }}
    >
      <div role="alertdialog" aria-labelledby="data-dialog-title" className="mx-4 w-full max-w-md rounded-xl bg-overlay p-5 ring-1 ring-overlay-border">
        <h3 id="data-dialog-title" className="mb-1 text-sm font-semibold text-text">{title}</h3>
        <div className="mb-4 text-[13px] leading-relaxed text-text-secondary">{intro}</div>
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-bg-secondary px-3.5 py-3">
          <DataList title="Deleted" items={removed} tone="removed" />
          <DataList title="Not touched" items={KEPT} tone="kept" />
        </div>
        <p className="mb-4 text-xs text-text-muted">This can’t be undone.</p>
        {typeToConfirm && (
          <label className="mb-4 block text-xs text-text-secondary">
            Type <span className="font-mono font-medium text-text">{typeToConfirm}</span> to confirm
            <input
              ref={inputRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && ready && !busy) {
                  onConfirm();
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(inputField, 'mt-1.5 font-mono')}
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} disabled={busy} className={buttonOutline}>
            Cancel
          </button>
          <SettingsButton
            variant="danger"
            busy={busy}
            disabled={!ready}
            onClick={onConfirm}
            className="border border-deleted/35 disabled:opacity-45"
          >
            {confirmLabel}
          </SettingsButton>
        </div>
      </div>
    </div>
  );
}

function useAfterDelete() {
  const queryClient = useQueryClient();

  return async (repoPath: string | null) => {
    forgetRepoCaches(repoPath);
    forgetLocalData(repoPath === null ? RESET_PREFIXES : LOCAL_PREFIXES, repoPath);
    await queryClient.invalidateQueries();
  };
}

export function DataPane() {
  const { data: projects = [], isLoading } = useQuery({ queryKey: PROJECT_DATA_KEY, queryFn: tauri.projectData });
  const busyRepos = useBusyRepoPaths();
  const afterDelete = useAfterDelete();
  const [clearing, setClearing] = useState<ProjectData | null>(null);
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const withData = projects.filter((project) => project.comments + project.chats + project.reviews > 0);

  const clear = async (project: ProjectData) => {
    setBusy(true);
    try {
      await tauri.clearProjectData(project.repoPath);
      await afterDelete(project.repoPath);
      toast.success(`Cleared ${project.name}`, { description: summary(project) });
      setClearing(null);
    } catch (error) {
      toast.error('Could not clear the project', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await tauri.resetAllData();
      await afterDelete(null);
      toast.success('Diffity was reset', { description: 'Comments, chats and recent projects are gone. Your settings were kept.' });
      setResetting(false);
    } catch (error) {
      toast.error('Could not reset Diffity', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PreferencesPane>
      <PreferencesGroup label="Projects">
        <p className="pt-1.5 pb-1 text-[11.5px] leading-snug text-text-muted">
          Diffity keeps comments, reviews and agent chats on this Mac, per project. Clearing a project deletes them here only.
        </p>
        {isLoading && <div className="py-2.5 text-xs text-text-muted">Loading…</div>}
        {!isLoading && withData.length === 0 && <div className="py-2.5 text-xs text-text-muted">No comments or chats stored yet.</div>}
        {withData.map((project) => {
          const running = busyRepos.has(project.repoPath);
          return (
            <div key={project.repoPath} className="flex items-center gap-3 border-t border-border-muted py-2.5 first-of-type:border-t-0">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] text-text">{project.name}</span>
                <span className="truncate font-mono text-[11px] text-text-muted" title={project.repoPath}>{project.repoPath}</span>
              </div>
              <span className="shrink-0 text-xs text-text-secondary tabular-nums">{summary(project)}</span>
              <SettingsButton
                variant="danger"
                disabled={running}
                onClick={() => setClearing(project)}
                title={running ? 'An agent is working in this project. Stop it first.' : undefined}
              >
                Clear…
              </SettingsButton>
            </div>
          );
        })}
      </PreferencesGroup>
      <PreferencesGroup label="Reset">
        <div className="flex items-center gap-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[13px] text-text">Reset Diffity</span>
            <p className="text-[11.5px] leading-snug text-text-muted">
              Deletes the data of every project and the recent projects list. Settings and sign-ins are kept.
            </p>
          </div>
          <SettingsButton
            variant="danger"
            disabled={busyRepos.size > 0}
            onClick={() => setResetting(true)}
            title={busyRepos.size > 0 ? 'An agent is working. Stop it first.' : undefined}
          >
            Reset…
          </SettingsButton>
        </div>
      </PreferencesGroup>
      {clearing && (
        <DataDialog
          title={`Clear ${clearing.name}?`}
          intro={<>Deletes {summary(clearing)} stored for <span className="font-mono text-xs text-text">{clearing.repoPath}</span>.</>}
          removed={REMOVED}
          confirmLabel="Clear project"
          busy={busy}
          onConfirm={() => void clear(clearing)}
          onCancel={() => setClearing(null)}
        />
      )}
      {resetting && (
        <DataDialog
          title="Reset Diffity?"
          intro="Deletes what Diffity stored for every project, and empties the recent projects list. Diffity then starts fresh, with your settings in place."
          removed={[...REMOVED, 'The recent projects list']}
          confirmLabel="Reset Diffity"
          typeToConfirm="reset"
          busy={busy}
          onConfirm={() => void reset()}
          onCancel={() => setResetting(false)}
        />
      )}
    </PreferencesPane>
  );
}
