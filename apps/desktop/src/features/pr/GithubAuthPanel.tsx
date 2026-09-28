import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import * as api from '@/lib/api';
import { queryKeys } from '@/lib/query';
import type { DeviceCode, GithubAuthStatus } from '@/lib/types';
import { AlertIcon, ExternalLinkIcon, GithubIcon, GlobeIcon, KeyIcon, TerminalIcon } from '@/components/ui/icon';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

export interface GithubAuthPanelProps {
  deviceFlowAvailable: boolean;
  onAuthenticated?: (status: GithubAuthStatus) => void;
  compact?: boolean;
}

export function GithubAuthPanel(props: GithubAuthPanelProps) {
  const { deviceFlowAvailable, onAuthenticated, compact } = props;
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'gh' | 'token' | 'device' | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const pollRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollRef.current !== null) {
      window.clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => stopPolling, []);

  const finish = (status: GithubAuthStatus) => {
    queryClient.setQueryData(queryKeys.githubAuth(), status);
    queryClient.invalidateQueries({ queryKey: ['github'] });
    toast.success(status.login ? `Signed in to GitHub as ${status.login}` : 'Signed in to GitHub');
    onAuthenticated?.(status);
  };

  const importGh = async () => {
    setBusy('gh');
    setError(null);
    try {
      finish(await api.githubImportGhToken());
    } catch (err) {
      setError(`${api.errorMessage(err)}\nMake sure the GitHub CLI is installed and you ran \`gh auth login\`.`);
    } finally {
      setBusy(null);
    }
  };

  const saveToken = async () => {
    const value = token.trim();
    if (!value) {
      return;
    }
    setBusy('token');
    setError(null);
    try {
      finish(await api.githubSetToken(value));
      setToken('');
    } catch (err) {
      setError(api.errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const poll = (code: DeviceCode, intervalSeconds: number, deadline: number) => {
    pollRef.current = window.setTimeout(async () => {
      if (Date.now() > deadline) {
        setDevice(null);
        setBusy(null);
        setError('The device code expired. Try again.');
        return;
      }
      try {
        const status = await api.githubDevicePoll(code.deviceCode);
        setDevice(null);
        setBusy(null);
        finish(status);
      } catch (err) {
        const codeName = api.isAppError(err) ? err.code : '';
        if (codeName === 'pending') {
          poll(code, intervalSeconds, deadline);
          return;
        }
        if (codeName === 'slow_down' || codeName === 'slowDown') {
          poll(code, intervalSeconds + 5, deadline);
          return;
        }
        setDevice(null);
        setBusy(null);
        setError(api.errorMessage(err));
      }
    }, intervalSeconds * 1000);
  };

  const startDevice = async () => {
    setBusy('device');
    setError(null);
    try {
      const code = await api.githubDeviceStart();
      setDevice(code);
      await navigator.clipboard.writeText(code.userCode).catch(() => undefined);
      openUrl(code.verificationUri).catch(() => undefined);
      poll(code, Math.max(code.interval, 1), Date.now() + code.expiresIn * 1000);
    } catch (err) {
      setBusy(null);
      setError(api.errorMessage(err));
    }
  };

  const cancelDevice = () => {
    stopPolling();
    setDevice(null);
    setBusy(null);
  };

  const methods = (
    <div className="divide-y divide-border-subtle">
      <AuthMethod
        icon={<TerminalIcon size={16} />}
        title="Import from GitHub CLI"
        description={
          <>
            Reuses the token from <code className="font-mono">gh auth login</code>. Recommended.
          </>
        }
      >
        <Button variant="primary" loading={busy === 'gh'} disabled={busy !== null} onClick={importGh}>
          Import
        </Button>
      </AuthMethod>
      {deviceFlowAvailable && (
        <AuthMethod
          icon={<GlobeIcon size={16} />}
          title="Sign in with browser"
          description="Authorize Diffity on github.com with a one-time code."
        >
          <Button loading={busy === 'device'} disabled={busy !== null} onClick={startDevice}>
            Sign in
          </Button>
        </AuthMethod>
      )}
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <MethodIcon>
            <KeyIcon size={16} />
          </MethodIcon>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-fg">Personal access token</div>
            <div className="mt-0.5 text-xs text-fg-muted">
              Needs the <code className="font-mono">repo</code> scope (classic) or Pull requests read/write (fine-grained).
            </div>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void saveToken();
              }}
            >
              <Input
                type="password"
                mono
                wrapperClassName="flex-1"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="ghp_… or github_pat_…"
              />
              <Button type="submit" loading={busy === 'token'} disabled={busy !== null || !token.trim()}>
                Save
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  const deviceView = device && (
    <div className="space-y-3 px-4 py-5 text-center">
      <p className="text-xs text-fg-muted">Enter this code on GitHub. It is already on your clipboard.</p>
      <div className="selectable mx-auto inline-flex rounded-md border border-border bg-canvas px-4 py-2 font-mono text-lg font-semibold tracking-[0.2em] text-fg">
        {device.userCode}
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button onClick={() => openUrl(device.verificationUri).catch(() => undefined)}>
          <ExternalLinkIcon size={14} />
          Open {device.verificationUri.replace(/^https?:\/\//, '')}
        </Button>
        <Button variant="ghost" onClick={cancelDevice}>
          Cancel
        </Button>
      </div>
      <div className="flex items-center justify-center gap-2 text-2xs text-fg-subtle">
        <Spinner size={12} /> Waiting for authorization…
      </div>
    </div>
  );

  const errorView = error && (
    <div className="selectable flex items-start gap-2 border-t border-danger/30 bg-danger/10 px-4 py-2.5 text-xs whitespace-pre-wrap text-danger">
      <AlertIcon size={14} className="mt-px shrink-0" />
      <span className="min-w-0">{error}</span>
    </div>
  );

  if (compact) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-raised">
        {deviceView || methods}
        {errorView}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] py-12">
      <div className="overflow-hidden rounded-lg border border-border bg-raised">
        <div className="flex items-center gap-3 border-b border-border bg-panel px-4 py-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-raised text-fg">
            <GithubIcon size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">Connect GitHub</h2>
            <p className="text-xs text-fg-muted">See pull requests and sync review comments. Tokens stay in your keychain.</p>
          </div>
        </div>
        {deviceView || methods}
        {errorView}
      </div>
    </div>
  );
}

function MethodIcon(props: { children: ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-fg-muted">
      {props.children}
    </span>
  );
}

function AuthMethod(props: { icon: ReactNode; title: string; description: ReactNode; children: ReactNode }) {
  const { icon, title, description, children } = props;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <MethodIcon>{icon}</MethodIcon>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-fg">{title}</div>
        <div className="mt-0.5 text-xs text-fg-muted">{description}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
