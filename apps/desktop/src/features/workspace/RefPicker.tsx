import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Popover } from '@/components/ui/Popover';
import { CheckIcon, ChevronDownIcon, GitBranchIcon, GitCommitIcon, GitCompareIcon, PencilIcon, SearchIcon } from '@/components/ui/icon';
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
          'flex h-7 max-w-[280px] cursor-default items-center gap-1.5 rounded-md border border-border bg-raised px-2 text-xs text-fg hover:border-border-strong hover:bg-hover',
          open && 'border-border-strong bg-hover',
        )}
      >
        <GitCompareIcon size={14} className="shrink-0 text-fg-muted" />
        <span className="truncate font-medium">{resolved.data?.label ?? refLabel(ref)}</span>
        <ChevronDownIcon size={12} className="shrink-0 text-fg-subtle" />
      </button>
      <Popover open={open} onOpenChange={setOpen} anchorRef={anchorRef} className="w-[380px]">
        <RefPickerPanel current={ref} onChoose={choose} />
      </Popover>
    </>
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
        <SearchIcon size={14} className="text-fg-subtle" />
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
          className="h-6 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {text.trim() && (
          <Row icon={<PencilIcon size={14} />} label={`Use “${text.trim()}”`} hint="custom ref, a..b or a...b" onClick={() => onChoose(text.trim())} />
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
                  icon={<GitBranchIcon size={14} />}
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
          {commits.isLoading && <div className="px-2 py-2 text-xs text-fg-subtle">Loading…</div>}
          {(commits.data ?? []).map((commit) => (
            <Row
              key={commit.sha}
              icon={<GitCommitIcon size={14} />}
              label={commit.subject}
              hint={`${commit.shortSha} · ${commit.author} · ${dayjs(commit.date).fromNow()}`}
              selected={current === commit.sha}
              onClick={() => onChoose(commit.sha)}
            />
          ))}
          {commits.data?.length === 0 && <div className="px-2 py-2 text-xs text-fg-subtle">No commits found</div>}
        </Section>
      </div>
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-2 pt-1 pb-1 text-2xs font-medium text-fg-subtle">{props.title}</div>
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
      className="flex w-full cursor-default items-start gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-hover"
    >
      <span className="mt-[3px] flex w-3.5 shrink-0 text-fg-subtle">{selected ? <CheckIcon size={14} className="text-accent" /> : icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-fg">{label}</span>
        {hint && <span className="block truncate text-2xs text-fg-subtle">{hint}</span>}
      </span>
    </button>
  );
}
