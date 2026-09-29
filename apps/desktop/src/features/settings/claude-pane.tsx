import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import type { AgentInfo } from '../../lib/types';
import { cn } from '../../lib/cn';
import {
  PreferencesGroup,
  PreferencesPane,
  PreferencesRow,
  SettingsButton,
  StatusBadge,
  settingsInputClass,
} from './preferences';
import { AlertCircleIcon, CheckIcon, RefreshIcon, SparkleIcon } from '../../components/ui/icon';
import { Skeleton, useRevealClass } from '../../components/ui/skeleton';
import { PERMISSION_OPTIONS, savePermissionSetting, usePermissionSetting, type PermissionSetting } from '../claude/permission-setting';

const CLAUDE_PATH_KEY = 'agent.claude.path';

const CAPABILITIES = [
  { title: 'Review a diff', detail: 'Reads the changes you are looking at and leaves comments on lines. Never edits files while reviewing.' },
  { title: 'Answer @claude', detail: 'Mention @claude in a comment or reply and Claude answers in the thread.' },
  { title: 'Resolve comments', detail: 'Makes the requested edits, then resolves the thread with a summary. Permissions below decide whether it asks first.' },
  { title: 'Stay local', detail: 'Uses your own Claude Code login. Nothing is posted to GitHub unless you post it.' },
];

function statusOf(agent: AgentInfo | null): { tone: 'success' | 'warning' | 'danger'; label: string; hint: string | null } {
  if (!agent || !agent.installed) {
    return {
      tone: 'danger',
      label: 'Not found',
      hint: 'Install it with npm i -g @anthropic-ai/claude-code, or point to it below.',
    };
  }
  if (agent.authenticated === false) {
    return { tone: 'warning', label: 'Logged out', hint: 'Run claude in a terminal and log in, then re-detect.' };
  }
  if (agent.authenticated === null) {
    return { tone: 'warning', label: 'Login unknown', hint: agent.note };
  }
  return { tone: 'success', label: 'Ready', hint: null };
}

function useRedetect() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const redetect = async () => {
    setBusy(true);
    try {
      const next = await tauri.listAgents(true);
      queryClient.setQueryData(['agents'], next);
    } catch (error) {
      toast.error('Could not detect Claude Code', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return { busy, redetect };
}

function StatusCard(props: { agent: AgentInfo | null; loading: boolean; busy: boolean; onRedetect: () => void }) {
  const { agent, loading, busy, onRedetect } = props;
  const status = statusOf(agent);
  const reveal = useRevealClass(loading);

  return (
    <div className="rounded-lg border border-border bg-bg-secondary">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-claude/12 text-claude">
          <SparkleIcon className="h-4 w-4" />
          {!loading && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-bg-secondary',
                status.tone === 'success' ? 'bg-added' : status.tone === 'warning' ? 'bg-modified' : 'bg-deleted',
              )}
            />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-text">Claude Code</span>
            {loading ? (
              <Skeleton className="h-5 w-20 rounded-full" />
            ) : (
              <StatusBadge tone={status.tone} className={reveal}>
                {status.tone === 'success' && <CheckIcon className="h-3 w-3" />}
                {status.label}
              </StatusBadge>
            )}
          </div>
          <div className="mt-0.5 flex items-center h-4 min-w-0 font-mono text-[11px] text-text-muted select-text" title={agent?.binaryPath ?? undefined}>
            {loading ? <Skeleton className="h-2.5 w-56" /> : <span className={cn('truncate', reveal)}>{agent?.binaryPath ?? 'No binary found'}</span>}
          </div>
        </div>
        <SettingsButton busy={busy} onClick={onRedetect}>
          {!busy && <RefreshIcon className="h-3 w-3" />}
          Re-detect
        </SettingsButton>
      </div>
      {!loading && status.hint && (
        <div className="flex items-start gap-2 border-t border-border px-3.5 py-2 text-[11.5px] text-text-secondary">
          <AlertCircleIcon className={cn('mt-px h-3.5 w-3.5 shrink-0', status.tone === 'danger' ? 'text-deleted' : 'text-modified')} />
          <span>{status.hint}</span>
        </div>
      )}
    </div>
  );
}

function PathRow(props: { onSaved: () => Promise<void> }) {
  const { onSaved } = props;
  const queryClient = useQueryClient();
  const { data: saved } = useQuery({ queryKey: ['setting', CLAUDE_PATH_KEY], queryFn: () => tauri.getSetting(CLAUDE_PATH_KEY) });
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setDraft(saved ?? '');
  }, [saved]);

  const dirty = draft.trim() !== (saved ?? '');

  const save = async () => {
    const value = draft.trim();
    try {
      await tauri.setSetting(CLAUDE_PATH_KEY, value);
      queryClient.setQueryData(['setting', CLAUDE_PATH_KEY], value);
      toast.success(value ? 'Claude Code path saved' : 'Detecting Claude Code automatically');
      await onSaved();
    } catch (error) {
      toast.error('Could not save the path', { description: tauri.errorMessage(error) });
    }
  };

  return (
    <PreferencesRow
      stacked
      label="Binary path"
      hint="Point to the claude CLI or claude-agent-acp. Leave empty to find it on your PATH."
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          autoComplete="off"
          autoCorrect="off"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Detect automatically"
          spellCheck={false}
          className={cn(settingsInputClass, 'font-mono')}
        />
        <SettingsButton type="submit" variant={dirty ? 'primary' : 'default'} disabled={!dirty}>
          Save
        </SettingsButton>
      </form>
    </PreferencesRow>
  );
}

