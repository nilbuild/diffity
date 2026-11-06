import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { openUrl } from '@tauri-apps/plugin-opener';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import * as tauri from '../../lib/tauri';
import type { Task } from '../../lib/types';
import { buttonGhost, buttonOutline, buttonPrimary, inputField } from '../../components/ui/button-styles';
import { ChevronDownIcon, EditorIcon, ExternalLinkIcon, GitMergeIcon, GitPullRequestIcon, PullIcon, TrashIcon } from '../../components/ui/icon';
import { MenuItem, MenuSeparator, Popover, useMenu } from '../../components/ui/popover';
import { ConfirmDialog } from '../../components/ui/confirm-dialog';
import { openInEditor } from '../../lib/api';
import { repoBase, useRepoPath } from '../../hooks/use-repo';
import { shortPath } from '../welcome/recent-repos';
import { archiveMessage, archiveTask, isBusy, updateFromBase, useArchiveCommand, useTaskBase, useTaskForPath, useTaskStatus } from './tasks';

function useEscape(onClose: () => void) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);
}

function DialogShell(props: { title: string; detail: string; onClose: () => void; onSubmit: () => void; children: ReactNode; footer: ReactNode }) {
  const { title, detail, onClose, onSubmit, children, footer } = props;
  useEscape(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh] px-4" onClick={onClose}>
      <form
        role="dialog"
        aria-label={title}
        className="bg-overlay ring-1 ring-overlay-border rounded-xl p-5 w-full max-w-[560px] flex flex-col gap-3.5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[15px] font-semibold text-text">{title}</h3>
          <p className="text-xs text-text-secondary">{detail}</p>
        </div>
        {children}
        <div className="flex items-center gap-2 justify-end">{footer}</div>
      </form>
    </div>
  );
}

function PullRequestDialog(props: { task: Task; onClose: () => void }) {
  const { task, onClose } = props;
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.prompt);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.select();
  }, []);

  const submit = async () => {
    if (!title.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      const pr = await tauri.shipTaskPr(task.id, title.trim(), body, draft);
      onClose();
      toast.success(`Opened pull request #${pr.number}`, { action: { label: 'Open', onClick: () => void openUrl(pr.url) } });
    } catch (error) {
      setBusy(false);
      toast.error('Could not create the pull request', { description: tauri.errorMessage(error) });
    }
  };

  return (
    <DialogShell
      title="Create pull request"
      detail={`Squashes ${task.rounds} round${task.rounds === 1 ? '' : 's'} into one commit (your commit hooks run), pushes ${task.branch} and opens a PR into ${task.baseRef}.`}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-[13px] text-text cursor-pointer">
            <input id="pr-draft" type="checkbox" checked={draft} onChange={(event) => setDraft(event.target.checked)} className="accent-[var(--color-primary)]" />
            Draft
          </label>
          <button type="button" onClick={onClose} className={buttonGhost}>Cancel</button>
          <button type="submit" disabled={!title.trim() || busy} className={buttonPrimary}>{busy ? 'Creating…' : 'Create pull request'}</button>
        </>
      }
    >
      <input id="pr-title" ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Title" className={inputField} />
      <textarea
        id="pr-body"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={8}
        aria-label="Description"
        placeholder="Description"
        className={cn(inputField, 'h-auto py-2 leading-5 resize-y min-h-[140px]')}
      />
    </DialogShell>
  );
}

function MergeDialog(props: { task: Task; onClose: () => void; onMerged: () => void }) {
  const { task, onClose, onMerged } = props;
  const [message, setMessage] = useState(task.title);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!message.trim() || busy) {
      return;
    }
    setBusy(true);
    try {
      await tauri.mergeTaskLocally(task.id, message.trim());
      onClose();
      onMerged();
    } catch (error) {
      setBusy(false);
      toast.error(`Could not merge into ${task.baseRef}`, { description: tauri.errorMessage(error) });
    }
  };

  return (
    <DialogShell
      title={`Merge into ${task.baseRef}`}
      detail={`Squash-merges ${task.branch} into ${task.baseRef} in ${shortPath(task.repoPath)} as one commit. Your checkout must be on ${task.baseRef} with nothing uncommitted.`}
      onClose={onClose}
      onSubmit={() => void submit()}
      footer={
        <>
          <button type="button" onClick={onClose} className={buttonGhost}>Cancel</button>
          <button type="submit" disabled={!message.trim() || busy} className={buttonPrimary}>{busy ? 'Merging…' : 'Merge'}</button>
        </>
      }
    >
      <textarea
        id="merge-message"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={3}
        aria-label="Commit message"
        className={cn(inputField, 'h-auto py-2 leading-5 resize-y font-mono text-xs')}
      />
    </DialogShell>
  );
}

