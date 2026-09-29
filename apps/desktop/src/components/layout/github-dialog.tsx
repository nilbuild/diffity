import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { toast } from 'sonner';
import { GitHubIcon } from '../icons/github-icon';
import { UploadIcon } from '../icons/upload-icon';
import { DownloadIcon } from '../icons/download-icon';
import { XIcon } from '../icons/x-icon';
import { KeyIcon } from '../icons/key-icon';
import { ExternalLinkIcon } from '../icons/external-link-icon';
import {
  errorMessage,
  fetchPushableThreads,
  getRepoPath,
  pullCommentsFromGitHub,
  pushCommentsToGitHub,
  type GitHubDetails,
} from '../../lib/api';
import * as tauri from '../../lib/tauri';
import type { GithubAuthStatus } from '../../lib/types';
import { useRepoNav } from '../../hooks/use-repo';

dayjs.extend(relativeTime);

interface GitHubDialogProps {
  details: GitHubDetails | null;
  currentRef?: string;
  onPulled: () => void;
  onClose: () => void;
}

const buttonSpinner = 'w-3 h-3 border-2 rounded-full animate-spin';

function prRef(details: GitHubDetails) {
  return `origin/${details.baseRef}...HEAD`;
}

export function GitHubDialog(props: GitHubDialogProps) {
  const { details, currentRef, onPulled, onClose } = props;
  const queryClient = useQueryClient();
  const { data: auth, isLoading: authLoading } = useQuery({
    queryKey: ['github-auth'],
    queryFn: tauri.githubAuthStatus,
  });

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleAuthChanged = (status: GithubAuthStatus) => {
    queryClient.setQueryData(['github-auth'], status);
    queryClient.invalidateQueries({ queryKey: ['github-details'] });
  };

  const handleSignOut = async () => {
    await tauri.githubLogout().catch((error) => toast.error(errorMessage(error)));
    queryClient.invalidateQueries({ queryKey: ['github-auth'] });
    queryClient.setQueryData(['github-details'], null);
  };

  const renderBody = () => {
    if (authLoading) {
      return <div className="px-4 pb-4 text-xs text-text-muted">Checking GitHub account…</div>;
    }
    if (!auth?.authenticated) {
      return <SignInPanel onSignedIn={handleAuthChanged} />;
    }
    if (!details) {
      return (
        <div className="px-4 pb-4 pt-2">
          <div className="py-2.5 px-3 bg-bg-secondary rounded-lg">
            <div className="text-xs font-medium text-text">No open pull request</div>
            <div className="text-[11px] text-text-muted mt-0.5">Push this branch and open a PR on GitHub to sync comments.</div>
          </div>
        </div>
      );
    }
    return <PrPanel details={details} currentRef={currentRef} onPulled={onPulled} />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-bg rounded-xl shadow-lg w-full max-w-sm mx-4 font-sans"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 pt-4 pb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <GitHubIcon className="w-4 h-4 text-text shrink-0" />
              <span className="text-sm font-semibold text-text truncate">{details && auth?.authenticated ? details.prTitle : 'GitHub'}</span>
            </div>
            {details && auth?.authenticated ? (
              <div className="flex items-center gap-1.5 text-[11px] text-text-muted pl-6">
                <span>#{details.prNumber}</span>
                {details.prCreatedAt && (
                  <>
                    <span>&middot;</span>
                    <span>opened {dayjs(details.prCreatedAt).fromNow()}</span>
                  </>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-text-muted pl-6">Sync review comments with pull requests</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-text-muted hover:text-text hover:bg-hover transition-colors cursor-pointer shrink-0 mt-0.5"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {renderBody()}

        {auth?.authenticated && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border text-[11px] text-text-muted">
            <span>
              Signed in as <span className="font-medium text-text-secondary">{auth.login ?? 'unknown'}</span>
              {auth.source === 'gh' ? ' via GitHub CLI' : ''}
            </span>
            <button onClick={handleSignOut} className="hover:text-text transition-colors cursor-pointer">
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SignInPanel(props: { onSignedIn: (status: GithubAuthStatus) => void }) {
  const { onSignedIn } = props;
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<'gh' | 'token' | null>(null);

  const importFromGh = async () => {
    setBusy('gh');
    try {
      const status = await tauri.githubImportGhToken();
      onSignedIn(status);
      toast.success(`Signed in as ${status.login ?? 'GitHub user'}`);
    } catch (error) {
      toast.error('Could not import the GitHub CLI token', { description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const saveToken = async () => {
    if (!token.trim()) {
      return;
    }
    setBusy('token');
    try {
      const status = await tauri.githubSetToken(token.trim());
      setToken('');
      onSignedIn(status);
      toast.success(`Signed in as ${status.login ?? 'GitHub user'}`);
    } catch (error) {
      toast.error('Token was rejected', { description: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="px-4 pb-4 pt-2 space-y-2">
      <div className="flex items-center justify-between py-2.5 px-3 bg-bg-secondary rounded-lg">
        <div>
          <div className="text-xs font-medium text-text">Use the GitHub CLI</div>
          <div className="text-[11px] text-text-muted mt-0.5">Imports the token from <code className="font-mono">gh auth token</code></div>
        </div>
        <button
          onClick={importFromGh}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          {busy === 'gh' ? <span className={`${buttonSpinner} border-white/30 border-t-white`} /> : <GitHubIcon className="w-3 h-3" />}
          Import
        </button>
      </div>

      <div className="py-2.5 px-3 bg-bg-secondary rounded-lg">
        <div className="text-xs font-medium text-text">Or paste a personal access token</div>
        <div className="text-[11px] text-text-muted mt-0.5 mb-2">Needs the <code className="font-mono">repo</code> scope. Stored in the macOS keychain.</div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveToken();
          }}
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_…"
            className="flex-1 min-w-0 text-xs bg-bg border border-border rounded-md px-2.5 py-1.5 text-text placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy !== null || !token.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-bg-tertiary text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {busy === 'token' ? <span className={`${buttonSpinner} border-text-muted/30 border-t-text-muted`} /> : <KeyIcon className="w-3 h-3" />}
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

function PrPanel(props: { details: GitHubDetails; currentRef?: string; onPulled: () => void }) {
  const { details, currentRef, onPulled } = props;
  const nav = useRepoNav();
  const [commentCount, setCommentCount] = useState(details.commentCount);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const { data: pushable = [], refetch } = useQuery({
    queryKey: ['github-pushable', details.prNumber],
    queryFn: () => fetchPushableThreads(details.prNumber),
  });

  const prSession = async () => {
    const session = await tauri.getSession(getRepoPath(), prRef(details));
    return session.id;
  };

  const handlePush = async () => {
    if (pushable.length === 0) {
      return;
    }
    setPushing(true);
    try {
      const sessionId = await prSession();
      const result = await pushCommentsToGitHub(sessionId, details.prNumber, pushable.map((thread) => thread.id));
      if (result.failed > 0) {
        const pushedMsg = result.pushed > 0 ? `${result.pushed} pushed, ` : '';
        toast.error(`${pushedMsg}${result.failed} failed`, {
          description: result.errors.join('\n'),
        });
      } else if (result.pushed === 0 && result.skipped > 0) {
        toast.info('All comments already exist on the PR');
      } else {
        const skippedMsg = result.skipped > 0 ? ` (${result.skipped} already existed)` : '';
        toast.success(`Pushed ${result.pushed} comment${result.pushed !== 1 ? 's' : ''} to PR${skippedMsg}`);
      }
      setCommentCount(prev => prev + result.pushed);
      void refetch();
    } catch (err) {
      toast.error('Failed to push comments', { description: errorMessage(err) });
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      const sessionId = await prSession();
      const result = await pullCommentsFromGitHub(sessionId, details.prNumber);
      const changed = result.pulled + result.updated;
      if (changed === 0 && result.skipped > 0) {
        toast.info('All GitHub comments already exist locally');
      } else if (changed > 0) {
        toast.success(`Pulled ${result.pulled} comment${result.pulled !== 1 ? 's' : ''} from PR${result.updated > 0 ? `, updated ${result.updated}` : ''}`);
        onPulled();
        if (result.pulled > 0 && currentRef !== prRef(details)) {
          nav.toDiff(prRef(details));
        }
      } else {
        toast.info('No review comments on the PR');
      }
    } catch (err) {
      toast.error('Failed to pull comments', { description: errorMessage(err) });
    } finally {
      setPulling(false);
    }
  };

  return (
    <div className="px-4 pb-4 pt-2 space-y-2">
      <div className="flex items-center justify-between py-2.5 px-3 bg-bg-secondary rounded-lg">
        <div>
          <div className="text-xs font-medium text-text">
            {pushable.length > 0
              ? `${pushable.length} comment${pushable.length !== 1 ? 's' : ''} to push`
              : 'No comments to push'}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">
            {pushable.length > 0 ? 'Open comments on lines in this PR' : 'Comments already on the PR are skipped'}
          </div>
        </div>
        {pushable.length > 0 && (
          <button
            onClick={handlePush}
            disabled={pushing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {pushing ? (
              <span className={`${buttonSpinner} border-white/30 border-t-white`} />
            ) : (
              <UploadIcon className="w-3 h-3" />
            )}
            Push to PR
          </button>
        )}
      </div>

      <div className="flex items-center justify-between py-2.5 px-3 bg-bg-secondary rounded-lg">
        <div>
          <div className="text-xs font-medium text-text">
            {commentCount} thread{commentCount !== 1 ? 's' : ''} on GitHub
          </div>
          <div className="text-[11px] text-text-muted mt-0.5">Review comments on the PR</div>
        </div>
        {commentCount > 0 && (
          <button
            onClick={handlePull}
            disabled={pulling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-bg-tertiary text-text-secondary hover:text-text transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {pulling ? (
              <span className={`${buttonSpinner} border-text-muted/30 border-t-text-muted`} />
            ) : (
              <DownloadIcon className="w-3 h-3" />
            )}
            Pull from PR
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {currentRef !== prRef(details) && (
          <button
            onClick={() => nav.toDiff(prRef(details))}
            className="flex-1 py-2 text-xs text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            View PR diff
          </button>
        )}
        <a
          href={details.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 py-2 text-xs text-text-muted hover:text-text transition-colors"
        >
          Open on GitHub
          <ExternalLinkIcon className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
