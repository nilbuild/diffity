import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useHotkeys } from 'react-hotkeys-hook';
import { DiffSurfaceProvider } from '@/components/diff-surface';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { queryClient, queryKeys } from '@/lib/query';
import type { DiffResult } from '@/lib/types';
import { repoRoute } from '@/lib/window';
import { AgentPanel } from '@/features/agent/AgentPanel';
import { ChangesPage } from '@/features/changes/ChangesPage';
import { useThreadsChangedListener } from '@/features/comments/use-threads';
import { FilesPage } from '@/features/files/FilesPage';
import { PrTab } from '@/features/pr/PrTab';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { pickFolder } from '@/features/welcome/open-repo';
import { agentBus, setRevealLocationHandler, useAgentBus } from './agent-bus';
import { useRepoWatcher } from './repo-events';
import { useRevealStore } from './reveal-store';
import { useSelection } from './selection';
import { ShortcutsModal } from './ShortcutsModal';
import { Toolbar } from './Toolbar';
import { useViewStore, type WorkspaceTab } from './view-store';
import { WorkspaceProvider, useWorkspace } from './workspace-context';

export function WorkspaceLayout() {
  const [params] = useSearchParams();
  const repoPath = params.get('path');
  if (!repoPath) {
    return (
      <div className="p-6 text-fg-muted">
        No repository selected.{' '}
        <Link to="/" className="text-accent">
          Back
        </Link>
      </div>
    );
  }
  return (
    <WorkspaceProvider key={repoPath} repoPath={repoPath} initialRef={params.get('ref') ?? undefined}>
      <WorkspaceShell initialTab={initialTabFromParams(params)} />
    </WorkspaceProvider>
  );
}

const TABS: WorkspaceTab[] = ['changes', 'files', 'pr'];

function initialTabFromParams(params: URLSearchParams): WorkspaceTab {
  if (params.get('pr')) {
    return 'pr';
  }
  const tab = params.get('tab') as WorkspaceTab | null;
  if (tab && TABS.includes(tab)) {
    return tab;
  }
  return 'changes';
}

function WorkspaceShell(props: { initialTab: WorkspaceTab }) {
  // The PR tab strips `?pr=` once it starts the checkout, so only the first value counts.
  const [initialTab] = useState(props.initialTab);
  const { repoPath } = useWorkspace();
  const panelOpen = useAgentBus((s) => s.panelOpen);
  const tab = useViewStore((s) => s.tab);
  const setTab = useViewStore((s) => s.setTab);
  const wordDiff = useViewStore((s) => s.wordDiff);
  const agentPanelWidth = useViewStore((s) => s.agentPanelWidth);
  const setAgentPanelWidth = useViewStore((s) => s.setAgentPanelWidth);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState<Set<WorkspaceTab>>(() => new Set([initialTab]));

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, setTab]);

  useEffect(() => {
    setMounted((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, [tab]);

  useRepoWatcher(repoPath);
  useThreadsChangedListener();
  useRevealHandler();
  useWorkspaceHotkeys();

  return (
    <DiffSurfaceProvider wordDiff={wordDiff}>
      <div className="flex h-full flex-col">
        <Toolbar onOpenSettings={() => setSettingsOpen(true)} />
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1">
            {mounted.has('changes') && (
              <div className="h-full" hidden={tab !== 'changes'}>
                <ChangesPage />
              </div>
            )}
            {mounted.has('files') && (
              <div className="h-full" hidden={tab !== 'files'}>
                <FilesPage />
              </div>
            )}
            {tab === 'pr' && (
              <div className="h-full overflow-auto">
                <PrTab />
              </div>
            )}
          </main>
          {panelOpen && (
            <>
              <ResizeHandle value={agentPanelWidth} onChange={setAgentPanelWidth} min={300} max={760} direction="left" />
              <aside style={{ width: agentPanelWidth }} className="flex shrink-0 flex-col border-l border-border bg-bg-subtle">
                <AgentPanel />
              </aside>
            </>
          )}
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
        <ShortcutsModal />
      </div>
    </DiffSurfaceProvider>
  );
}

function useRevealHandler() {
  const { repoPath, ref } = useWorkspace();
  const setTab = useViewStore((s) => s.setTab);

  useEffect(
    () =>
      setRevealLocationHandler((path, line) => {
        const { hideWhitespace } = useViewStore.getState();
        const diff = queryClient.getQueryData<DiffResult>(queryKeys.diff(repoPath, ref, hideWhitespace));
        const inDiff = diff?.files.some((f) => f.path === path) ?? false;
        setTab(inDiff ? 'changes' : 'files');
        useRevealStore.getState().reveal(path, line);
      }),
    [repoPath, ref, setTab],
  );
}

function useWorkspaceHotkeys() {
  const navigate = useNavigate();
  const setDiffStyle = useViewStore((s) => s.setDiffStyle);
  const setShortcutsOpen = useViewStore((s) => s.setShortcutsOpen);

  useHotkeys(
    'mod+l',
    (event) => {
      event.preventDefault();
      const chip = useSelection.getState().selection;
      if (chip) {
        agentBus.askAboutSelection(chip);
        return;
      }
      const { panelOpen, setPanelOpen } = useAgentBus.getState();
      setPanelOpen(!panelOpen);
    },
    { enableOnFormTags: true },
  );
  useHotkeys('mod+o', (event) => {
    event.preventDefault();
    void pickFolder().then((path) => {
      if (!path) {
        return;
      }
      navigate(repoRoute(path));
    });
  });
  useHotkeys('shift+slash', () => setShortcutsOpen(true), { useKey: true });
  useHotkeys('u', () => setDiffStyle('unified'));
  useHotkeys('s', () => setDiffStyle('split'));
}
