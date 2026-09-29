import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as tauri from '../../lib/tauri';
import type { GithubAuthStatus } from '../../lib/types';
import { GitHubIcon } from '../../components/icons/github-icon';
import { CheckIcon } from '../../components/icons/check-icon';
import { Spinner } from '../../components/icons/spinner';
import {
  InlineConfirm,
  PreferencesGroup,
  PreferencesPane,
  PreferencesRow,
  SettingsButton,
  StatusBadge,
  settingsInputClass,
} from './preferences';

function useAuthChanged() {
  const queryClient = useQueryClient();

  return (status: GithubAuthStatus | null) => {
    if (status) {
      queryClient.setQueryData(['github-auth'], status);
    } else {
      queryClient.invalidateQueries({ queryKey: ['github-auth'] });
    }
    queryClient.invalidateQueries({ queryKey: ['github-details'] });
    queryClient.invalidateQueries({ queryKey: ['pull-requests'] });
  };
}

function SignInRows(props: { onSignedIn: () => void }) {
  const { onSignedIn } = props;
  const changed = useAuthChanged();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'gh' | 'token' | null>(null);

  const importFromGh = async () => {
    setBusy('gh');
    try {
      const status = await tauri.githubImportGhToken();
      changed(status);
      onSignedIn();
      toast.success(`Signed in as ${status.login ?? 'GitHub user'}`);
    } catch (error) {
      toast.error('Could not import the GitHub CLI token', { description: tauri.errorMessage(error) });
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
    try {
      const status = await tauri.githubSetToken(value);
      setToken('');
      changed(status);
      onSignedIn();
      toast.success(`Signed in as ${status.login ?? 'GitHub user'}`);
    } catch (error) {
      toast.error('Token was rejected', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PreferencesRow label="GitHub CLI" hint={<>Reuses the account from <code className="font-mono">gh auth login</code>.</>}>
        <SettingsButton variant="primary" busy={busy === 'gh'} disabled={busy !== null} onClick={() => void importFromGh()}>
          {busy !== 'gh' && <GitHubIcon className="h-3 w-3" />}
          Import from gh
        </SettingsButton>
      </PreferencesRow>
      <PreferencesRow stacked label="Personal access token" hint="Needs the repo scope. Stored in the macOS keychain.">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveToken();
          }}
        >
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="ghp_… or github_pat_…"
            className={settingsInputClass}
          />
          <SettingsButton type="submit" busy={busy === 'token'} disabled={busy !== null || !token.trim()}>
            Save token
          </SettingsButton>
        </form>
      </PreferencesRow>
    </>
  );
}

function AccountCard(props: { status: GithubAuthStatus; onSwitch: () => void }) {
  const { status, onSwitch } = props;
  const changed = useAuthChanged();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await tauri.githubLogout();
      changed(null);
      toast.success('Signed out of GitHub');
    } catch (error) {
      toast.error('Could not sign out', { description: tauri.errorMessage(error) });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="pt-1.5">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-secondary px-3.5 py-3">
        {status.login ? (
          <img
            src={`https://github.com/${status.login}.png?size=64`}
            alt=""
            className="size-8 shrink-0 rounded-full bg-bg-tertiary"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-text">
            <GitHubIcon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-text">{status.login ?? 'Signed in'}</span>
            <StatusBadge tone="success">
              <CheckIcon className="h-3 w-3" />
              Connected
            </StatusBadge>
          </div>
          <div className="mt-0.5 text-[11px] text-text-muted">
            {status.source === 'gh' ? 'Using the GitHub CLI login (gh auth token)' : 'Token stored in the macOS keychain'}
          </div>
        </div>
        <SettingsButton onClick={onSwitch}>Switch</SettingsButton>
        <SettingsButton variant="danger" onClick={() => setConfirming(true)}>
          Sign out
        </SettingsButton>
      </div>
      {confirming && (
        <InlineConfirm
          message={
            status.source === 'gh'
              ? 'Sign out of Diffity? Your GitHub CLI login is not touched.'
              : 'Sign out and remove the token from the keychain?'
          }
          confirmLabel="Sign out"
          busy={busy}
          onConfirm={() => void signOut()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function GitHubPane() {
  const { data: status, isLoading } = useQuery({ queryKey: ['github-auth'], queryFn: tauri.githubAuthStatus, retry: false });
  const [switching, setSwitching] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <Spinner className="h-3 w-3" />
        Checking your GitHub account…
      </div>
    );
  }

  const signedIn = !!status?.authenticated;

  return (
    <PreferencesPane>
      <PreferencesGroup
        label="Account"
        action={
          switching && (
            <button onClick={() => setSwitching(false)} className="cursor-pointer text-[11px] text-text-muted hover:text-text">
              Cancel
            </button>
          )
        }
      >
        {signedIn && !switching && status && <AccountCard status={status} onSwitch={() => setSwitching(true)} />}
        {(!signedIn || switching) && <SignInRows onSignedIn={() => setSwitching(false)} />}
      </PreferencesGroup>
      <PreferencesGroup label="What it is used for">
        <ul className="flex flex-col gap-1.5 pt-1.5 text-[12px] text-text-secondary">
          <li>Listing and checking out pull requests of the open repository.</li>
          <li>Pulling review comments from a pull request into the diff.</li>
          <li>Posting your review to a pull request, only when you choose to.</li>
        </ul>
      </PreferencesGroup>
    </PreferencesPane>
  );
}
