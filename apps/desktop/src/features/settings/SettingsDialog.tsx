import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import { cn } from '@/lib/cn';
import type { AgentInfo } from '@/lib/types';
import { agentHint, agentPathSetting, isAgentUsable } from '@/features/agent/agents';
import {
  AlertIcon,
  CheckIcon,
  CodeIcon,
  GithubIcon,
  MonitorIcon,
  MoonIcon,
  PaletteIcon,
  RefreshIcon,
  SparklesIcon,
  SunIcon,
  type IconComponent,
  type IconProps,
} from '@/components/ui/icon';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { GithubAuthPanel } from '@/features/pr/GithubAuthPanel';
import { Input } from '@/components/ui/Input';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { Tabs } from '@/components/ui/Tabs';
import { setThemePreference, useThemeStore, type ThemePreference } from '@/lib/theme';

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Section = 'general' | 'agents' | 'github' | 'editor';

const SECTIONS: { id: Section; label: string; icon: ComponentType<IconProps> }[] = [
  { id: 'general', label: 'Appearance', icon: PaletteIcon },
  { id: 'agents', label: 'Claude Code', icon: SparklesIcon },
  { id: 'github', label: 'GitHub', icon: GithubIcon },
  { id: 'editor', label: 'Editor', icon: CodeIcon },
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
  const [section, setSection] = useState<Section>('general');

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Settings" padded={false} className="h-[560px] w-[780px]">
      <div className="flex h-full min-h-0">
        <nav className="w-[190px] shrink-0 border-r border-border bg-panel p-2">
          <Tabs
            variant="list"
            value={section}
            onChange={setSection}
            items={SECTIONS.map((item) => ({ value: item.id, label: item.label, icon: <item.icon size={14} /> }))}
          />
        </nav>
        <div className="min-w-0 flex-1 overflow-auto bg-canvas px-6 py-5">
          {section === 'general' && <AppearanceSection />}
          {section === 'agents' && <AgentsSection />}
          {section === 'github' && <GithubSection />}
          {section === 'editor' && <EditorSection />}
        </div>
      </div>
    </Dialog>
  );
}

function SectionTitle(props: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-fg">{props.title}</h3>
        {props.description && <p className="mt-0.5 text-xs text-fg-muted">{props.description}</p>}
      </div>
      {props.action}
    </div>
  );
}

function SettingGroup(props: { children: ReactNode }) {
  return <div className="divide-y divide-border-subtle rounded-lg border border-border bg-raised">{props.children}</div>;
}

