import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { closeSettings, openShortcuts, useUi } from '../../lib/ui-store';
import { useTheme } from '../../hooks/use-theme';
import { SegmentedToggle } from '../ui/segmented-toggle';
import { XIcon } from '../icons/x-icon';
import { SunIcon } from '../icons/sun-icon';
import { MoonIcon } from '../icons/moon-icon';
import { SparkleIcon } from '../icons/sparkle-icon';
import { GitHubIcon } from '../icons/github-icon';
import { PencilIcon } from '../icons/pencil-icon';
import { KeyboardIcon } from '../icons/keyboard-icon';
import { Spinner } from '../icons/spinner';
import { SignInPanel } from './github-dialog';

const EDITORS = [
  { value: '', label: 'System default app' },
  { value: 'code', label: 'VS Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'zed', label: 'Zed' },
];

const CLAUDE_PATH_KEY = 'agent.claude.path';

function Section(props: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  const { icon, title, description, children } = props;

  return (
    <section className="px-5 py-4 border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-text-muted">{icon}</span>
        <h3 className="text-xs font-semibold text-text">{title}</h3>
      </div>
      {description && <p className="text-[11px] text-text-muted mb-2.5 pl-6">{description}</p>}
      <div className="pl-6">{children}</div>
    </section>
  );
}

const inputClass = 'flex-1 min-w-0 text-xs bg-bg border border-border rounded-md px-2.5 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent';
const secondaryButton = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-bg-tertiary text-text-secondary hover:text-text hover:bg-hover transition-colors cursor-pointer disabled:opacity-50 shrink-0';

function EditorSetting() {
  const queryClient = useQueryClient();
  const { data: editor = '' } = useQuery({ queryKey: ['setting', 'editor'], queryFn: () => tauri.getSetting('editor') });
  const known = EDITORS.some((item) => item.value === (editor ?? ''));
  const [custom, setCustom] = useState('');

  const save = async (value: string) => {
    queryClient.setQueryData(['setting', 'editor'], value);
    await tauri.setSetting('editor', value).catch((error) => toast.error('Could not save the editor', { description: tauri.errorMessage(error) }));
  };

  return (
    <div className="space-y-2">
      <select
        value={known ? (editor ?? '') : '__custom__'}
        onChange={(e) => {
          if (e.target.value === '__custom__') {
            setCustom(editor ?? '');
            return;
          }
          void save(e.target.value);
        }}
        className="w-full text-xs bg-bg border border-border rounded-md px-2 py-1.5 text-text focus:outline-none focus:border-accent cursor-pointer"
      >
        {EDITORS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
        <option value="__custom__">Other command…</option>
      </select>
      {!known && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save(custom.trim());
            toast.success('Editor saved');
          }}
        >
          <input value={custom || (editor ?? '')} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. subl" className={inputClass} />
          <button type="submit" className={secondaryButton}>
            Save
          </button>
        </form>
      )}
    </div>
  );
}

function ClaudeSetting() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const { data: agents, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => tauri.listAgents() });
  const { data: savedPath } = useQuery({ queryKey: ['setting', CLAUDE_PATH_KEY], queryFn: () => tauri.getSetting(CLAUDE_PATH_KEY) });
  const [path, setPath] = useState<string | null>(null);
  const claude = agents?.find((agent) => agent.id === 'claude') ?? null;

  const redetect = async () => {
    setRefreshing(true);
    try {
      const next = await tauri.listAgents(true);
      queryClient.setQueryData(['agents'], next);
    } finally {
      setRefreshing(false);
    }
  };

  const savePath = async () => {
    const value = (path ?? savedPath ?? '').trim();
    try {
      await tauri.setSetting(CLAUDE_PATH_KEY, value);
      queryClient.setQueryData(['setting', CLAUDE_PATH_KEY], value);
      toast.success(value ? 'Claude Code path saved' : 'Using Claude Code from PATH');
      await redetect();
    } catch (error) {
      toast.error('Could not save the path', { description: tauri.errorMessage(error) });
    }
  };

  const renderStatus = () => {
    if (isLoading || refreshing) {
      return (
        <span className="flex items-center gap-2 text-text-muted">
          <Spinner className="w-3 h-3" />
          Checking Claude Code…
        </span>
      );
    }
    if (!claude || !claude.installed) {
      return (
        <span className="text-deleted">
          Not found. Install it with <code className="font-mono">npm i -g @anthropic-ai/claude-code</code>, or set its path below.
        </span>
      );
    }
    if (claude.authenticated === false) {
      return <span className="text-modified">Installed but not logged in. Run <code className="font-mono">claude</code> in a terminal and log in.</span>;
    }
    return (
      <span className="text-added">
        Ready{claude.binaryPath ? <span className="text-text-muted"> · {claude.binaryPath}</span> : null}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3 py-2 px-3 bg-bg-secondary rounded-lg text-[11px]">
        <div className="min-w-0 break-words">{renderStatus()}</div>
        <button onClick={() => void redetect()} disabled={refreshing} className="text-accent hover:underline shrink-0 cursor-pointer disabled:opacity-50">
          Check again
        </button>
      </div>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void savePath();
        }}
      >
        <input
          value={path ?? savedPath ?? ''}
          onChange={(e) => setPath(e.target.value)}
          placeholder="Custom path to claude (optional)"
          className={`${inputClass} font-mono`}
        />
        <button type="submit" className={secondaryButton}>
          Save
        </button>
      </form>
    </div>
  );
}

