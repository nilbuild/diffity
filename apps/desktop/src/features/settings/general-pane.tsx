import { useState } from 'react';
import { cn } from '../../lib/cn';
import { useTheme, type ThemePreference } from '../../hooks/use-theme';
import { PreferencesGroup, PreferencesPane, PreferencesRow, SegmentedControl } from './preferences';

const PALETTES = {
  light: { bg: '#ffffff', panel: '#f6f8fa', line: '#d0d7de', text: '#8b949e', add: '#abf2bc', del: '#ffc1bf', accent: '#0969da' },
  dark: { bg: '#171717', panel: '#1f1f1f', line: '#2e2e2e', text: '#525252', add: 'rgba(34,197,94,0.4)', del: 'rgba(239,68,68,0.4)', accent: '#60a5fa' },
};

const THEMES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: 'Follows macOS' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

function MiniWindow(props: { theme: 'light' | 'dark' }) {
  const { theme } = props;
  const palette = PALETTES[theme];

  return (
    <div className="flex h-full w-full flex-col" style={{ background: palette.bg }}>
      <div className="flex h-3.5 items-center gap-[3px] px-1.5" style={{ background: palette.panel, borderBottom: `1px solid ${palette.line}` }}>
        <span className="size-[5px] rounded-full bg-[#ff5f57]" />
        <span className="size-[5px] rounded-full bg-[#febc2e]" />
        <span className="size-[5px] rounded-full bg-[#28c840]" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-7 space-y-1 p-1.5" style={{ background: palette.panel, borderRight: `1px solid ${palette.line}` }}>
          <div className="h-1 rounded-full" style={{ background: palette.line }} />
          <div className="h-1 w-3/4 rounded-full" style={{ background: palette.line }} />
          <div className="h-1 rounded-full" style={{ background: palette.line }} />
        </div>
        <div className="flex-1 space-y-[3px] p-1.5">
          <div className="h-1 w-2/3 rounded-full" style={{ background: palette.text }} />
          <div className="h-1.5 w-full rounded-sm" style={{ background: palette.del }} />
          <div className="h-1.5 w-full rounded-sm" style={{ background: palette.add }} />
          <div className="h-1.5 w-full rounded-sm" style={{ background: palette.add }} />
          <div className="mt-1 h-1.5 w-5 rounded-sm" style={{ background: palette.accent }} />
        </div>
      </div>
    </div>
  );
}

function ThemeSwatch(props: { value: ThemePreference }) {
  const { value } = props;

  if (value !== 'system') {
    return <MiniWindow theme={value} />;
  }
  return (
    <div className="relative h-full w-full">
      <div className="absolute inset-0">
        <MiniWindow theme="light" />
      </div>
      <div className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
        <MiniWindow theme="dark" />
      </div>
    </div>
  );
}

function ThemePicker() {
  const { preference, setPreference } = useTheme();

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-3">
      {THEMES.map((option) => {
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(option.value)}
            className="group cursor-pointer text-left"
          >
            <div
              className={cn(
                'h-[76px] overflow-hidden rounded-lg border-2 transition-colors',
                active ? 'border-accent' : 'border-border group-hover:border-text-muted',
              )}
            >
              <ThemeSwatch value={option.value} />
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className={cn('text-xs font-medium', active ? 'text-accent' : 'text-text')}>{option.label}</span>
              <span className="text-[11px] text-text-muted">{option.hint}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

type ViewMode = 'split' | 'unified';

const VIEW_MODE_KEY = 'diffity-view-mode';

function readViewMode(): ViewMode {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'unified' ? 'unified' : 'split';
  } catch {
    return 'split';
  }
}

function DiffLayoutRow() {
  const [mode, setMode] = useState<ViewMode>(readViewMode);

  return (
    <PreferencesRow label="Diff layout" hint="How diffs open. Switch any time with Unified | Split above the diff (U, S).">
      <SegmentedControl<ViewMode>
        ariaLabel="Diff layout"
        value={mode}
        options={[
          { value: 'split', label: 'Split' },
          { value: 'unified', label: 'Unified' },
        ]}
        onChange={(next) => {
          setMode(next);
          try {
            localStorage.setItem(VIEW_MODE_KEY, next);
          } catch {
            return;
          }
        }}
      />
    </PreferencesRow>
  );
}

export function GeneralPane() {
  return (
    <PreferencesPane>
      <PreferencesGroup label="Appearance">
        <PreferencesRow stacked label="Theme" hint="System switches with your macOS appearance.">
          <ThemePicker />
        </PreferencesRow>
      </PreferencesGroup>
      <PreferencesGroup label="Diffs">
        <DiffLayoutRow />
      </PreferencesGroup>
    </PreferencesPane>
  );
}