function SettingRow(props: { label: string; description?: ReactNode; children?: ReactNode; stacked?: boolean }) {
  const { label, description, children, stacked } = props;
  return (
    <div className={cn('px-4 py-3', stacked ? 'space-y-2.5' : 'flex items-center gap-4')}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg">{label}</div>
        {description && <div className="mt-0.5 text-xs text-fg-muted">{description}</div>}
      </div>
      {children && <div className={cn(!stacked && 'shrink-0')}>{children}</div>}
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
      <SectionTitle
        title="Claude Code"
        description="Diffity drives your local Claude Code install over ACP."
        action={
          <Button size="sm" loading={agentsQuery.isFetching} onClick={() => void redetect()}>
            {!agentsQuery.isFetching && <RefreshIcon size={12} />}
            Re-detect
          </Button>
        }
      />
      {agentsQuery.isPending && (
        <div className="flex items-center gap-2 text-xs text-fg-subtle">
          <Spinner size={14} /> Detecting…
        </div>
      )}
      {agentsQuery.isError && <p className="text-xs text-danger">{api.errorMessage(agentsQuery.error)}</p>}
      <div className="space-y-4">
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

function AgentStatus(props: { agent: AgentInfo }) {
  const { agent } = props;
  if (!agent.installed) {
    return <Badge tone="warning">Not installed</Badge>;
  }
  if (agent.authenticated === true) {
    return (
      <Badge tone="success">
        <CheckIcon size={12} />
        Logged in
      </Badge>
    );
  }
  if (agent.authenticated === false) {
    return <Badge tone="warning">Logged out</Badge>;
  }
  return <Badge>Auth unknown</Badge>;
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
    <SettingGroup>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md border border-accent/25 bg-accent-soft text-accent">
          <SparklesIcon size={16} />
          <span
            aria-hidden
            className={cn(
              'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-raised',
              isAgentUsable(agent) ? 'bg-success' : 'bg-warning',
            )}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">{agent.name}</span>
            <AgentStatus agent={agent} />
          </div>
          <div className="selectable mt-0.5 truncate font-mono text-2xs text-fg-subtle" title={agent.binaryPath ?? undefined}>
            {agent.binaryPath ?? 'No binary found'}
          </div>
        </div>
      </div>
      {hint && (
        <div className="flex items-start gap-2 bg-warning/10 px-4 py-2 text-xs text-warning">
          <AlertIcon size={14} className="mt-px shrink-0" />
          <span>{hint}</span>
        </div>
      )}
      <SettingRow
        stacked
        label="Custom binary path"
        description="Point to the claude CLI or claude-agent-acp. Leave empty to auto-detect."
      >
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void commit();
          }}
        >
          <Input
            mono
            wrapperClassName="flex-1"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Auto-detect"
          />
          <Button type="submit" size="md" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty}>
            Save
          </Button>
        </form>
      </SettingRow>
    </SettingGroup>
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
          <Spinner size={14} /> Checking…
        </div>
      )}
      {status?.authenticated && !reauth && (
        <SettingGroup>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-fg">
              <GithubIcon size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-fg">{status.login ?? 'Authenticated'}</span>
                <Badge tone="success">
                  <CheckIcon size={12} />
                  Connected
                </Badge>
              </div>
              <div className="mt-0.5 text-2xs text-fg-subtle">
                {status.source === 'gh' ? 'Token imported from the GitHub CLI' : 'Token stored in the macOS keychain'}
              </div>
            </div>
            <Button size="sm" onClick={() => setReauth(true)}>
              Re-authenticate
            </Button>
            <Button size="sm" variant="ghost" className="hover:text-danger" loading={loggingOut} onClick={logout}>
              Sign out
            </Button>
          </div>
        </SettingGroup>
      )}
      {status && (!status.authenticated || reauth) && (
        <div>
          <GithubAuthPanel
            compact
            deviceFlowAvailable={status.deviceFlowAvailable}
            onAuthenticated={() => setReauth(false)}
          />
          {reauth && (
            <Button className="mt-3" size="md" variant="ghost" onClick={() => setReauth(false)}>
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
      <SettingGroup>
        <SettingRow
          label="Open files with"
          description="Falls back to the system default app when the editor CLI is not on PATH."
        >
          <SegmentedToggle
            value={editorQuery.data ?? 'code'}
            options={EDITORS}
            onChange={(value) => void save('editor', value)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  );
}

const THEMES: { value: ThemePreference; label: string; icon: IconComponent }[] = [
  { value: 'system', label: 'System', icon: MonitorIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
];

function MiniWindow(props: { theme: 'light' | 'dark'; className?: string }) {
  return (
    <div data-theme-preview={props.theme} className={cn('flex h-full flex-col bg-canvas', props.className)}>
      <div className="flex h-3 items-center gap-0.5 border-b border-border bg-panel px-1">
        <span className="size-1 rounded-full bg-border-strong" />
        <span className="size-1 rounded-full bg-border-strong" />
        <span className="size-1 rounded-full bg-border-strong" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-5 border-r border-border bg-panel" />
        <div className="flex-1 space-y-1 p-1.5">
          <div className="h-1 w-3/4 rounded-full bg-muted" />
          <div className="h-1 w-1/2 rounded-full bg-added/40" />
          <div className="h-1 w-2/3 rounded-full bg-removed/40" />
          <div className="h-1.5 w-6 rounded-sm bg-accent-solid" />
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch(props: { value: ThemePreference }) {
  const { value } = props;
  if (value === 'system') {
    return (
      <div className="relative h-full">
        <MiniWindow theme="light" className="absolute inset-0" />
        <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
          <MiniWindow theme="dark" />
        </div>
      </div>
    );
  }
  return <MiniWindow theme={value} />;
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
      <SectionTitle title="Appearance" description="Choose how Diffity looks. System follows your macOS setting." />
      <SettingGroup>
        <SettingRow stacked label="Theme">
          <div role="radiogroup" className="grid grid-cols-3 gap-3">
            {THEMES.map((option) => {
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => void change(option.value)}
                  className="group cursor-default text-left"
                >
                  <div
                    className={cn(
                      'h-[72px] overflow-hidden rounded-md border-2 transition-colors',
                      active ? 'border-accent' : 'border-border group-hover:border-border-strong',
                    )}
                  >
                    <ThemeSwatch value={option.value} />
                  </div>
                  <div
                    className={cn(
                      'mt-1.5 flex items-center gap-1.5 text-xs font-medium',
                      active ? 'text-accent' : 'text-fg-muted group-hover:text-fg',
                    )}
                  >
                    <option.icon size={12} />
                    {option.label}
                  </div>
                </button>
              );
            })}
          </div>
        </SettingRow>
      </SettingGroup>
    </div>
  );
}
