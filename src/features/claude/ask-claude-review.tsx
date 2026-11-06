import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { cn } from '../../lib/cn';
import { getRepoPath, parseCommitRef } from '../../lib/api';
import * as tauri from '../../lib/tauri';
import { diffOptions } from '../../queries/diff';
import { getFilePath } from '../../lib/diff-utils';
import { modKey } from '../../lib/platform';
import { Popover } from '../../components/ui/popover';
import { buttonClaudeSolid, buttonGhost, inputField } from '../../components/ui/button-styles';
import { SparkleIcon } from '../../components/ui/icon';
import { enqueueClaude, useActiveRun, useCanEditRef } from './claude-runner';
import { SegmentedToggle } from '../../components/ui/segmented-toggle';
import { ModelPicker } from './model-picker';
import { useRunPick, writeRepoPick, type RunPick } from './model-setting';
import { agentMeta } from './agents';
import { useGitHubPr } from '../../hooks/use-repo-state';
import { useRepoNav } from '../../hooks/use-repo';
import { prBaseFor, prRefFor } from '../../lib/pr-ref';
import { useCommitDetails } from '../../components/layout/diff-context-bar';
import { viewLabel } from '../../lib/thread-location';
import { FocusChips } from './review-focus-chips';
import { focusesForRepo, reviewRequest, useCustomFocuses } from './review-focuses';
import { clearDraft, draftKey, useDraft } from './agent-drafts';
import { toast } from 'sonner';

export { REVIEW_FOCUSES } from './review-focuses';

type Scope = 'all' | 'file' | 'glob';

/** A review only leaves comments; changes edit the working tree. */
export type Task = 'review' | 'change';

/** Instructions that ask for edits rather than a review, e.g. "remove the debug logs". */
export function readsAsChangeRequest(text: string): boolean {
  return /^\s*(?:please\s+|can you\s+|could you\s+)?(?:remove|delete|add|rename|fix|change|replace|refactor|update|move|rewrite|convert|implement|make|drop|clean up|extract|inline|format)\b/i.test(text);
}

/** The agent's message for a change: the request, the files it may touch, and the file on screen ("this file"). */
export function changeRequest(text: string, paths: string[], diffRef: string, focusedFile?: string | null): string {
  const scope = paths.length > 0
    ? `Only change these files: ${paths.map((path) => `\`${path}\``).join(', ')}.`
    : `Work on the files changed in \`${diffRef}\` unless the request needs others.`;
  const onScreen = focusedFile ? ` The user is looking at \`${focusedFile}\`, so "this file" means that one.` : '';
  return `${text.trim()}\n\n${scope}${onScreen}`;
}

const FOCUS_KEY = 'diffity-claude-focus:';

function readFocus(repoPath: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOCUS_KEY + repoPath) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeFocus(repoPath: string, focus: string[]) {
  try {
    localStorage.setItem(FOCUS_KEY + repoPath, JSON.stringify(focus));
  } catch {
    return;
  }
}

export function globToRegExp(glob: string): RegExp {
  let pattern = '';
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === '*' && glob[index + 1] === '*') {
      pattern += '.*';
      index += 1;
      if (glob[index + 1] === '/') {
        index += 1;
      }
      continue;
    }
    if (char === '*') {
      pattern += '[^/]*';
      continue;
    }
    if (char === '?') {
      pattern += '[^/]';
      continue;
    }
    pattern += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const anchored = glob.includes('/') ? `^${pattern}$` : `(^|/)${pattern}$`;
  return new RegExp(anchored);
}

/** Lets other places (Home's row menus) open the popover on the diff toolbar for a ref. */
export const useAskClaudeRequest = create<{ ref: string | null }>(() => ({ ref: null }));

export function requestAskClaude(ref: string) {
  useAskClaudeRequest.setState({ ref });
}

