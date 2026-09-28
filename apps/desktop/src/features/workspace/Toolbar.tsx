import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import {
  ChevronDownIcon,
  ColumnsIcon,
  ExternalLinkIcon,
  FolderIcon,
  KeyboardIcon,
  LightbulbIcon,
  PanelRightIcon,
  PilcrowIcon,
  RowsIcon,
  SettingsIcon,
  SparklesIcon,
  TextIcon,
} from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { modKey } from '@/lib/platform';
import { openRepoInNewWindow, repoRoute } from '@/lib/window';
import { GitSyncButtons } from '@/features/pr/GitSyncButtons';
import { pickFolder } from '@/features/welcome/open-repo';
import { agentBus, useAgentBus } from './agent-bus';
import { RefPicker } from './RefPicker';
import { useViewStore, type WorkspaceTab } from './view-store';
import { useWorkspace } from './workspace-context';

const TABS: { value: WorkspaceTab; label: string }[] = [
  { value: 'changes', label: 'Changes' },
  { value: 'files', label: 'Files' },
  { value: 'pr', label: 'PR' },
];

export function Toolbar(props: { onOpenSettings: () => void }) {
  const { onOpenSettings } = props;
  const { ref } = useWorkspace();
  const tab = useViewStore((s) => s.tab);
  const setTab = useViewStore((s) => s.setTab);
  const setShortcutsOpen = useViewStore((s) => s.setShortcutsOpen);
  const panelOpen = useAgentBus((s) => s.panelOpen);
  const setPanelOpen = useAgentBus((s) => s.setPanelOpen);

  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-bg-subtle pr-2 pl-[78px]"
    >
      <RepoMenu />
      <RefPicker />
      <nav className="ml-2 flex items-center gap-0.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              'h-7 cursor-default rounded-md px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring',
              tab === t.value ? 'bg-bg-elevated text-fg shadow-sm ring-1 ring-border' : 'text-fg-muted hover:bg-bg-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div data-tauri-drag-region className="h-full min-w-4 flex-1" />
      {tab === 'changes' && <DiffViewControls />}
      <div className="mx-1 h-5 w-px bg-border" />
      <Button size="sm" variant="ghost" title="Ask the agent to review these changes" onClick={() => agentBus.runAction({ kind: 'review', ref })}>
        <SparklesIcon size={13} />
        Review
      </Button>
      <Button size="sm" variant="ghost" title="Summarize these changes" onClick={() => agentBus.runAction({ kind: 'summarize', ref })}>
        <LightbulbIcon size={13} />
        Summarize
      </Button>
      <div className="mx-1 h-5 w-px bg-border" />
      <GitSyncButtons />
      <IconButton label="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
        <KeyboardIcon size={15} />
      </IconButton>
      <IconButton label="Settings" onClick={onOpenSettings}>
        <SettingsIcon size={15} />
      </IconButton>
      <IconButton label={panelOpen ? 'Hide agent panel' : 'Show agent panel'} active={panelOpen} onClick={() => setPanelOpen(!panelOpen)}>
        <PanelRightIcon size={15} />
      </IconButton>
    </header>
  );
}

function RepoMenu() {
  const { repo, repoPath } = useWorkspace();
  const navigate = useNavigate();
  const name = repo?.name ?? repoPath.split('/').filter(Boolean).pop() ?? repoPath;

  const openOther = async (newWindow: boolean) => {
    const path = await pickFolder();
    if (!path) {
      return;
    }
    if (newWindow) {
      void openRepoInNewWindow(path);
      return;
    }
    navigate(repoRoute(path));
  };

  return (
    <Menu
      align="start"
      items={[
        { label: 'Open repository…', hint: `${modKey}O`, icon: <FolderIcon size={13} />, onSelect: () => void openOther(false) },
        { label: 'Open in new window…', icon: <ExternalLinkIcon size={13} />, onSelect: () => void openOther(true) },
        'separator',
        { label: 'Back to start', onSelect: () => navigate('/') },
      ]}
      trigger={(trigger) => (
        <button
          ref={trigger.ref}
          type="button"
          onClick={trigger.onClick}
          title={repoPath}
          className="flex h-7 max-w-[220px] cursor-default items-center gap-1.5 rounded-md px-2 hover:bg-bg-muted"
        >
          <span className="truncate text-[13px] font-semibold">{name}</span>
          {repo?.branch && <span className="truncate text-xs text-fg-subtle">{repo.branch}</span>}
          <ChevronDownIcon size={12} className="shrink-0 text-fg-subtle" />
        </button>
      )}
    />
  );
}

function DiffViewControls() {
  const diffStyle = useViewStore((s) => s.diffStyle);
  const setDiffStyle = useViewStore((s) => s.setDiffStyle);
  const hideWhitespace = useViewStore((s) => s.hideWhitespace);
  const toggleWhitespace = useViewStore((s) => s.toggleWhitespace);
  const wordDiff = useViewStore((s) => s.wordDiff);
  const toggleWordDiff = useViewStore((s) => s.toggleWordDiff);

  return (
    <div className="flex items-center gap-1">
      <SegmentedToggle
        value={diffStyle}
        onChange={setDiffStyle}
        options={[
          { value: 'split', label: <ColumnsIcon size={13} />, title: 'Split view (s)' },
          { value: 'unified', label: <RowsIcon size={13} />, title: 'Unified view (u)' },
        ]}
      />
      <IconButton label={hideWhitespace ? 'Show whitespace changes' : 'Hide whitespace changes'} active={hideWhitespace} onClick={toggleWhitespace}>
        <PilcrowIcon size={14} />
      </IconButton>
      <IconButton label={wordDiff ? 'Disable word diff' : 'Enable word diff'} active={wordDiff} onClick={toggleWordDiff}>
        <TextIcon size={14} />
      </IconButton>
    </div>
  );
}
