import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import type { ConfigChoice, ModelCatalog, ModelChoice } from '../../lib/types';
import { Popover, useMenu } from '../../components/ui/popover';
import { CheckIcon, ChevronDownIcon, RefreshIcon, SearchIcon } from '../../components/ui/icon';
import { Spinner } from '../../components/icons/spinner';
import { findModel, hasManyProviders, modelName, modelProvider, refreshModelCatalog, runModelLabel, useModelCatalog, useModelCatalogs, withModel, type RunPick } from './model-setting';
import { agentMeta, useInstalledAgents, type AgentMeta } from './agents';

interface ModelMenuProps {
  value: RunPick;
  onChange: (value: RunPick) => void;
}

/** Catalogs longer than this open with the rest folded under "Show more". */
const FOLD_AFTER = 4;

/** One pickable line: the agent's own setting (`model` unset) or one of its models. */
interface Row {
  key: string;
  agent: AgentMeta;
  model: string | undefined;
  label: string;
  hint?: string;
}

interface Section {
  agent: AgentMeta;
  rows: Row[];
  /** Models left out until "Show more"; zero while searching. */
  folded: number;
  loading: boolean;
  error: string | null;
}

/** Claude Code lists its own default ("Default (recommended)") as a model; the agent's setting row stands for it. */
function isDefaultEntry(model: ModelChoice): boolean {
  return model.value.toLowerCase() === 'default' || /^default\b/i.test(model.name);
}

/** Agents list their own "Default" effort; leaving the effort unset stands for it. */
function isDefaultEffort(effort: ConfigChoice): boolean {
  return effort.value.toLowerCase() === 'default' || /^default\b/i.test(effort.name);
}

