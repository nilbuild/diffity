import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { cn } from '@/lib/cn';
import { AgentPanel } from '@/features/agent/AgentPanel';
import { GitSyncButtons } from '@/features/pr/GitSyncButtons';
import { PrTab } from '@/features/pr/PrTab';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { useAgentBus } from './agent-bus';
import { WorkspaceProvider, useWorkspace } from './workspace-context';

type Tab = 'changes' | 'files' | 'pr';

export function WorkspaceLayout() {
  const [params] = useSearchParams();
  const repoPath = params.get('path');
  if (!repoPath) {
    return (
      <div className="p-6 text-fg-muted">
        No repository selected. <Link to="/" className="text-accent">Back</Link>
      </div>
    );
  }
  return (
    <WorkspaceProvider repoPath={repoPath} initialRef={params.get('ref') ?? undefined}>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}

function WorkspaceShell() {
  const { repoPath, repo, ref } = useWorkspace();
  const panelOpen = useAgentBus((s) => s.panelOpen);
  const [tab, setTab] = useState<Tab>('changes');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <header data-tauri-drag-region className="flex h-11 items-center gap-3 border-b border-border bg-bg-subtle pr-3 pl-20">
        <span className="font-medium">{repo?.name ?? repoPath}</span>
        <span className="text-fg-subtle">{ref}</span>
        <nav className="ml-4 flex gap-1">
          {(['changes', 'files', 'pr'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn('rounded px-2 py-1 capitalize', tab === t ? 'bg-bg-muted text-fg' : 'text-fg-muted')}
            >
              {t === 'pr' ? 'PR' : t}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <GitSyncButtons />
          <button type="button" className="text-fg-muted" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-auto">
          {tab === 'changes' && <div className="p-6 text-fg-muted">Changes (TODO)</div>}
          {tab === 'files' && <div className="p-6 text-fg-muted">Files (TODO)</div>}
          {tab === 'pr' && <PrTab />}
        </main>
        {panelOpen && (
          <aside className="w-[380px] shrink-0 border-l border-border bg-bg-subtle">
            <AgentPanel />
          </aside>
        )}
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
