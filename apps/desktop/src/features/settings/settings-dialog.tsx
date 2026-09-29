import { useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { closeSettings, setSettingsSection, useUi, type SettingsSection } from '../../lib/ui-store';
import { cn } from '../../lib/cn';
import { SettingsIcon } from '../../components/icons/settings-icon';
import { SparkleIcon } from '../../components/icons/sparkle-icon';
import { GitHubIcon } from '../../components/icons/github-icon';
import { CodeIcon } from '../../components/icons/code-icon';
import { KeyboardIcon } from '../../components/icons/keyboard-icon';
import { SearchIcon } from '../../components/icons/search-icon';
import { XIcon } from '../../components/icons/x-icon';
import { GeneralPane } from './general-pane';
import { ClaudePane } from './claude-pane';
import { GitHubPane } from './github-pane';
import { EditorPane } from './editor-pane';
import { ShortcutsPane } from './shortcuts-pane';
import { AboutPane } from './about-pane';

function InfoIcon(props: { className?: string }) {
  const { className } = props;

  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" className={className}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <circle cx="8" cy="5" r="0.5" fill="currentColor" />
    </svg>
  );
}

const LABELS: Record<SettingsSection, string> = {
  general: 'General',
  editor: 'Editor',
  shortcuts: 'Keyboard shortcuts',
  claude: 'Claude Code',
  github: 'GitHub',
  about: 'About',
};

const ICONS: Record<SettingsSection, ComponentType<{ className?: string }>> = {
  general: SettingsIcon,
  editor: CodeIcon,
  shortcuts: KeyboardIcon,
  claude: SparkleIcon,
  github: GitHubIcon,
  about: InfoIcon,
};

const GROUPS: { label: string; sections: SettingsSection[] }[] = [
  { label: 'App', sections: ['general', 'editor', 'shortcuts'] },
  { label: 'Connections', sections: ['claude', 'github'] },
  { label: 'Diffity', sections: ['about'] },
];

const ORDER = GROUPS.flatMap((group) => group.sections);

const INDEX: { label: string; section: SettingsSection; keywords?: string }[] = [
  { label: 'Theme', section: 'general', keywords: 'appearance dark light system mode colour color' },
  { label: 'Diff layout', section: 'general', keywords: 'split unified view' },
  { label: 'Open files with', section: 'editor', keywords: 'vs code cursor zed editor' },
  { label: 'Custom editor command', section: 'editor', keywords: 'subl idea cli' },
  { label: 'Keyboard shortcuts', section: 'shortcuts', keywords: 'keys hotkeys' },
  { label: 'Claude Code status', section: 'claude', keywords: 'agent installed login re-detect' },
  { label: 'Claude Code binary path', section: 'claude', keywords: 'path claude-agent-acp cli' },
  { label: 'GitHub account', section: 'github', keywords: 'sign in sign out login' },
  { label: 'Import from GitHub CLI', section: 'github', keywords: 'gh token' },
  { label: 'Personal access token', section: 'github', keywords: 'pat token keychain' },
  { label: 'Version', section: 'about', keywords: 'about update' },
];

function matches(query: string) {
  const needle = query.trim().toLowerCase();
  return INDEX.filter((item) => `${item.label} ${item.keywords ?? ''} ${LABELS[item.section]}`.toLowerCase().includes(needle));
}

function Pane(props: { section: SettingsSection }) {
  const { section } = props;

  if (section === 'claude') {
    return <ClaudePane />;
  }
  if (section === 'github') {
    return <GitHubPane />;
  }
  if (section === 'editor') {
    return <EditorPane />;
  }
  if (section === 'shortcuts') {
    return <ShortcutsPane />;
  }
  if (section === 'about') {
    return <AboutPane />;
  }
  return <GeneralPane />;
}

function RailTab(props: { section: SettingsSection; active: boolean; onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void; register: (node: HTMLButtonElement | null) => void }) {
  const { section, active, onKeyDown, register } = props;
  const Icon = ICONS[section];

  return (
    <button
      ref={register}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={() => setSettingsSection(section)}
      onKeyDown={onKeyDown}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-[5px] text-left text-[13px] transition-colors',
        active ? 'bg-active text-text' : 'text-text-secondary hover:bg-hover hover:text-text',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{LABELS[section]}</span>
    </button>
  );
}

function SettingsDialogBody() {
  const section = useUi((state) => state.settingsSection);
  const [query, setQuery] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<SettingsSection, HTMLButtonElement>());
  const results = useMemo(() => matches(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const move = (from: SettingsSection, delta: number) => {
    const index = ORDER.indexOf(from);
    const next = ORDER[(index + delta + ORDER.length) % ORDER.length];
    setSettingsSection(next);
    tabs.current.get(next)?.focus();
  };

  const handleTabKey = (event: ReactKeyboardEvent<HTMLButtonElement>, from: SettingsSection) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(from, 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(from, -1);
    }
  };

  const handleKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') {
      return;
    }
    event.stopPropagation();
    if (query) {
      setQuery('');
      return;
    }
    closeSettings();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 font-sans" onMouseDown={closeSettings}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        onKeyDown={handleKey}
        onMouseDown={(event) => event.stopPropagation()}
        className="mx-4 flex h-[min(600px,calc(100vh-64px))] w-[780px] max-w-full overflow-hidden rounded-xl bg-overlay text-text ring-1 ring-overlay-border outline-none"
      >
        <nav className="flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-border bg-bg-secondary px-2 pb-3 pt-4 scrollbar-none">
          <div className="mb-3 flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg px-2 focus-within:border-accent/45">
            <SearchIcon className="h-3 w-3 shrink-0 text-text-muted" />
            <input
              autoComplete="off"
              autoCorrect="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a setting"
              aria-label="Find a setting"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-xs text-text outline-none placeholder:text-text-muted"
            />
          </div>
          {searching ? (
            <div className="flex flex-col gap-0.5">
              {results.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setSettingsSection(item.section);
                    setQuery('');
                  }}
                  className="flex w-full cursor-pointer flex-col items-start rounded-md px-2 py-1 text-left hover:bg-hover"
                >
                  <span className="text-[13px] text-text">{item.label}</span>
                  <span className="text-[11px] text-text-muted">{LABELS[item.section]}</span>
                </button>
              ))}
              {results.length === 0 && <p className="px-2 py-1 text-xs text-text-muted">Nothing matches.</p>}
            </div>
          ) : (
            <div role="tablist" aria-orientation="vertical" aria-label="Settings sections" className="flex flex-1 flex-col">
              {GROUPS.map((group) => (
                <div key={group.label} className="mb-3 last:mb-0">
                  <p className="mb-1 px-2 text-[11px] font-semibold text-text-muted">{group.label}</p>
                  <div className="flex flex-col gap-0.5">
                    {group.sections.map((item) => (
                      <RailTab
                        key={item}
                        section={item}
                        active={item === section}
                        onKeyDown={(event) => handleTabKey(event, item)}
                        register={(node) => {
                          if (!node) {
                            tabs.current.delete(item);
                            return;
                          }
                          tabs.current.set(item, node);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>
        <div role="tabpanel" aria-label={LABELS[section]} className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 pb-6 pt-4">
          <div className="mb-4 flex h-7 shrink-0 items-center justify-between">
            <h2 className="text-[15px] font-semibold text-text">{LABELS[section]}</h2>
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close settings"
              className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-text-muted transition-colors hover:bg-hover hover:text-text"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <Pane section={section} />
        </div>
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const open = useUi((state) => state.settingsOpen);

  if (!open) {
    return null;
  }
  return <SettingsDialogBody />;
}
