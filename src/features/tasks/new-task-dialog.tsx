import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn } from '../../lib/cn';
import { modKey } from '../../lib/platform';
import * as tauri from '../../lib/tauri';
import { buttonGhost, buttonPrimary, inputField } from '../../components/ui/button-styles';
import { Skeleton, useLatch } from '../../components/ui/skeleton';
import { guessBaseBranch, useBranches } from '../../hooks/use-repo-state';
import { repoBase } from '../../hooks/use-repo';
import { ModelPicker } from '../claude/model-picker';
import { useRunPick, writeRepoPick, type RunPick } from '../claude/model-setting';
import { useClaude } from '../claude/claude-runner';
import { closeNewTask, useNewTask } from './new-task-store';
import { branchFromTitle, startTask, titleFromPrompt, useAllTasks } from './tasks';

function localBase(name: string | null, locals: Set<string>): string | null {
  if (!name) {
    return null;
  }
  const short = name.replace(/^(origin|upstream)\//, '');
  return locals.has(short) ? short : name;
}

export function NewTaskDialog() {
  const repoPath = useNewTask((state) => state.repoPath);

  if (!repoPath) {
    return null;
  }
  return <NewTaskForm repoPath={repoPath} />;
}

function NewTaskForm(props: { repoPath: string }) {
  const { repoPath } = props;
  const navigate = useNavigate();
  const branchesQuery = useBranches();
  const branches = branchesQuery.data;
  const savedPick = useRunPick('fix', repoPath);
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? savedPick;
  const [prompt, setPrompt] = useState('');
  const [base, setBase] = useState<string | null>(null);
  const [branch, setBranch] = useState('');
  const [branchEdited, setBranchEdited] = useState(false);
  const [starting, setStarting] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const tasks = useAllTasks();
  const setupKey = `tasks.setup:${repoPath}`;
  const configQuery = useQuery({ queryKey: ['task-config', repoPath], queryFn: () => tauri.taskConfig(repoPath), staleTime: 60_000 });
  const savedSetupQuery = useQuery({ queryKey: ['setting', setupKey], queryFn: () => tauri.getSetting(setupKey), staleTime: 60_000 });
  const config = configQuery.data;
  const savedSetup = savedSetupQuery.data;
  // The setup row and the base branch are decided from loaded data, so they don't flip once it arrives.
  const setupReady = useLatch(!configQuery.isPending && !savedSetupQuery.isPending);
  const branchesReady = useLatch(!branchesQuery.isPending);
  const fileSetup = config?.fromFile ? config.setup ?? null : null;
  const knownSetup = fileSetup ?? (savedSetup || null) ?? config?.suggestedSetup ?? null;
  const [setupOn, setSetupOn] = useState<boolean | null>(null);
  const [setupText, setSetupText] = useState<string | null>(null);
  const setupCommand = setupText ?? knownSetup ?? '';
  const setupChecked = setupOn ?? (!!fileSetup || !!savedSetup);
  const running = useClaude((state) => state.runs.filter((run) => run.state === 'running' && tasks.some((task) => task.path === run.context.repoPath)).length);

  const locals = useMemo(() => new Set((branches ?? []).filter((item) => !item.isRemote).map((item) => item.name)), [branches]);
  const baseOptions = useMemo(() => (branches ?? []).filter((item) => !item.isRemote && !item.name.startsWith('diffity/')).map((item) => item.name), [branches]);
  const defaultBase = localBase(branches ? guessBaseBranch(branches, null) : null, locals);
  const effectiveBase = base ?? defaultBase ?? 'HEAD';
  const { data: checkout } = useQuery({ queryKey: ['checkout-status', repoPath], queryFn: () => tauri.gitStatus(repoPath), staleTime: 10_000 });
  const yourBranch = branchesReady && checkout?.branch && baseOptions.includes(checkout.branch) ? checkout.branch : null;
  const offerYourBranch = yourBranch !== null && yourBranch !== effectiveBase;
  const leavesChangesBehind = yourBranch !== null && yourBranch === effectiveBase && checkout?.dirty;
  const title = titleFromPrompt(prompt);
  const effectiveBranch = branchEdited ? branch : branchFromTitle(title);
  const canStart = title.length > 0 && !starting && effectiveBranch.trim().length > 0 && branchesReady && setupReady;

  useEffect(() => {
    promptRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        closeNewTask();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, []);

  const submit = async () => {
    if (!canStart) {
      return;
    }
    setStarting(true);
    try {
      writeRepoPick('fix', repoPath, pick);
      const setup = setupChecked && setupCommand.trim() ? setupCommand.trim() : null;
      if (!fileSetup && (setupOn !== null || setupText !== null)) {
        void tauri.setSetting(setupKey, setup ?? '').catch(() => undefined);
      }
      const task = await startTask({ repoPath, prompt: prompt.trim(), title, baseRef: effectiveBase, branch: effectiveBranch.trim(), pick, setup });
      closeNewTask();
      navigate(`${repoBase(task.path)}/diff?ref=${encodeURIComponent(task.baseRef)}`);
    } catch (error) {
      setStarting(false);
      toast.error('Could not start the task', { description: tauri.errorMessage(error) });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[12vh] px-4" onClick={closeNewTask}>
      <form
        role="dialog"
        aria-labelledby="new-task-title"
        className="bg-overlay ring-1 ring-overlay-border rounded-xl p-5 w-full max-w-[560px] flex flex-col gap-3.5"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-baseline gap-2">
          <h3 id="new-task-title" className="text-[15px] font-semibold text-text">New task</h3>
          <span className="text-xs text-text-muted truncate">Runs on its own branch, so your checkout stays as it is</span>
        </div>
        <textarea
          id="new-task-prompt"
          ref={promptRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
          rows={5}
          placeholder="What should the agent do?"
          className={cn(inputField, 'h-auto min-h-[112px] py-2 leading-5 resize-none')}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-text-secondary min-w-0">
            Base branch
            <select
              id="new-task-base"
              value={branchesReady ? effectiveBase : ''}
              disabled={!branchesReady}
              onChange={(event) => setBase(event.target.value)}
              className={cn(inputField, 'pr-7 cursor-pointer disabled:cursor-default')}
            >
              {!branchesReady && <option value="" />}
              {branchesReady && !baseOptions.includes(effectiveBase) && <option value={effectiveBase}>{effectiveBase}</option>}
              {branchesReady && baseOptions.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-text-secondary min-w-0">
            Branch
            <input
              id="new-task-branch"
              value={effectiveBranch}
              onChange={(event) => {
                setBranchEdited(true);
                setBranch(event.target.value);
              }}
              spellCheck={false}
              className={cn(inputField, 'font-mono text-xs')}
            />
          </label>
        </div>
        {offerYourBranch && (
          <p className="-mt-1.5 text-xs text-text-muted">
            <button type="button" onClick={() => setBase(yourBranch)} className="text-text-secondary hover:text-text hover:underline underline-offset-2 cursor-pointer">
              Start from {yourBranch}
            </button>
            , the branch your checkout is on
          </p>
        )}
        {leavesChangesBehind && (
          <p className="-mt-1.5 text-xs text-text-muted">Starts from the last commit: your uncommitted changes stay in your checkout.</p>
        )}
        {!setupReady && (
          <div aria-busy className="flex items-center gap-2 h-6">
            <Skeleton className="w-3.5 h-3.5" />
            <Skeleton className="w-14 h-3" />
            <Skeleton className="flex-1 h-6 rounded-md" />
          </div>
        )}
        {setupReady && knownSetup !== null && (
          <div className="flex items-center gap-2 min-w-0 text-[13px] text-text">
            <input
              id="new-task-setup-on"
              type="checkbox"
              checked={setupChecked}
              onChange={(event) => setSetupOn(event.target.checked)}
              className="shrink-0 accent-[var(--color-primary)] cursor-pointer"
            />
            <label htmlFor="new-task-setup-on" className="shrink-0 cursor-pointer">Run first</label>
            <input
              id="new-task-setup"
              value={setupCommand}
              onChange={(event) => {
                setSetupText(event.target.value);
                setSetupOn(true);
              }}
              spellCheck={false}
              aria-label="Setup command"
              className={cn(inputField, 'h-6 font-mono text-xs flex-1 min-w-0', !setupChecked && 'text-text-muted')}
            />
            <span className="shrink-0 text-xs text-text-muted" title={fileSetup ? 'From .diffity/workspace.json' : 'Guessed from the lockfile; saved for this repository once you use it'}>
              {fileSetup ? 'workspace.json' : 'before the agent'}
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <ModelPicker value={pick} onChange={setPicked} className="-ml-1.5" />
          <span className="flex-1" />
          {running > 0 && <span className="text-xs text-text-muted shrink-0">{running} running</span>}
          <button type="button" onClick={closeNewTask} className={buttonGhost}>Cancel</button>
          <button type="submit" disabled={!canStart} className={buttonPrimary}>
            {starting ? 'Starting…' : 'Start task'}
            <span className="opacity-70 text-xs">{modKey}↵</span>
          </button>
        </div>
      </form>
    </div>
  );
}
