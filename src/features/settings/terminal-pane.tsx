import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import { isTauri } from '../../lib/platform';
import { openSettingsAt } from '../../lib/ui-store';
import type { TerminalAgent, TerminalStatus } from '../../lib/types';
import { CheckIcon, CopyIcon } from '../../components/ui/icon';
import { useHighlighter } from '../../hooks/use-highlighter';
import { useThemeStore } from '../../hooks/use-theme';
import { tokensToHtml } from '../../lib/syntax-token';
import { cn } from '../../lib/cn';
import { PreferencesGroup, PreferencesPane, PreferencesRow, SegmentedControl, SettingsButton, StatusBadge, Switch } from './preferences';

const STATUS_KEY = ['terminal-status'];
const TRY_PROMPT = 'address my Diffity review';

const AGENT_NAMES: Record<TerminalAgent, string> = { claude: 'Claude Code', codex: 'Codex' };

const chip = 'rounded bg-bg-tertiary px-1.5 py-0.5 font-mono text-[11px] text-text-secondary';

function useTerminalStatus() {
  return useQuery({ queryKey: STATUS_KEY, queryFn: tauri.terminalStatus, staleTime: 30_000 });
}

/** Diffity → Install 'diffity' Command opens this pane. */
export function useTerminalSettingsMenu() {
  useEffect(() => {
    if (!isTauri) {
      return;
    }
    const unlisten = getCurrentWebviewWindow().listen('open-terminal-settings', () => openSettingsAt('terminal'));
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, []);
}

/** The JSON most MCP clients take, or OpenCode's own shape. */
function setupJson(status: TerminalStatus, format: 'opencode' | 'mcp'): string {
  const [command, ...args] = status.command;
  if (format === 'opencode') {
    return JSON.stringify({ mcp: { [status.serverName]: { type: 'local', command: status.command, enabled: true } } }, null, 2);
  }
  return JSON.stringify({ mcpServers: { [status.serverName]: { command, args } } }, null, 2);
}

export function TerminalPane() {
  const { data: status } = useTerminalStatus();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: STATUS_KEY });

  /** Runs an action; on success `apply` updates the status right away, so the row flips without waiting for the
   * (slow) re-check that follows in the background. */
  const act = async (key: string, run: () => Promise<unknown>, done: string | null, failed: string, apply?: (status: TerminalStatus) => TerminalStatus) => {
    setBusy(key);
    try {
      await run();
      if (apply) {
        queryClient.setQueryData<TerminalStatus>(STATUS_KEY, (current) => (current ? apply(current) : current));
      }
      if (done) {
        toast.success(done);
      }
    } catch (error) {
      toast.error(failed, { description: tauri.errorMessage(error) });
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const setConnected = (agent: TerminalAgent, connected: boolean) => (current: TerminalStatus): TerminalStatus => ({
    ...current,
    allowed: connected ? true : current.allowed,
    agents: current.agents.map((item) => (item.agent === agent ? { ...item, connected } : item)),
  });

  const connect = (agent: TerminalAgent) =>
    act(`connect-${agent}`, () => tauri.terminalConnect(agent), `${AGENT_NAMES[agent]} can now read your Diffity reviews. Try: “${TRY_PROMPT}”`, `Could not connect ${AGENT_NAMES[agent]}`, setConnected(agent, true));

  const disconnect = (agent: TerminalAgent) =>
    act(`disconnect-${agent}`, () => tauri.terminalDisconnect(agent), null, `Could not disconnect ${AGENT_NAMES[agent]}`, setConnected(agent, false));

  const copySetup = async (text: string) => {
    await navigator.clipboard.writeText(text);
    if (status && !status.allowed) {
      queryClient.setQueryData<TerminalStatus>(STATUS_KEY, (current) => (current ? { ...current, allowed: true } : current));
      await tauri.terminalSetAllowed(true);
    }
  };

  const anyConnected = !!status?.agents.some((agent) => agent.connected);
  const allowed = !!status?.allowed;
  const cliName = status?.cli.name ?? 'diffity';

  return (
    <PreferencesPane>
      <PreferencesGroup
        label="Terminal agents"
        action={
          <Switch
            checked={allowed}
            label="Allow terminal agents"
            disabled={!status || busy !== null}
            onChange={(next) => void act('allow', () => tauri.terminalSetAllowed(next), null, 'Could not change the setting', (current) => ({ ...current, allowed: next }))}
          />
        }
      >
        <p className="pt-1 pb-0.5 text-[11.5px] leading-snug text-text-muted">Agents you run in a terminal can read and answer the comments you leave here.</p>
        <div className={cn('transition-opacity', status && !allowed && 'opacity-55')}>
          {(['claude', 'codex'] as TerminalAgent[]).map((agent) => {
            const info = status?.agents.find((item) => item.agent === agent);
            return (
              <PreferencesRow
                key={agent}
                label={
                  <span className="flex items-center gap-2">
                    {AGENT_NAMES[agent]}
                    {info?.connected && <StatusBadge tone={allowed ? 'success' : 'neutral'}>{allowed ? 'Connected' : 'Off'}</StatusBadge>}
                  </span>
                }
                hint={info && !info.found ? <><code className="font-mono">{agent}</code> isn’t on your PATH.</> : undefined}
              >
                {!info ? (
                  <span className="text-[11.5px] text-text-muted">Checking…</span>
                ) : info.connected ? (
                  <SettingsButton variant="destructive" busy={busy === `disconnect-${agent}`} disabled={busy !== null} onClick={() => void disconnect(agent)}>
                    Disconnect
                  </SettingsButton>
                ) : (
                  <SettingsButton variant="primary" busy={busy === `connect-${agent}`} disabled={busy !== null || !info.found} onClick={() => void connect(agent)}>
                    Connect
                  </SettingsButton>
                )}
              </PreferencesRow>
            );
          })}
          <PreferencesRow label="Other agents" hint="OpenCode, Cursor, Zed or any MCP client">
            <SettingsButton disabled={!status} aria-expanded={showConfig} onClick={() => setShowConfig((open) => !open)}>
              {showConfig ? 'Hide config' : 'Show config'}
            </SettingsButton>
          </PreferencesRow>
          {status && showConfig && (
            <div className="pb-2.5">
              <ConfigSnippet status={status} onCopy={(text) => void copySetup(text)} />
            </div>
          )}
        </div>
        {allowed && anyConnected && (
          <p className="pt-1 text-[11.5px] text-text-muted">
            Then, in a session: <span className={chip}>{TRY_PROMPT}</span>
          </p>
        )}
      </PreferencesGroup>

      <PreferencesGroup label="Command line">
        <PreferencesRow
          label={
            <span className="flex items-center gap-2">
              <code className="font-mono text-[12.5px]">{cliName}</code>
              {status?.cli.installed && !status.cli.broken && <StatusBadge tone="success">Installed</StatusBadge>}
              {status?.cli.broken && <StatusBadge tone="warning">Broken link</StatusBadge>}
            </span>
          }
          hint={<>Run <code className="font-mono">{cliName}</code> in a repo to open it here.</>}
        >
          {status && (!status.cli.installed || status.cli.broken) ? (
            <SettingsButton
              variant="primary"
              busy={busy === 'cli'}
              disabled={busy !== null}
              onClick={() => void act('cli', tauri.terminalInstallCli, `Installed ${status.cli.path}`, 'Could not install the command', (current) => ({ ...current, cli: { ...current.cli, installed: true, broken: false } }))}
            >
              {status.cli.broken ? 'Reinstall' : 'Install'}
            </SettingsButton>
          ) : (
            status && (
              <SettingsButton
                variant="destructive"
                busy={busy === 'cli'}
                disabled={busy !== null}
                onClick={() => void act('cli', tauri.terminalUninstallCli, null, 'Could not remove the command', (current) => ({ ...current, cli: { ...current.cli, installed: false } }))}
              >
                Uninstall
              </SettingsButton>
            )
          )}
        </PreferencesRow>
      </PreferencesGroup>
    </PreferencesPane>
  );
}

type ConfigFormat = 'mcp' | 'opencode';

const FORMATS: { value: ConfigFormat; label: string }[] = [
  { value: 'mcp', label: 'Cursor, Zed & others' },
  { value: 'opencode', label: 'OpenCode' },
];

const FILE_NAMES: Record<ConfigFormat, string> = { mcp: 'mcp.json', opencode: 'opencode.json' };

/** The setup for agents Diffity can't register itself with, highlighted, in each client's shape. */
function ConfigSnippet(props: { status: TerminalStatus; onCopy: (text: string) => void }) {
  const { status, onCopy } = props;
  const [format, setFormat] = useState<ConfigFormat>('mcp');
  const [copied, setCopied] = useState(false);
  const { highlight } = useHighlighter();
  const theme = useThemeStore((state) => state.theme);
  const text = setupJson(status, format);
  const highlighted = useMemo(() => highlight(text, 'config.json', theme), [highlight, text, theme]);

  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex flex-col gap-2">
      <div className="self-start">
        <SegmentedControl value={format} options={FORMATS} ariaLabel="Config format" onChange={setFormat} />
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex h-7 items-center justify-between border-b border-border bg-bg-secondary pr-1 pl-3">
          <span className="font-mono text-[10.5px] text-text-muted">{FILE_NAMES[format]}</span>
          <button
            type="button"
            onClick={() => {
              onCopy(text);
              setCopied(true);
            }}
            className="inline-flex h-5 cursor-pointer items-center gap-1 rounded px-1.5 text-[11px] text-text-secondary hover:bg-hover hover:text-text"
          >
            {copied ? <CheckIcon className="h-3 w-3 text-added" /> : <CopyIcon className="h-3 w-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {highlighted ? (
          <pre
            className="overflow-x-auto bg-bg px-3 py-2 font-mono text-[11.5px] leading-5"
            style={{ color: highlighted.fg }}
            dangerouslySetInnerHTML={{ __html: highlighted.lines.map((line) => `<div>${tokensToHtml(line.tokens)}</div>`).join('') }}
          />
        ) : (
          <pre className="overflow-x-auto bg-bg px-3 py-2 font-mono text-[11.5px] leading-5 text-text">{text}</pre>
        )}
      </div>
    </div>
  );
}
