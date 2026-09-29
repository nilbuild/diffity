import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { buttonOutline, buttonPrimary } from '../../components/ui/button-styles';
import { getRepoPathOrNull } from '../../lib/api';
import { collapseContext, diffLines } from '../../lib/line-diff';
import { answerClaudePermission, useClaude } from './claude-runner';
import type { PermissionOption } from '../../lib/types';
import { SparkleIcon } from '../../components/ui/icon';
import { savePermissionSetting } from './permission-setting';

function isReject(option: PermissionOption) {
  return option.kind.startsWith('reject') || option.kind === 'deny';
}

function isAllowOnce(option: PermissionOption) {
  return option.kind === 'allow_once' || option.kind === 'allowOnce';
}

function relativePath(path: string) {
  const root = getRepoPathOrNull();
  if (!root) {
    return path;
  }
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
  const permission = useClaude((state) => state.permission);
  const [dontAsk, setDontAsk] = useState(false);

  const reject = permission?.options.find(isReject) ?? null;
  const allowOnce = permission?.options.find(isAllowOnce) ?? permission?.options.find((option) => !isReject(option)) ?? null;
  const isEdit = !!permission?.diff;

  const deny = () => {
    void answerClaudePermission(reject?.id ?? null);
  };

  const allow = (forRun: boolean) => {
    if (!allowOnce) {
      return;
    }
    if (dontAsk) {
      void savePermissionSetting('skip');
    }
    void answerClaudePermission(allowOnce.id, forRun || dontAsk);
  };

  useEffect(() => {
    setDontAsk(false);
  }, [permission?.requestId]);

  useEffect(() => {
    if (!permission) {
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        void answerClaudePermission(permission.options.find(isReject)?.id ?? null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [permission]);

  if (!permission) {
    return null;
  }

  const diff = permission.diff;
  const verb = diff ? (diff.oldText === null ? 'create' : 'edit') : 'run';
  const target = diff ? relativePath(diff.path) : permission.title;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-overlay ring-1 ring-overlay-border rounded-xl w-full max-w-2xl mx-4 overflow-hidden font-sans">
        <div className="flex items-start gap-2.5 px-4 pt-4 pb-3">
          <SparkleIcon className="w-4 h-4 mt-0.5 text-claude shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text">Claude wants to {verb} {diff ? 'a file' : 'a command'}</h3>
            <p className="text-xs text-text-muted font-mono break-all mt-0.5">{target}</p>
          </div>
        </div>
        {diff && <DiffPreview oldText={diff.oldText} newText={diff.newText} />}
        <div className="flex items-center gap-2 px-4 py-3">
          <label className="mr-auto flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(event) => setDontAsk(event.target.checked)}
              className="accent-primary"
            />
            Don’t ask again
            <span className="text-text-muted">(skip permission prompts)</span>
          </label>
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
