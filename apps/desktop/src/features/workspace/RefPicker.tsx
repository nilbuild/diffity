import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Popover } from '@/components/ui/Popover';
import { CheckIcon, ChevronDownIcon, GitBranchIcon, GitCommitIcon, PencilIcon, SearchIcon } from '@/components/ui/icons';
import * as api from '@/lib/api';
import { cn } from '@/lib/cn';
import { queryKeys } from '@/lib/query';
import { dayjs } from '@/lib/time';
import { useWorkspace } from './workspace-context';

const WORKING_REFS = [
  { ref: 'work', label: 'Uncommitted changes', hint: 'staged + unstaged + untracked' },
  { ref: 'staged', label: 'Staged changes', hint: 'git diff --cached' },
  { ref: 'unstaged', label: 'Unstaged changes', hint: 'working tree vs index' },
];

export function refLabel(ref: string): string {
  const working = WORKING_REFS.find((w) => w.ref === ref);
  if (working) {
    return working.label;
  }
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    return ref.slice(0, 7);
  }
  return ref;
}

export function RefPicker() {
  const { repoPath, ref, setRef } = useWorkspace();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const resolved = useQuery({
    queryKey: queryKeys.resolvedRef(repoPath, ref),
    queryFn: () => api.resolveRef(repoPath, ref),
  });

  const choose = (next: string) => {
    setRef(next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-7 max-w-[280px] cursor-default items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2 text-xs hover:bg-bg-muted',
          open && 'bg-bg-muted',
        )}
      >
        <GitCompareGlyph />
        <span className="truncate font-medium">{resolved.data?.label ?? refLabel(ref)}</span>
        <ChevronDownIcon size={12} className="shrink-0 text-fg-subtle" />
      </button>
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} className="w-[380px]">
        <RefPickerPanel current={ref} onChoose={choose} />
      </Popover>
    </>
  );
}

function GitCompareGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="shrink-0 text-fg-muted">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <path d="M11 18H8a2 2 0 0 1-2-2V9" />
    </svg>
  );
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function RefPickerPanel(props: { current: string; onChoose: (ref: string) => void }) {
  const { current, onChoose } = props;
  const { repoPath } = useWorkspace();
  const [text, setText] = useState('');
  const search = useDebounced(text.trim(), 200);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const branches = useQuery({ queryKey: queryKeys.branches(repoPath), queryFn: () => api.listBranches(repoPath) });
  const commits = useQuery({
    queryKey: queryKeys.commits(repoPath, search || null),
    queryFn: () => api.listCommits(repoPath, 30, 0, search || null),
  });

  const needle = text.trim().toLowerCase();
  const branchList = (branches.data ?? []).filter((b) => !b.isCurrent && (!needle || b.name.toLowerCase().includes(needle)));
  const currentBranch = branches.data?.find((b) => b.isCurrent);

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <SearchIcon size={13} className="text-fg-subtle" />
        <input
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !text.trim()) {
              return;
            }
            onChoose(text.trim());
          }}
          placeholder="Search commits, branches, or type a ref (a..b)"
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-fg-subtle"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {text.trim() && (
          <Row icon={<PencilIcon size={13} />} label={`Use “${text.trim()}”`} hint="custom ref, a..b or a...b" onClick={() => onChoose(text.trim())} />
        )}
        {!needle && (
          <Section title="Working tree">
            {WORKING_REFS.map((w) => (
              <Row key={w.ref} label={w.label} hint={w.hint} selected={current === w.ref} onClick={() => onChoose(w.ref)} />
            ))}
          </Section>
        )}
        {branchList.length > 0 && (
          <Section title={currentBranch ? `Compare ${currentBranch.name} with` : 'Branches'}>
            {branchList.slice(0, 12).map((branch) => {
              const value = `${branch.name}...HEAD`;
              return (
                <Row
                  key={branch.name}
                  icon={<GitBranchIcon size={13} />}
                  label={branch.name}
                  hint={branch.isRemote ? 'remote' : undefined}
                  selected={current === value}
                  onClick={() => onChoose(value)}
                />
              );
            })}
          </Section>
        )}
        <Section title="Commits">
          {commits.isLoading && <div className="px-3 py-2 text-xs text-fg-subtle">Loading…</div>}
          {(commits.data ?? []).map((commit) => (
            <Row
              key={commit.sha}
              icon={<GitCommitIcon size={13} />}
              label={commit.subject}
              hint={`${commit.shortSha} · ${commit.author} · ${dayjs(commit.date).fromNow()}`}
              selected={current === commit.sha}
              onClick={() => onChoose(commit.sha)}
            />
          ))}
          {commits.data?.length === 0 && <div className="px-3 py-2 text-xs text-fg-subtle">No commits found</div>}
        </Section>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 pt-1 pb-1 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">{props.title}</div>
      {props.children}
    </div>
  );
}

interface RowProps {
  label: string;
  hint?: string;
  icon?: ReactNode;
  selected?: boolean;
  onClick: () => void;
}

function Row(props: RowProps) {
  const { label, hint, icon, selected, onClick } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-default items-start gap-2 px-3 py-1.5 text-left hover:bg-bg-muted"
    >
      <span className="mt-0.5 w-[13px] shrink-0 text-fg-subtle">{selected ? <CheckIcon size={13} className="text-accent" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-fg">{label}</span>
        {hint && <span className="block truncate text-[11px] text-fg-subtle">{hint}</span>}
      </span>
    </button>
  );
}