interface EffortBarsProps {
  efforts: ConfigChoice[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

/** Rising bars, one per effort level; clicking the lit top bar goes back to the agent's default. */
function EffortBars(props: EffortBarsProps) {
  const { efforts, value, onChange } = props;
  const [preview, setPreview] = useState(-1);
  const picked = efforts.findIndex((effort) => effort.value === value);
  const shown = preview >= 0 ? preview : picked;

  const step = (delta: number) => {
    const next = Math.max(-1, Math.min(efforts.length - 1, picked + delta));
    onChange(next < 0 ? undefined : efforts[next].value);
  };

  return (
    <div className="flex flex-col gap-1.5 -mx-1 -mb-1 mt-1 px-2.5 pt-2 pb-2.5 border-t border-overlay-border">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">Effort</span>
        <span className={cn('truncate text-xs', shown >= 0 ? 'text-text font-medium' : 'text-text-muted')}>{shown >= 0 ? efforts[shown].name : 'Default'}</span>
      </div>
      <div
        role="group"
        aria-label="Effort"
        onMouseLeave={() => setPreview(-1)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
            return;
          }
          event.preventDefault();
          step(event.key === 'ArrowRight' ? 1 : -1);
        }}
        className="flex items-end gap-[3px] h-[22px]"
      >
        {efforts.map((effort, index) => {
          const on = index === picked;
          const height = efforts.length > 1 ? 28 + (72 * index) / (efforts.length - 1) : 100;
          return (
            <button
              key={effort.value}
              type="button"
              aria-pressed={on}
              aria-label={effort.name}
              title={effort.name}
              onMouseEnter={() => setPreview(index)}
              onClick={() => onChange(on ? undefined : effort.value)}
              className="flex flex-1 items-end h-full rounded-[2px] cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-text-muted"
            >
              <span
                style={{ height: `${height}%` }}
                className={cn(
                  'w-full rounded-[2px] transition-colors',
                  index > shown && 'bg-overlay-border',
                  index <= shown && preview < 0 && 'bg-text',
                  index <= shown && preview >= 0 && 'bg-text-muted',
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function buildSection(agent: AgentMeta, query: { data?: ModelCatalog | null; isLoading: boolean; error: unknown }, value: RunPick, needle: string, expanded: boolean): Section {
  const catalog = query.data;
  const empty = { agent, rows: [], folded: 0, loading: query.isLoading, error: query.error ? tauri.errorMessage(query.error) : null };
  if (!catalog) {
    return empty;
  }
  const showProvider = hasManyProviders(catalog);
  const models = catalog.models.filter((model) => !isDefaultEntry(model));
  const toRow = (model: ModelChoice): Row => ({
    key: `${agent.id}:${model.value}`,
    agent,
    model: model.value,
    label: modelName(model),
    hint: showProvider ? modelProvider(model) ?? undefined : undefined,
  });

  if (needle) {
    const hits = models.filter((model) => model.name.toLowerCase().includes(needle));
    return { ...empty, rows: hits.map(toRow) };
  }

  const current = findModel(catalog, catalog.currentModel);
  const defaultRow: Row = {
    key: `${agent.id}:`,
    agent,
    model: undefined,
    label: 'Default',
    hint: current && !isDefaultEntry(current) ? modelName(current) : 'Recommended',
  };
  const pickedIndex = value.agent === agent.id && value.model ? models.findIndex((model) => model.value === value.model) : -1;
  const fold = !expanded && models.length > FOLD_AFTER + 2 && pickedIndex < FOLD_AFTER;
  const shown = fold ? models.slice(0, FOLD_AFTER) : models;
  return { ...empty, rows: [defaultRow, ...shown.map(toRow)], folded: models.length - shown.length };
}

/** Every installed agent's models with a search on top, grouped by agent, and the picked model's effort levels
 * below the list so they never scroll away. Picking a model picks its agent. */
export function ModelMenu(props: ModelMenuProps) {
  const { value, onChange } = props;
  const installed = useInstalledAgents();
  const agents = installed.length > 0 ? installed : [agentMeta(value.agent)];
  const queries = useModelCatalogs(agents.map((agent) => agent.id));
  const grouped = agents.length > 1;
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState(-1);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const needle = search.trim().toLowerCase();

  const sections = agents.map((agent, index) => {
    const query = queries[index];
    const state = { data: query?.data, isLoading: !!query?.isLoading || (refreshing && !query?.data), error: query?.error ?? null };
    return buildSection(agent, state, value, needle, expanded.has(agent.id));
  });
  const visible = needle ? sections.filter((section) => section.rows.length > 0) : sections;
  const rows = visible.flatMap((section) => section.rows);

  const selectedCatalog = queries[agents.findIndex((agent) => agent.id === value.agent)]?.data;
  const effective = findModel(selectedCatalog, value.model) ?? findModel(selectedCatalog, selectedCatalog?.currentModel);
  const efforts = (effective?.efforts ?? []).filter((effort) => !isDefaultEffort(effort));

  useEffect(() => {
    if (active < 0) {
      return;
    }
    listRef.current?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const refresh = async (ids: string[]) => {
    setRefreshing(true);
    setRefreshError(null);
    try {
      await Promise.all(ids.map((id) => refreshModelCatalog(id)));
    } catch (err) {
      setRefreshError(tauri.errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  };

  const pick = (row: Row) => {
    if (row.agent.id !== value.agent) {
      onChange({ agent: row.agent.id, model: row.model });
      return;
    }
    const catalog = queries[agents.indexOf(row.agent)]?.data;
    onChange({ agent: row.agent.id, ...withModel(catalog, value, row.model) });
  };

  const isPicked = (row: Row) => row.agent.id === value.agent && row.model === value.model;

  const move = (step: number) => {
    if (rows.length === 0) {
      return;
    }
    if (active < 0) {
      const picked = rows.findIndex(isPicked);
      setActive(picked >= 0 ? picked : 0);
      return;
    }
    setActive(Math.max(0, Math.min(rows.length - 1, active + step)));
  };

  let rowIndex = 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 h-8 pl-2 pr-1 -mx-1 -mt-1 mb-1 border-b border-overlay-border">
        <SearchIcon size="sm" className="shrink-0 text-text-muted" />
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setActive(event.target.value.trim() ? 0 : -1);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              move(event.key === 'ArrowDown' ? 1 : -1);
              return;
            }
            if (event.key === 'Enter') {
              const row = rows[Math.max(0, active)];
              if (row) {
                event.preventDefault();
                pick(row);
              }
            }
          }}
          placeholder="Search models"
          spellCheck={false}
          autoComplete="off"
          aria-label="Search models"
          className="flex-1 min-w-0 h-full bg-transparent text-[13px] text-text placeholder:text-text-muted outline-none"
        />
        <button
          type="button"
          onClick={() => void refresh(agents.map((agent) => agent.id))}
          disabled={refreshing}
          title="Refresh models"
          aria-label="Refresh models"
          className="inline-flex items-center justify-center size-6 shrink-0 rounded-md text-text-muted hover:text-text hover:bg-hover cursor-pointer disabled:cursor-default"
        >
          {refreshing ? <Spinner /> : <RefreshIcon size="sm" />}
        </button>
      </div>

      <div ref={listRef} role="listbox" aria-label="Models" className="max-h-[264px] overflow-y-auto scrollbar-overlay" onMouseLeave={() => setActive(-1)}>
        {visible.length === 0 && <div className="px-2.5 py-3 text-xs text-text-muted">No model matches “{search.trim()}”.</div>}
        {visible.map((section) => (
          <div key={section.agent.id}>
            {grouped && (
              <div className="sticky top-0 z-[1] bg-overlay px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-text-muted">{section.agent.name}</div>
            )}
            {section.loading && (
              <div className="flex items-center gap-2 px-2.5 py-2 text-xs text-text-muted">
                <Spinner />
                Reading models from {section.agent.name}…
              </div>
            )}
            {!section.loading && section.rows.length === 0 && !needle && (
              <div className="flex flex-col gap-1.5 px-2.5 py-2 text-xs">
                <span className="text-text-secondary">{section.error ?? `${section.agent.name} did not list any models.`}</span>
                <button type="button" onClick={() => void refresh([section.agent.id])} className="self-start text-text-muted hover:text-text cursor-pointer">
                  Try again
                </button>
              </div>
            )}
            {section.rows.map((row) => {
              const index = rowIndex++;
              const picked = isPicked(row);
              return (
                <button
                  key={row.key}
                  type="button"
                  role="option"
                  aria-selected={picked}
                  data-row={index}
                  onClick={() => pick(row)}
                  onMouseMove={() => {
                    if (active !== index) {
                      setActive(index);
                    }
                  }}
                  className={cn('flex items-center gap-2.5 w-full h-8 px-2.5 rounded-md text-left text-[13px] cursor-pointer', index === active && 'bg-hover')}
                >
                  <span className={cn('flex-1 min-w-0 truncate', row.model ? 'text-text' : 'text-text-secondary')}>{row.label}</span>
                  {row.hint && <span className="shrink-0 truncate max-w-[45%] text-xs text-text-muted">{row.hint}</span>}
                  <CheckIcon size="sm" className={cn('shrink-0 text-text', !picked && 'invisible')} />
                </button>
              );
            })}
            {section.folded > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((current) => new Set(current).add(section.agent.id))}
                className="h-7 px-2.5 text-xs text-text-muted hover:text-text cursor-pointer"
              >
                Show {section.folded} more
              </button>
            )}
          </div>
        ))}
      </div>

      {refreshError && <div className="px-2.5 pt-1 text-[11px] text-deleted truncate" title={refreshError}>{refreshError}</div>}

      {efforts.length > 0 && <EffortBars efforts={efforts} value={value.effort} onChange={(effort) => onChange({ ...value, effort })} />}
    </div>
  );
}

/** Short label like "Opus 5.5 · High"; names the agent when its own model is unknown. */
export function usePickLabel(value: RunPick): string {
  const { data: catalog } = useModelCatalog(value.agent);
  return runModelLabel(catalog, value, `${agentMeta(value.agent).short} default`);
}

interface ModelPickerProps extends ModelMenuProps {
  align?: 'start' | 'end';
  className?: string;
}

/** Quiet text button ("Opus 5.5 · High") that opens the model menu. */
export function ModelPicker(props: ModelPickerProps) {
  const { value, onChange, align = 'start', className } = props;
  const { open, close, toggle, anchorRef } = useMenu();
  const label = usePickLabel(value);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title="Model and thinking effort"
        className={cn(
          'inline-flex items-center gap-1 h-6 px-1.5 min-w-0 rounded-md text-xs text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer',
          open && 'bg-hover text-text',
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon size="xs" className="shrink-0" />
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} align={align} width={260}>
        <ModelMenu value={value} onChange={onChange} />
      </Popover>
    </>
  );
}
