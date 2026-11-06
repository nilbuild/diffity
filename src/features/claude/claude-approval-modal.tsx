import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { cn } from '../../lib/cn';
import { buttonGhost, buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { collapseContext, diffLines } from '../../lib/line-diff';
import { answerClaudePermission, useClaude } from './claude-runner';
import { useRepoPath } from '../../hooks/use-repo';
import type { PermissionOption } from '../../lib/types';
import { SparkleIcon } from '../../components/ui/icon';
import { agentMeta } from './agents';
import { taskForPath, useAllTasks } from '../tasks/tasks';
import { openSettingsAt } from '../../lib/ui-store';

/** Requests put aside with Esc or "Later"; they stay pending until answered from the status pill or the activity panel. */
const useLaterApprovals = create<{ ids: string[] }>(() => ({ ids: [] }));

export function hideApproval(requestId: string) {
  useLaterApprovals.setState((state) => ({ ids: [...state.ids, requestId] }));
}

/** Brings back the approvals put aside in a project. */
export function showApprovals(repoPath: string) {
  const asked = new Set(useClaude.getState().permissions.filter((item) => item.repoPath === repoPath).map((item) => item.requestId));
  useLaterApprovals.setState((state) => ({ ids: state.ids.filter((id) => !asked.has(id)) }));
}

/** How many of a project's requests wait behind "Later". */
export function useWaitingApprovals(repoPath: string): number {
  const later = useLaterApprovals((state) => state.ids);
  return useClaude((state) => state.permissions.filter((item) => item.repoPath === repoPath && later.includes(item.requestId)).length);
}

function isReject(option: PermissionOption) {
  return option.kind.startsWith('reject') || option.kind === 'deny';
}

function isAllowOnce(option: PermissionOption) {
  return option.kind === 'allow_once' || option.kind === 'allowOnce';
}

function relativePath(path: string, root: string) {
  const prefix = root.endsWith('/') ? root : `${root}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function DiffPreview(props: { oldText: string | null; newText: string }) {
  const { oldText, newText } = props;
  const rows = useMemo(() => collapseContext(diffLines(oldText ?? '', newText), 3), [oldText, newText]);

  return (
    <div className="max-h-[50vh] overflow-auto border-y border-border bg-bg font-mono text-[12px] leading-5">
      <table className="w-full border-collapse">
        <tbody>
          {rows.map((row, index) => {
            if (!row) {
              return (
                <tr key={`gap-${index}`}>
                  <td className="px-3 py-0.5 bg-diff-hunk-bg text-diff-hunk-text text-[11px]" colSpan={2}>⋯</td>
                </tr>
              );
            }
            return (
              <tr key={index} className={cn(row.type === 'add' && 'bg-diff-add-bg', row.type === 'delete' && 'bg-diff-del-bg')}>
                <td className="w-5 select-none text-center text-text-muted align-top">
                  {row.type === 'add' ? '+' : row.type === 'delete' ? '-' : ''}
                </td>
                <td className="pr-3 whitespace-pre text-text">{row.text || ' '}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ClaudeApprovalModal() {
  const repoPath = useRepoPath();
  const tasks = useAllTasks();
  const later = useLaterApprovals((state) => state.ids);
  const permission = useClaude((state) => {
    const shown = state.permissions.filter((item) => !later.includes(item.requestId));
    return shown.find((item) => item.repoPath === repoPath) ?? shown[0] ?? null;
  });
  const agentId = useClaude((state) => state.runs.find((run) => run.id === permission?.runId)?.agentId ?? null);
  const name = agentId ? agentMeta(agentId).short : 'The agent';

  const reject = permission?.options.find(isReject) ?? null;
  const allowOnce = permission?.options.find(isAllowOnce) ?? permission?.options.find((option) => !isReject(option)) ?? null;
  const isEdit = !!permission?.diff;

  const deny = () => {
    if (!permission) {
      return;
    }
    void answerClaudePermission(permission.requestId, reject?.id ?? null);
  };

  const allow = (forRun: boolean) => {
    if (!permission || !allowOnce) {
      return;
    }
    void answerClaudePermission(permission.requestId, allowOnce.id, forRun);
  };

  const requestId = permission?.requestId ?? null;
  useEffect(() => {
    if (!requestId) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      hideApproval(requestId);
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [requestId]);

  if (!permission) {
    return null;
  }

  const diff = permission.diff;
  const verb = diff ? (diff.oldText === null ? 'create' : 'edit') : 'run';
  const target = diff ? relativePath(diff.path, permission.repoPath) : permission.title;
  const askingTask = taskForPath(tasks, permission.repoPath);
  const otherProject = permission.repoPath !== repoPath ? askingTask?.title ?? permission.repoPath.split('/').filter(Boolean).pop() : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-overlay ring-1 ring-overlay-border rounded-xl w-full max-w-2xl mx-4 overflow-hidden font-sans">
        <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
          <SparkleIcon className="w-4 h-4 mt-0.5 text-claude shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">{name} wants to {verb} {diff ? 'a file' : 'a command'}{otherProject && ` in ${otherProject}`}</h3>
            <p className="text-xs text-text-muted font-mono break-all mt-0.5">{target}</p>
          </div>
        </div>
        {diff && <DiffPreview oldText={diff.oldText} newText={diff.newText} />}
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              hideApproval(permission.requestId);
              openSettingsAt('agents');
            }}
            className="mr-auto text-xs text-text-secondary hover:text-text underline decoration-text-muted/50 underline-offset-2 cursor-pointer"
            title="Choose when agents ask before editing files, in Settings → Agents"
          >
            Ask less often…
          </button>
          <button
            onClick={() => hideApproval(permission.requestId)}
            className={buttonGhost}
            title={`Esc. ${name} keeps waiting; answer from its status in the title bar.`}
          >
            Later
          </button>
          <button onClick={deny} className={buttonOutline}>
            Deny
          </button>
          <button
            onClick={() => allow(false)}
            disabled={!allowOnce}
            className={isEdit ? buttonOutline : buttonPrimary}
            autoFocus={!isEdit}
          >
            Allow once
          </button>
          {isEdit && (
            <button
              onClick={() => allow(true)}
              disabled={!allowOnce}
              className={buttonPrimary}
              title="Approve this edit and every later edit in this run. Commands still ask."
              autoFocus
            >
              Allow for this run
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