/** Title bar menu for getting a task's work out: a pull request, a local merge, catching up with the base. */
export function ShipMenu() {
  const repoPath = useRepoPath();
  const task = useTaskForPath(repoPath);
  const status = useTaskStatus(task);
  const { data: base } = useTaskBase(task);
  const navigate = useNavigate();
  const menu = useMenu();
  const [dialog, setDialog] = useState<'pr' | 'merge' | 'archive' | null>(null);
  const archiveCommand = useArchiveCommand(task?.repoPath ?? null);

  const busy = isBusy(status);
  if (!task || (busy && !menu.open && dialog === null)) {
    return null;
  }
  const behind = base?.behind ?? 0;
  const run = (action: () => void) => () => {
    menu.close();
    action();
  };
  const archive = async () => {
    setDialog(null);
    if (await archiveTask(task)) {
      navigate(`${repoBase(task.repoPath)}/overview`);
    }
  };

  return (
    <>
      <button
        ref={menu.anchorRef}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        title={behind > 0 ? `Ship this task · ${task.baseRef} has ${behind} new commit${behind === 1 ? '' : 's'}` : 'Ship this task'}
        className={cn(buttonOutline, 'relative gap-1.5 px-2.5 @max-4xl/titlebar:px-2', menu.open && 'bg-control-hover')}
      >
        {task.mergedAt ? <GitMergeIcon size="sm" className="text-text-secondary" /> : <GitPullRequestIcon size="sm" className={task.prNumber ? 'text-added' : 'text-text-secondary'} />}
        <span className="@max-4xl/titlebar:hidden">{task.prNumber ? `#${task.prNumber}` : 'Ship'}</span>
        <ChevronDownIcon size="xs" className="text-text-secondary @max-4xl/titlebar:hidden" />
        {behind > 0 && <span aria-hidden className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary ring-2 ring-frame" />}
      </button>
      <Popover open={menu.open} onClose={menu.close} anchorRef={menu.anchorRef} align="end" width={300}>
        {task.prUrl && (
          <MenuItem icon={<ExternalLinkIcon size="sm" />} label={`Open pull request #${task.prNumber}`} onSelect={run(() => void openUrl(task.prUrl!))} />
        )}
        <MenuItem
          icon={<GitPullRequestIcon size="sm" className="text-added" />}
          label={task.prNumber ? 'Push rounds to the pull request' : 'Create pull request…'}
          disabled={busy || task.rounds === 0}
          onSelect={run(() => {
            if (!task.prNumber) {
              setDialog('pr');
              return;
            }
            void tauri
              .shipTaskPr(task.id, task.title, task.prompt, false)
              .then(() => toast.success(`Pushed to pull request #${task.prNumber}`))
              .catch((error) => toast.error('Could not push', { description: tauri.errorMessage(error) }));
          })}
        />
        {!(task.prNumber && !task.mergedAt) && (
          <MenuItem
            icon={<GitMergeIcon size="sm" />}
            label={`Merge into ${task.baseRef}…`}
            disabled={busy || task.rounds === 0 || !!task.mergedAt}
            onSelect={run(() => setDialog('merge'))}
          />
        )}
        <MenuItem
          icon={<PullIcon size="sm" />}
          label={behind > 0 ? `Update from ${task.baseRef} (${behind} new)` : `Up to date with ${task.baseRef}`}
          disabled={busy || behind === 0 || base?.merging}
          onSelect={run(() => void updateFromBase(task))}
        />
        <MenuSeparator />
        <MenuItem icon={<EditorIcon size="sm" />} label="Open in editor" onSelect={run(() => void openInEditor('').catch(() => undefined))} />
        <MenuItem
          icon={<TrashIcon size="sm" />}
          label={busy ? 'Archive task… (stop the agent first)' : 'Archive task…'}
          disabled={busy}
          onSelect={run(() => setDialog('archive'))}
        />
      </Popover>
      {dialog === 'pr' && <PullRequestDialog task={task} onClose={() => setDialog(null)} />}
      {dialog === 'merge' && (
        <MergeDialog
          task={task}
          onClose={() => setDialog(null)}
          onMerged={() => toast.success(`Merged into ${task.baseRef}`, { action: { label: 'Archive task', onClick: () => void archive() } })}
        />
      )}
      {dialog === 'archive' && (
        <ConfirmDialog
          title={`Archive “${task.title}”?`}
          message={archiveMessage(task, shortPath(task.path), archiveCommand)}
          confirmLabel="Archive"
          onCancel={() => setDialog(null)}
          onConfirm={() => void archive()}
        />
      )}
    </>
  );
}
