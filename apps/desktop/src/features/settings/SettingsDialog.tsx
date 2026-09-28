import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { cn } from '@/lib/cn';
import type { AgentInfo } from '@/lib/types';
import { agentHint, agentPathSetting, isAgentUsable } from '@/features/agent/agents';
import { IconGithub } from '@/features/agent/icons';
import { Badge, Button, Dialog, Spinner } from '@/features/agent/primitives';
import { GithubAuthPanel } from '@/features/pr/GithubAuthPanel';
import { setThemePreference, useThemeStore, type ThemePreference } from '@/lib/theme';

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = 'agents' | 'github' | 'editor' | 'appearance';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'agents', label: 'Claude Code' },
  { id: 'github', label: 'GitHub' },
  { id: 'editor', label: 'Editor' },
  { id: 'appearance', label: 'Appearance' },
];

const EDITORS = [
  { value: 'code', label: 'VS Code' },
  { value: 'cursor', label: 'Cursor' },
  { value: 'zed', label: 'Zed' },
];

function useSetting(key: string, enabled = true) {
  return useQuery({ queryKey: queryKeys.setting(key), queryFn: () => api.getSetting(key), enabled });
}

function useSaveSetting() {
  const queryClient = useQueryClient();
  return async (key: string, value: string) => {
    try {
      await api.setSetting(key, value);
      queryClient.setQueryData(queryKeys.setting(key), value);
      return true;
    } catch (error) {
      toast.error('Could not save setting', { description: api.errorMessage(error) });
      return false;
    }
  };
}

export function SettingsDialog(props: SettingsDialogProps) {
  const { open, onOpenChange } = props;
  const [section, setSection] = useState<Section>('agents');

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings" className="h-[520px] w-[720px]">
      <div className="flex h-full min-h-0">
        <nav className="w-[160px] shrink-0 space-y-0.5 border-r border-border bg-bg-subtle p-2">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
              className={cn(
                'block w-full rounded-md px-2.5 py-1.5 text-left text-xs',
                section === item.id ? 'bg-bg-muted font-medium text-fg' : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 overflow-auto p-5">
          {section === 'agents' && <AgentsSection />}
          {section === 'github' && <GithubSection />}
          {section === 'editor' && <EditorSection />}
          {section === 'appearance' && <AppearanceSection />}
        </div>
      </div>
    </Dialog>
  );
}

function SectionTitle(props: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-semibold">{props.title}</h3>
      {props.description && <p className="mt-0.5 text-xs text-fg-muted">{props.description}</p>}
    </div>
  );
}

function Field(props: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs font-medium">{props.label}</div>
      {props.children}
      {props.hint && <div className="mt-1 text-[11px] text-fg-subtle">{props.hint}</div>}
    </div>
  );
}

