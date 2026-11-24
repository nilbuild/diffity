import { useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import type { AgentInfo } from '../../lib/types';
import { cn } from '../../lib/cn';
import { PreferencesGroup, PreferencesPane, PreferencesRow, SegmentedControl } from './preferences';
import { CopyIcon, EllipsisIcon, PencilIcon, RefreshIcon, UndoIcon, XIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { Skeleton } from '../../components/ui/skeleton';
import { MenuItem, Popover, useMenu } from '../../components/ui/popover';
import { buttonGhost, buttonIconSmall, buttonSmall } from '../../components/ui/button-styles';
import { PERMISSION_OPTIONS, savePermissionSetting, usePermissionSetting, type PermissionSetting } from '../claude/permission-setting';
import { ModelPicker } from '../claude/model-picker';
import { findModel, MODEL_PURPOSES, saveModelSetting, useModelCatalog, useModelSetting, type ModelPurpose, type RunPick } from '../claude/model-setting';
import { AGENTS, agentMeta, type AgentMeta } from '../claude/agents';

type AgentState = 'ready' | 'attention' | 'missing';

/** Missing: not installed or unusable. Attention: installed, but sign-in needs a look. */
function stateOf(agent: AgentInfo | null): AgentState {
  if (!agent?.installed) {
    return 'missing';
  }
  if (agent.authenticated === false || (agent.authenticated === null && agent.note)) {
    return 'attention';
  }
  return 'ready';
}

const pathKey = (meta: AgentMeta) => `agent.${meta.id}.path`;

function useSavedPath(meta: AgentMeta) {
  return useQuery({ queryKey: ['setting', pathKey(meta)], queryFn: () => tauri.getSetting(pathKey(meta)) });
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
      toast.error('Could not detect agents', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return { busy, redetect };
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error(`Could not copy ${what}`);
  }
}

/** The binary path, edited in place on the agent's row. Enter saves, Esc cancels, empty finds it on PATH again. */
function PathField(props: { meta: AgentMeta; initial: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { meta, initial, onClose, onSaved } = props;
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = draft.trim() !== initial;

  const save = async () => {
    const value = draft.trim();
    setSaving(true);
    try {
      await tauri.setSetting(pathKey(meta), value);
      queryClient.setQueryData(['setting', pathKey(meta)], value);
      toast.success(value ? `${meta.name} path saved` : `Finding ${meta.name} on your PATH`);
      onClose();
      await onSaved();
    } catch (error) {
      toast.error('Could not save the path', { description: tauri.errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Enter' && dirty) {
      event.preventDefault();
      void save();
    }
  };

  return (
    <div className="flex h-7 min-w-0 items-center gap-0.5 rounded-md border border-border bg-bg pl-2.5 pr-0.5 transition-colors focus-within:border-focus">
      <input
        id={`agent-path-${meta.id}`}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKey}
        placeholder={meta.pathHint.replace(/^Point to/, 'Path to').replace(/\.$/, '')}
        title="Leave empty to find it on your PATH"
        aria-label={`${meta.name} binary path`}
        className="min-w-0 flex-1 bg-transparent font-mono text-xs text-text outline-none placeholder:font-sans placeholder:text-text-muted"
      />
      {dirty && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={cn(buttonSmall, 'h-[22px] px-2 bg-fill text-text hover:bg-fill-hover')}
        >
          {saving && <Spinner className="h-3 w-3" />}
          Save
        </button>
      )}
      <button type="button" onClick={onClose} title="Cancel (Esc)" aria-label="Cancel" className={cn(buttonIconSmall, 'h-[22px] w-[22px]')}>
        <XIcon size="xs" />
      </button>
    </div>
  );
}

function AgentMenu(props: { meta: AgentMeta; agent: AgentInfo | null; custom: boolean; onEdit: () => void; onReset: () => void }) {
  const { meta, agent, custom, onEdit, onReset } = props;
  const { open, close, toggle, anchorRef } = useMenu();
  const choose = (action: () => void) => () => {
    close();
    action();
  };

  return (
    <>
      <button ref={anchorRef} type="button" onClick={toggle} aria-expanded={open} aria-label={`${meta.name} options`} className={cn(buttonIconSmall, open && 'bg-hover text-text')}>
        <EllipsisIcon size="sm" />
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} align="end" width={200}>
        <MenuItem icon={<PencilIcon size="sm" />} label="Change path…" onSelect={choose(onEdit)} />
        {agent?.binaryPath && <MenuItem icon={<CopyIcon size="sm" />} label="Copy path" onSelect={choose(() => void copy(agent.binaryPath ?? '', 'the path'))} />}
        {custom && <MenuItem icon={<UndoIcon size="sm" />} label="Find it on PATH again" onSelect={choose(onReset)} />}
      </Popover>
    </>
  );
}

function AgentRow(props: { meta: AgentMeta; agent: AgentInfo | null; onRedetect: () => Promise<void> }) {
  const { meta, agent, onRedetect } = props;
  const queryClient = useQueryClient();
  const { data: saved } = useSavedPath(meta);
  const [editing, setEditing] = useState(false);
  const state = stateOf(agent);
  const custom = !!saved?.trim();

  const reset = async () => {
    try {
      await tauri.setSetting(pathKey(meta), '');
      queryClient.setQueryData(['setting', pathKey(meta)], '');
      toast.success(`Finding ${meta.name} on your PATH`);
      await onRedetect();
    } catch (error) {
      toast.error('Could not reset the path', { description: tauri.errorMessage(error) });
    }
  };

  const detail = () => {
    if (editing) {
      const current = saved?.trim() || (state === 'missing' ? '' : agent?.binaryPath ?? '');
      return <PathField meta={meta} initial={current} onClose={() => setEditing(false)} onSaved={onRedetect} />;
    }
    if (state === 'missing') {
      if (agent?.binaryPath && agent.note) {
        return <span className="truncate text-xs text-deleted" title={agent.note}>{agent.note}</span>;
      }
      return (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-muted">
          <span className="shrink-0">Not installed</span>
          <button
            type="button"
            onClick={() => void copy(meta.install, 'the install command')}
            title="Copy the install command"
            className="inline-flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[11px] text-text-secondary bg-fill hover:bg-fill-hover hover:text-text cursor-pointer"
          >
            <span className="truncate">{meta.install}</span>
            <CopyIcon size="xs" className="shrink-0 opacity-70" />
          </button>
        </span>
      );
    }
    if (state === 'attention') {
      const reason = agent?.authenticated === false ? meta.login : agent?.note ?? meta.login;
      return <span className="truncate text-xs text-text-secondary" title={reason}>{reason}</span>;
    }
    return (
      <span className="truncate font-mono text-[11.5px] text-text-muted select-text" title={agent?.binaryPath ?? undefined}>
        {agent?.binaryPath}
      </span>
    );
  };

  return (
    <div className="grid min-h-10 grid-cols-[8px_112px_minmax(0,1fr)_auto] items-center gap-x-3 py-1">
      <span
        aria-hidden
        className={cn(
          'size-[7px] rounded-full',
          state === 'ready' && 'bg-added',
          state === 'attention' && 'bg-modified',
          state === 'missing' && 'ring-[1.5px] ring-inset ring-text-muted',
        )}
      />
      <span className={cn('truncate text-[13px] font-medium', state === 'missing' ? 'text-text-secondary' : 'text-text')}>{meta.name}</span>
      <div className={cn('flex min-w-0 flex-col', editing && 'col-span-2')}>{detail()}</div>
      {!editing && (
        <div className="flex w-[68px] justify-end">
          {state === 'missing' ? (
            <button type="button" onClick={() => setEditing(true)} className={cn(buttonGhost, 'h-6 px-2 text-xs')}>
              Set path
            </button>
          ) : (
            <AgentMenu meta={meta} agent={agent} custom={custom} onEdit={() => setEditing(true)} onReset={() => void reset()} />
          )}
        </div>
      )}
    </div>
  );
}

function AgentsGroup() {
  const { data: agents, isLoading } = useQuery({ queryKey: ['agents'], queryFn: () => tauri.listAgents() });
  const { busy, redetect } = useRedetect();
  const info = (meta: AgentMeta) => agents?.find((agent) => agent.id === meta.id) ?? null;
  const ordered = [...AGENTS].sort((a, b) => Number(!info(a)?.installed) - Number(!info(b)?.installed));

  return (
    <PreferencesGroup
      label="Agents"
      action={
        <button type="button" onClick={() => void redetect()} disabled={busy} className={cn(buttonGhost, '-my-1 h-6 px-2 text-xs')} title="Look for every agent again">
          {busy ? <Spinner className="h-3 w-3" /> : <RefreshIcon size="xs" />}
          Re-detect
        </button>
      }
    >
      <div className="flex flex-col divide-y divide-border/60">
        {isLoading
          ? AGENTS.slice(0, 3).map((meta) => (
            <div key={meta.id} className="grid min-h-10 grid-cols-[8px_112px_minmax(0,1fr)_auto] items-center gap-x-3 py-1">
              <Skeleton className="size-[7px] rounded-full" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2.5 w-48" />
              <span />
            </div>
          ))
          : ordered.map((meta) => <AgentRow key={meta.id} meta={meta} agent={info(meta)} onRedetect={redetect} />)}
      </div>
    </PreferencesGroup>
  );
}

function ModelRow(props: { purpose: ModelPurpose; label: string }) {
  const { purpose, label } = props;
  const value = useModelSetting(purpose);
  const { data: catalog } = useModelCatalog(value.agent);
  const gone = !!catalog && !!value.model && !findModel(catalog, value.model);

  const save = async (next: RunPick) => {
    try {
      await saveModelSetting(purpose, next);
    } catch (error) {
      toast.error('Could not save the model', { description: tauri.errorMessage(error) });
    }
  };

  return (
    <PreferencesRow
      label={label}
      hint={gone ? <span className="text-modified">{value.model} is no longer offered, so {agentMeta(value.agent).name}’s own default is used.</span> : undefined}
    >
      <ModelPicker value={value} onChange={(next) => void save(next)} align="end" className="-mr-1.5" />
    </PreferencesRow>
  );
}

function PermissionsGroup() {
  const setting = usePermissionSetting();
  const selected = PERMISSION_OPTIONS.find((option) => option.value === setting) ?? PERMISSION_OPTIONS[0];

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
    <PreferencesGroup label="When fixing comments">
      <div className="flex flex-col gap-2 pt-2">
        <div className="self-start">
          <SegmentedControl
            value={setting}
            ariaLabel="Permissions when fixing comments"
            options={PERMISSION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(value) => void choose(value)}
          />
        </div>
        <p className="text-[11.5px] leading-snug text-text-muted">{selected.hint} Reviews never change files.</p>
      </div>
    </PreferencesGroup>
  );
}

export function AgentsPane() {
  return (
    <PreferencesPane>
      <PreferencesGroup label="Default models">
        {MODEL_PURPOSES.map((item) => (
          <ModelRow key={item.value} purpose={item.value} label={item.label} />
        ))}
      </PreferencesGroup>
      <AgentsGroup />
      <PermissionsGroup />
    </PreferencesPane>
  );
}