function GitHubSetting() {
  const queryClient = useQueryClient();
  const { data: auth, isLoading } = useQuery({ queryKey: ['github-auth'], queryFn: tauri.githubAuthStatus });

  if (isLoading) {
    return (
      <span className="flex items-center gap-2 text-[11px] text-text-muted">
        <Spinner className="w-3 h-3" />
        Checking GitHub account…
      </span>
    );
  }
  if (!auth?.authenticated) {
    return (
      <div className="-mx-4 -mb-4">
        <SignInPanel
          onSignedIn={(status) => {
            queryClient.setQueryData(['github-auth'], status);
            queryClient.invalidateQueries({ queryKey: ['github-details'] });
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-bg-secondary rounded-lg text-[11px]">
      <span className="text-text-secondary">
        Signed in as <span className="font-medium text-text">{auth.login ?? 'unknown'}</span>
        {auth.source === 'gh' ? ' via GitHub CLI' : ''}
      </span>
      <button
        onClick={async () => {
          await tauri.githubLogout().catch((error) => toast.error(tauri.errorMessage(error)));
          queryClient.invalidateQueries({ queryKey: ['github-auth'] });
          queryClient.setQueryData(['github-details'], null);
        }}
        className="text-text-muted hover:text-text cursor-pointer"
      >
        Sign out
      </button>
    </div>
  );
}

export function SettingsDialog() {
  const open = useUi((state) => state.settingsOpen);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSettings();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeSettings}>
      <div className="bg-bg rounded-xl shadow-lg w-full max-w-md mx-4 font-sans max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-semibold text-text">Settings</h2>
          <button onClick={closeSettings} className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer" title="Close">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
        <Section icon={theme === 'light' ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />} title="Appearance">
          <SegmentedToggle
            options={[
              { value: 'light', label: 'Light', icon: <SunIcon className="w-3.5 h-3.5" /> },
              { value: 'dark', label: 'Dark', icon: <MoonIcon className="w-3.5 h-3.5" /> },
            ]}
            value={theme}
            onChange={setTheme}
          />
        </Section>
        <Section icon={<PencilIcon className="w-4 h-4" />} title="Editor" description="Used by “Open in editor” on files and comments.">
          <EditorSetting />
        </Section>
        <Section icon={<SparkleIcon className="w-4 h-4" />} title="Claude Code" description="Reviews and resolves comments. Uses your local Claude Code login.">
          <ClaudeSetting />
        </Section>
        <Section icon={<GitHubIcon className="w-4 h-4" />} title="GitHub" description="Needed only to post reviews and sync comments with pull requests.">
          <GitHubSetting />
        </Section>
        <Section icon={<KeyboardIcon className="w-4 h-4" />} title="Keyboard shortcuts">
          <button
            onClick={() => {
              closeSettings();
              openShortcuts();
            }}
            className={secondaryButton}
          >
            Show all shortcuts
            <kbd className="font-mono text-[10px] text-text-muted">?</kbd>
          </button>
        </Section>
      </div>
    </div>
  );
}