function OptionCards<T extends string>(props: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  const { value, options, onChange } = props;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs disabled:opacity-50',
            option.value === value
              ? 'border-accent bg-accent-subtle text-accent'
              : 'border-border bg-bg-elevated text-fg-muted hover:text-fg',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AgentsSection() {
  const queryClient = useQueryClient();
  const agentsQuery = useQuery({ queryKey: queryKeys.agents(), queryFn: () => api.listAgents() });
  const agents = agentsQuery.data ?? [];
  const redetect = async () => {
    const fresh = await api.listAgents(true).catch((error) => {
      toast.error('Could not detect Claude Code', { description: api.errorMessage(error) });
      return null;
    });
    if (!fresh) {
      return;
    }
    queryClient.setQueryData(queryKeys.agents(), fresh);
  };

  return (
    <div>
      <SectionTitle title="Claude Code" description="Diffity drives your local Claude Code install over ACP." />
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-medium">Detected install</div>
        <Button size="xs" variant="ghost" loading={agentsQuery.isFetching} onClick={() => void redetect()}>
          Re-detect
        </Button>
      </div>
      {agentsQuery.isPending && (
        <div className="flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner size={12} /> Detecting…
        </div>
      )}
      {agentsQuery.isError && <p className="text-xs text-danger">{api.errorMessage(agentsQuery.error)}</p>}
      <div className="space-y-2">
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function AgentRow(props: { agent: AgentInfo }) {
  const { agent } = props;
  const queryClient = useQueryClient();
  const key = agentPathSetting(agent.id);
  const pathQuery = useSetting(key);
  const save = useSaveSetting();
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(pathQuery.data ?? '');
  }, [pathQuery.data]);

  const dirty = draft.trim() !== (pathQuery.data ?? '');
  const hint = agentHint(agent);

  const commit = async () => {
    const ok = await save(key, draft.trim());
    if (!ok) {
      return;
    }
    const fresh = await api.listAgents(true).catch(() => null);
    if (fresh) {
      queryClient.setQueryData(queryKeys.agents(), fresh);
    }
    toast.success(draft.trim() ? `${agent.name} path saved` : `${agent.name} path reset to auto-detect`);
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="flex items-center gap-2">
        <span
          className={cn('h-2 w-2 rounded-full', isAgentUsable(agent) ? 'bg-success' : 'bg-warning')}
          aria-hidden
        />
        <span className="text-[13px] font-medium">{agent.name}</span>
        {!agent.installed && <Badge>Not installed</Badge>}
        {agent.installed && agent.authenticated === true && <Badge tone="success">Logged in</Badge>}
        {agent.installed && agent.authenticated === false && <Badge tone="warning">Logged out</Badge>}
        {agent.installed && agent.authenticated === null && <Badge>Auth unknown</Badge>}
      </div>
      {agent.binaryPath && (
        <div className="selectable mt-1 truncate font-mono text-[11px] text-fg-subtle" title={agent.binaryPath}>
          {agent.binaryPath}
        </div>
      )}
      {hint && <div className="mt-1 text-[11px] text-fg-muted">{hint}</div>}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void commit();
        }}
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Custom binary path (leave empty to auto-detect)"
          className="selectable h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 font-mono text-[11px] outline-none focus:border-accent focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="sm" disabled={!dirty}>
          Save
        </Button>
      </form>
    </div>
  );
}

function GithubSection() {
  const queryClient = useQueryClient();
  const authQuery = useQuery({ queryKey: queryKeys.githubAuth(), queryFn: api.githubAuthStatus });
  const [reauth, setReauth] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const status = authQuery.data;

  const logout = async () => {
    setLoggingOut(true);
    try {
      await api.githubLogout();
      await queryClient.invalidateQueries({ queryKey: ['github'] });
      toast.success('Signed out of GitHub');
    } catch (error) {
      toast.error('Could not sign out', { description: api.errorMessage(error) });
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div>
      <SectionTitle title="GitHub" description="Used to find pull requests and sync review comments." />
      {authQuery.isPending && (
        <div className="flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner size={12} /> Checking…
        </div>
      )}
      {status?.authenticated && !reauth && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated p-3">
          <IconGithub size={20} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{status.login ?? 'Authenticated'}</div>
            <div className="text-[11px] text-fg-subtle">
              {status.source === 'gh' ? 'Token from GitHub CLI' : 'Token stored in keychain'}
            </div>
          </div>
          <Button size="sm" onClick={() => setReauth(true)}>
            Re-authenticate
          </Button>
          <Button size="sm" variant="ghost" loading={loggingOut} onClick={logout}>
            Sign out
          </Button>
        </div>
      )}
      {status && (!status.authenticated || reauth) && (
        <div>
          <GithubAuthPanel
            compact
            deviceFlowAvailable={status.deviceFlowAvailable}
            onAuthenticated={() => setReauth(false)}
          />
          {reauth && (
            <Button className="mt-3" size="sm" variant="ghost" onClick={() => setReauth(false)}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function EditorSection() {
  const editorQuery = useSetting('editor');
  const save = useSaveSetting();
  return (
    <div>
      <SectionTitle title="Editor" description="Used by “Open in editor” and file links." />
      <Field label="Open files with" hint="Falls back to the system default app when the editor CLI is not on PATH.">
        <OptionCards
          value={editorQuery.data ?? 'code'}
          options={EDITORS}
          onChange={(value) => void save('editor', value)}
        />
      </Field>
    </div>
  );
}

function AppearanceSection() {
  const theme = useThemeStore((state) => state.preference);

  const change = async (value: ThemePreference) => {
    try {
      await setThemePreference(value);
    } catch (error) {
      toast.error('Could not save theme', { description: api.errorMessage(error) });
    }
  };

  return (
    <div>
      <SectionTitle title="Appearance" />
      <Field label="Theme">
        <OptionCards
          value={theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(value) => void change(value)}
        />
      </Field>
    </div>
  );
}
