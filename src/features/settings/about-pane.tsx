import { useQuery } from '@tanstack/react-query';
import { getTauriVersion, getVersion } from '@tauri-apps/api/app';
import { isDevBuild, isTauri } from '../../lib/platform';
import { BrandLogo } from '../../components/icons/brand-logo';
import { PreferencesGroup, PreferencesPane, PreferencesRow, SettingsButton } from './preferences';
import { reportIssue } from '../../lib/report-issue';
import { openWhatsNew } from '../../lib/ui-store';
import { canUpdate, checkForUpdates, installUpdate, useUpdates, type UpdateStatus } from '../updates/updater';

async function loadVersions() {
  if (!isTauri) {
    return { app: 'dev', tauri: '—' };
  }
  const [app, tauri] = await Promise.all([getVersion(), getTauriVersion()]);
  return { app, tauri };
}

function updateHint(status: UpdateStatus) {
  if (isDevBuild) {
    return 'The dev build does not update itself. Download a newer one from the dev release.';
  }
  if (!canUpdate) {
    return 'Updates only reach an installed copy of Diffity.';
  }
  if (status.kind === 'checking') {
    return 'Checking for updates…';
  }
  if (status.kind === 'upToDate') {
    return 'You are on the latest version.';
  }
  if (status.kind === 'available') {
    return `Diffity ${status.version} is available.`;
  }
  if (status.kind === 'installing') {
    return status.progress !== null && status.progress < 1
      ? `Downloading Diffity ${status.version}… ${Math.round(status.progress * 100)}%`
      : `Installing Diffity ${status.version}… it restarts on its own.`;
  }
  if (status.kind === 'installFailed') {
    return `Could not install Diffity ${status.version}: ${status.message}`;
  }
  if (status.kind === 'failed') {
    return `Could not check for updates: ${status.message}`;
  }
  return 'Diffity checks for updates on launch and every few hours.';
}

function UpdateControl(props: { status: UpdateStatus }) {
  const { status } = props;

  if (status.kind === 'available' || status.kind === 'installing' || status.kind === 'installFailed') {
    return (
      <SettingsButton variant="primary" busy={status.kind === 'installing'} onClick={() => void installUpdate()}>
        {status.kind === 'installFailed' ? 'Try again' : 'Restart to update'}
      </SettingsButton>
    );
  }
  return (
    <SettingsButton disabled={!canUpdate} busy={status.kind === 'checking'} onClick={() => void checkForUpdates({ asked: true })}>
      Check for updates
    </SettingsButton>
  );
}

export function AboutPane() {
  const { data: versions } = useQuery({ queryKey: ['app-versions'], queryFn: loadVersions, staleTime: Infinity });
  const status = useUpdates((state) => state.status);

  return (
    <PreferencesPane>
      <div className="flex items-center gap-3 pt-1">
        <BrandLogo className="h-10 w-10 shrink-0" />
        <div>
          <div className="text-[15px] font-semibold text-text">{isDevBuild ? 'Diffity Dev' : 'Diffity'}</div>
          <div className="text-xs text-text-muted">Review code changes with Claude Code or Codex, locally.</div>
        </div>
      </div>
      <PreferencesGroup label="Version">
        <PreferencesRow label="Diffity">
          <span className="font-mono text-xs text-text-secondary select-text">{versions?.app ?? '…'}</span>
        </PreferencesRow>
        <PreferencesRow label="Tauri runtime">
          <span className="font-mono text-xs text-text-secondary select-text">{versions?.tauri ?? '…'}</span>
        </PreferencesRow>
        <PreferencesRow label="Updates" hint={updateHint(status)}>
          <UpdateControl status={status} />
        </PreferencesRow>
        <PreferencesRow label="What’s new" hint="What changed in each release, with shortcuts to try the new features.">
          <SettingsButton onClick={openWhatsNew}>What’s new</SettingsButton>
        </PreferencesRow>
        <PreferencesRow label="Feedback" hint="Found a bug or have an idea? Opens a GitHub issue with your versions filled in.">
          <SettingsButton onClick={reportIssue}>Report an issue…</SettingsButton>
        </PreferencesRow>
      </PreferencesGroup>
      <PreferencesGroup label="Your data">
        <p className="pt-1.5 text-[12px] leading-relaxed text-text-secondary">
          Comments, reviews and settings live in a local database on this Mac. GitHub tokens are kept in the macOS
          keychain, or read from the GitHub CLI.
        </p>
      </PreferencesGroup>
    </PreferencesPane>
  );
}