/** What the agent will read, named plainly, so a commit or an old view is never mistaken for the pull request. */
function ReviewTarget(props: { diffRef: string; onClose: () => void }) {
  const { diffRef, onClose } = props;
  const nav = useRepoNav();
  const { details } = useGitHubPr();
  const commitSha = parseCommitRef(diffRef);
  const { data: commit } = useCommitDetails(commitSha);
  const pr = details?.pr ?? null;
  const isPr = !!pr && (diffRef === prRefFor(pr) || diffRef === prBaseFor(pr));
  let label = viewLabel(diffRef);
  if (isPr && pr) {
    label = `Pull request #${pr.number} · ${pr.title}`;
  } else if (commitSha) {
    const subject = commit?.message.split('\n')[0];
    label = subject ? `Commit ${commitSha.slice(0, 7)} · ${subject}` : `Commit ${commitSha.slice(0, 7)}`;
  }
  const reviewPr = pr && !isPr ? () => {
    onClose();
    nav.toDiff(prRefFor(pr));
    requestAskClaude(prRefFor(pr));
  } : null;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="shrink-0 text-text-secondary">Reviews</span>
        <span className="min-w-0 truncate font-medium text-text" title={diffRef}>{label}</span>
      </div>
      {reviewPr && pr && (
        <div className="flex items-center gap-1.5 min-w-0 text-text-muted">
          <span className="min-w-0 truncate">Only this view, not all of pull request #{pr.number}.</span>
          <button type="button" onClick={reviewPr} className="shrink-0 text-text-secondary hover:text-text underline underline-offset-2 cursor-pointer">
            Review #{pr.number} instead
          </button>
        </div>
      )}
    </div>
  );
}

interface AskClaudePanelProps {
  diffRef: string;
  sessionId: string | null;
  focusedFile?: string | null;
  onStarted?: () => void;
  onClose: () => void;
  /** Set by a host that picks the task itself (its own tabs); the panel then drops its header. */
  task?: Task;
  onTaskChange?: (task: Task) => void;
}

