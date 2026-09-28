import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { Tabs } from '@/components/ui/Tabs';
import {
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
} from '@/components/ui/icon';
import { cn } from '@/lib/cn';
import { modKey } from '@/lib/platform';
import { openRepoInNewWindow, repoRoute } from '@/lib/window';
import { FinishReview } from '@/features/comments/FinishReview';
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
  const { ref, repoPath, sessionId, treeSessionId } = useWorkspace();
  const tab = useViewStore((s) => s.tab);
  const setTab = useViewStore((s) => s.setTab);
  const setShortcutsOpen = useViewStore((s) => s.setShortcutsOpen);
  const panelOpen = useAgentBus((s) => s.panelOpen);
  const setPanelOpen = useAgentBus((s) => s.setPanelOpen);

  return (
    <header
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-canvas pr-3 pl-[80px]"
    >
      <RepoMenu />
      <span className="text-sm text-fg-subtle select-none">/</span>
      <RefPicker />
      <Tabs variant="folder" className="ml-4 self-end" value={tab} onChange={setTab} items={TABS} />
      <div data-tauri-drag-region className="h-full min-w-4 flex-1" />
      {tab === 'changes' && (
        <>
          <DiffViewControls />
          <Divider />
        </>
      )}
      <div className="flex items-center gap-0.5">
        <Button variant="outline" title="Ask Claude to review these changes" onClick={() => agentBus.runAction({ kind: 'review', ref })}>
          <SparklesIcon size={14} />
          AI review
        </Button>
        <IconButton label="Summarize changes" onClick={() => agentBus.runAction({ kind: 'summarize', ref })}>
          <LightbulbIcon size={16} />
        </IconButton>
      </div>
      {tab !== 'pr' && <FinishReview repoPath={repoPath} sessionId={tab === 'files' ? treeSessionId : sessionId} />}
      <Divider />
      <GitSyncButtons />
      <Divider />
      <div className="flex items-center gap-2">
        <IconButton variant="circle" label="Keyboard shortcuts" shortcut="?" onClick={() => setShortcutsOpen(true)}>
          <KeyboardIcon size={14} />
        </IconButton>
        <IconButton variant="circle" label="Settings" onClick={onOpenSettings}>
          <SettingsIcon size={14} />
        </IconButton>
        <IconButton
          variant="circle"
          label={panelOpen ? 'Hide agent panel' : 'Show agent panel'}
          shortcut={`${modKey}L`}
          active={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <PanelRightIcon size={14} mirrored />
        </IconButton>
      </div>
    </header>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-border" />;
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
        { label: 'Open repository…', hint: `${modKey}O`, icon: <FolderIcon size={14} />, onSelect: () => void openOther(false) },
        { label: 'Open in new window…', icon: <ExternalLinkIcon size={14} />, onSelect: () => void openOther(true) },
        'separator',
        { label: 'Back to start', onSelect: () => navigate('/') },
      ]}
      trigger={(trigger) => (
        <button
          ref={trigger.ref}
          type="button"
          onClick={trigger.onClick}
          title={repoPath}
          className={cn('flex h-7 max-w-[220px] cursor-default items-center gap-1.5 rounded-lg px-1.5 hover:bg-hover', trigger.open && 'bg-hover')}
        >
          <span className="truncate text-sm font-medium text-fg">{name}</span>
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
    <div className="flex items-center gap-0.5">
      <SegmentedToggle
        value={diffStyle}
        onChange={setDiffStyle}
        options={[
          { value: 'split', label: <ColumnsIcon size={14} />, title: 'Split view (s)' },
          { value: 'unified', label: <RowsIcon size={14} />, title: 'Unified view (u)' },
        ]}
      />
      <IconButton label={hideWhitespace ? 'Show whitespace changes' : 'Hide whitespace changes'} active={hideWhitespace} onClick={toggleWhitespace}>
        <PilcrowIcon size={16} />
      </IconButton>
      <IconButton label={wordDiff ? 'Disable word diff' : 'Enable word diff'} active={wordDiff} onClick={toggleWordDiff}>
        <TextIcon size={16} />
      </IconButton>
    </div>
  );
}