function PermissionsGroup() {
  const setting = usePermissionSetting();

  const choose = async (value: PermissionSetting) => {
    if (value === setting) {
      return;
    }
    try {
      await savePermissionSetting(value);
    } catch (error) {
      toast.error('Could not save the setting', { description: tauri.errorMessage(error) });
    }
  };

  return (
    <PreferencesGroup label="Permissions">
      <p className="pt-1.5 pb-1 text-[11.5px] leading-snug text-text-muted">
        When Claude fixes comments or replies in a thread. Reviews and questions never edit files or run commands that change them.
      </p>
      <div role="radiogroup" aria-label="Permissions" className="flex flex-col">
        {PERMISSION_OPTIONS.map((option) => {
          const checked = option.value === setting;
          return (
            <label key={option.value} className="flex items-start gap-2.5 py-2 cursor-pointer">
              <input
                type="radio"
                name="claude-permissions"
                checked={checked}
                onChange={() => void choose(option.value)}
                className="mt-0.5 accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-text">
                  {option.label}
                  {option.value === 'skip' && <span className="ml-1.5 text-[11px] text-text-muted">Default</span>}
                </span>
                <span className="block text-[11.5px] leading-snug text-text-muted">{option.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </PreferencesGroup>
  );
}

export function ClaudePane() {
  const { data: agents, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => tauri.listAgents() });
  const { busy, redetect } = useRedetect();
  const claude = agents?.find((agent) => agent.id === 'claude') ?? null;

  return (
    <PreferencesPane>
      <PreferencesGroup label="Status">
        <div className="pt-1.5">
          <StatusCard agent={claude} loading={isLoading} busy={busy} onRedetect={() => void redetect()} />
        </div>
      </PreferencesGroup>
      <PreferencesGroup label="Location">
        <PathRow onSaved={redetect} />
      </PreferencesGroup>
      <PermissionsGroup />
      <PreferencesGroup label="What Claude can do here">
        <ul className="flex flex-col gap-2.5 pt-1.5">
          {CAPABILITIES.map((item) => (
            <li key={item.title} className="flex gap-2.5">
              <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-added" />
              <div className="min-w-0">
                <div className="text-[13px] text-text">{item.title}</div>
                <div className="text-[11.5px] leading-snug text-text-muted">{item.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </PreferencesGroup>
    </PreferencesPane>
  );
}