export function AskClaudePanel(props: AskClaudePanelProps) {
  const { diffRef, sessionId, focusedFile, onStarted, onClose, task: hostTask, onTaskChange } = props;
  const repoPath = getRepoPath();
  const queued = !!useActiveRun(repoPath);
  const textKey = draftKey('instructions', repoPath, diffRef);
  const [text, setText] = useDraft(textKey);
  const canChange = useCanEditRef(repoPath, diffRef);
  const [ownTask, setOwnTask] = useState<Task>('review');
  const task = hostTask ?? ownTask;
  const setTask = (value: Task) => {
    setOwnTask(value);
    onTaskChange?.(value);
  };
  const changing = task === 'change' && canChange;
  const [focus, setFocus] = useState<string[]>(() => readFocus(repoPath));
  const customFocuses = focusesForRepo(useCustomFocuses().all, repoPath);
  const [scope, setScope] = useState<Scope>('all');
  const [glob, setGlob] = useState('');
  const reviewPick = useRunPick('review', repoPath);
  const fixPick = useRunPick('fix', repoPath);
  const [picked, setPicked] = useState<RunPick | null>(null);
  const pick = picked ?? (changing ? fixPick : reviewPick);
  const agent = agentMeta(pick.agent);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const { data: diff } = useQuery(diffOptions(false, diffRef));
  const files = useMemo(() => diff?.files.map((file) => getFilePath(file)) ?? [], [diff]);
  const globMatches = useMemo(() => {
    const trimmed = glob.trim();
    if (!trimmed) {
      return [];
    }
    const regex = globToRegExp(trimmed);
    return files.filter((file) => regex.test(file));
  }, [glob, files]);

  useEffect(() => {
    setPicked(null);
  }, [task]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => textRef.current?.focus()));
    return () => cancelAnimationFrame(frame);
  }, [task]);

  const paths = scope === 'file' && focusedFile ? [focusedFile] : scope === 'glob' ? globMatches : [];
  const blocked = (scope === 'glob' && globMatches.length === 0) || (changing && !text.trim());
  const suggestChange = !changing && canChange && readsAsChangeRequest(text);

  const start = async () => {
    if (blocked) {
      return;
    }
    if (picked) {
      writeRepoPick(changing ? 'fix' : 'review', repoPath, picked);
    }
    const session = sessionId ?? (await tauri.getSession(repoPath, diffRef).catch(() => null))?.id ?? null;
    const started = () => {
      clearDraft(textKey);
      onClose();
      onStarted?.();
      if (queued) {
        toast(`Queued for ${agent.short}`, { description: 'It starts when the current run finishes.' });
      }
    };
    if (changing) {
      enqueueClaude({ kind: 'chat' }, { repoPath, sessionId: session, ref: diffRef, pick, text: changeRequest(text, paths, diffRef, focusedFile) });
      started();
      return;
    }
    writeFocus(repoPath, focus);
    const request = reviewRequest(focus, customFocuses, text);
    enqueueClaude(
      {
        kind: 'review',
        ref: diffRef,
        focus: request.focus,
        instructions: request.instructions,
        paths: paths.length > 0 ? paths : undefined,
      },
      { repoPath, sessionId: session, pick },
    );
    started();
  };

  const scopeOption = (value: Scope, label: ReactNode, disabled = false) => (
    <label className={cn('flex items-center gap-2 min-h-7 text-[13px] cursor-pointer', disabled && 'opacity-45 cursor-default')}>
      <input
        type="radio"
        name="claude-scope"
        checked={scope === value}
        disabled={disabled}
        onChange={() => setScope(value)}
        className="accent-claude"
      />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );

  return (
    <form
      className={cn('flex flex-col gap-3 p-4', hostTask && 'pt-3')}
      onSubmit={(event) => {
        event.preventDefault();
        void start();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void start();
        }
      }}
    >
      {!hostTask && (
      <div className="flex items-center gap-2">
        <SparkleIcon size="md" className="text-claude" />
        <h3 className="text-[13px] font-semibold text-text">Ask {agent.short}</h3>
        <span className="flex-1" />
        {canChange && (
          <SegmentedToggle<Task>
            value={task}
            onChange={(value) => {
              setTask(value);
              setPicked(null);
              textRef.current?.focus();
            }}
            options={[
              { value: 'review', label: 'Review', title: `${agent.short} reads the changes and leaves comments. It never edits files.` },
              { value: 'change', label: 'Make changes', title: `${agent.short} edits the files to do what you ask.` },
            ]}
          />
        )}
      </div>
      )}
      {!changing && <ReviewTarget diffRef={diffRef} onClose={onClose} />}
      <div>
        <label className="block mb-1.5 text-xs font-medium text-text-secondary" htmlFor="claude-instructions">
          {changing ? `What should ${agent.short} change?` : `What should ${agent.short} focus on?`}
        </label>
        <textarea
          id="claude-instructions"
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder={changing
            ? 'For example “Remove the code comments from this file” or “Rename getUser to fetchUser everywhere”.'
            : 'Optional. For example “Check error handling in the new API routes” or “This is a perf refactor, look for regressions”.'}
          spellCheck={false}
          className={cn(inputField, 'h-auto py-2 leading-5 resize-y min-h-[76px]')}
        />
        {suggestChange && (
          <p className="mt-1.5 text-xs leading-5 text-text-secondary">
            A review only leaves comments.{' '}
            <button type="button" onClick={() => setTask('change')} className="text-claude hover:underline cursor-pointer">
              Make this change instead
            </button>
          </p>
        )}
      </div>
      {!changing && (
      <FocusChips repoPath={repoPath} selected={focus} onSelectedChange={setFocus} />
      )}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-text-secondary mb-0.5">Scope</span>
        {scopeOption('all', `All changes in this view${files.length ? ` (${files.length} file${files.length === 1 ? '' : 's'})` : ''}`)}
        {focusedFile && scopeOption('file', <>Only <code className="font-mono text-xs">{focusedFile}</code></>)}
        {scopeOption('glob', 'Only files matching…')}
        {scope === 'glob' && (
          <div className="pl-6 pt-1">
            <input
              value={glob}
              onChange={(event) => setGlob(event.target.value)}
              placeholder="src/api/**/*.ts"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              className={cn(inputField, 'font-mono text-xs')}
            />
            <span className="block mt-1 text-[11px] text-text-muted">
              {glob.trim() ? `${globMatches.length} of ${files.length} files match` : 'Use * and ** like a .gitignore pattern'}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <ModelPicker value={pick} onChange={setPicked} className="-ml-1.5 mr-auto" />
        <button type="button" onClick={onClose} className={buttonGhost}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={blocked}
          className={buttonClaudeSolid}
          title={blocked ? (changing && !text.trim() ? 'Say what to change' : 'No files match the pattern') : queued ? `Runs after the current one (${modKey}↵)` : `Start (${modKey}↵)`}
        >
          <SparkleIcon size="sm" />
          {changing ? (queued ? 'Queue changes' : 'Make changes') : (queued ? 'Queue review' : 'Start review')}
          <kbd className="ml-1 font-sans text-[11px] opacity-75">{modKey}↵</kbd>
        </button>
      </div>
    </form>
  );
}

interface AskClaudePopoverProps extends Omit<AskClaudePanelProps, 'onClose'> {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

export function AskClaudePopover(props: AskClaudePopoverProps) {
  const { open, onClose, anchorRef, ...rest } = props;

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} align="end" width={400} className="p-0 overflow-visible">
      <AskClaudePanel {...rest} onClose={onClose} />
    </Popover>
  );
}
