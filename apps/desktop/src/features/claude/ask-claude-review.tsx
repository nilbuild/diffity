import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { cn } from '../../lib/cn';
import { getRepoPath } from '../../lib/api';
import * as tauri from '../../lib/tauri';
import { diffOptions } from '../../queries/diff';
import { getFilePath } from '../../lib/diff-utils';
import { modKey } from '../../lib/platform';
import { Popover } from '../../components/ui/popover';
import { buttonClaudeSolid, buttonGhost, inputField } from '../../components/ui/button-styles';
import { SparkleIcon } from '../../components/ui/icon';
import { enqueueClaude } from './claude-runner';

export const REVIEW_FOCUSES = ['Security', 'Performance', 'Correctness', 'Naming', 'Tests', 'Types'] as const;

type Scope = 'all' | 'file' | 'glob';

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

interface AskClaudePanelProps {
  diffRef: string;
  sessionId: string | null;
  focusedFile?: string | null;
  onStarted?: () => void;
  onClose: () => void;
}

function AskClaudePanel(props: AskClaudePanelProps) {
  const { diffRef, sessionId, focusedFile, onStarted, onClose } = props;
  const repoPath = getRepoPath();
  const [text, setText] = useState('');
  const [focus, setFocus] = useState<string[]>(() => readFocus(repoPath));
  const [scope, setScope] = useState<Scope>('all');
  const [glob, setGlob] = useState('');
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
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => textRef.current?.focus()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const paths = scope === 'file' && focusedFile ? [focusedFile] : scope === 'glob' ? globMatches : [];
  const blocked = scope === 'glob' && globMatches.length === 0;

  const start = async () => {
    if (blocked) {
      return;
    }
    writeFocus(repoPath, focus);
    const session = sessionId ?? (await tauri.getSession(repoPath, diffRef).catch(() => null))?.id ?? null;
    enqueueClaude(
      {
        kind: 'review',
        ref: diffRef,
        focus: focus.length > 0 ? focus.join(', ') : undefined,
        instructions: text.trim() || undefined,
        paths: paths.length > 0 ? paths : undefined,
      },
      { repoPath, sessionId: session },
    );
    onClose();
    onStarted?.();
  };

  const toggle = (value: string) => {
    setFocus((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
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
      className="flex flex-col gap-3 p-4"
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
      <div className="flex items-center gap-2">
        <SparkleIcon size="md" className="text-claude" />
        <h3 className="text-[13px] font-semibold text-text">Ask Claude to review</h3>
      </div>
      <div>
        <label className="block mb-1.5 text-xs font-medium text-text-secondary" htmlFor="claude-instructions">What should Claude focus on?</label>
        <textarea
          id="claude-instructions"
          ref={textRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder={'Optional. For example “Check error handling in the new API routes” or “This is a perf refactor, look for regressions”.'}
          spellCheck={false}
          className={cn(inputField, 'h-auto py-2 leading-5 resize-y min-h-[76px]')}
        />
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Focus areas">
        {REVIEW_FOCUSES.map((value) => {
          const active = focus.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(value)}
              className={cn(
                'h-6 px-2.5 rounded-full border text-xs transition-colors cursor-pointer',
                active ? 'border-claude/40 bg-claude/12 text-claude font-medium' : 'border-control-border bg-raised text-text-secondary hover:text-text',
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
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
      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onClose} className={buttonGhost}>
          Cancel
        </button>
        <button type="submit" disabled={blocked} className={buttonClaudeSolid} title={blocked ? 'No files match the pattern' : `Start (${modKey}↵)`}>
          <SparkleIcon size="sm" />
          Start review
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
