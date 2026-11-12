import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/cn';
import { useTheme, type ThemePreference } from '../../hooks/use-theme';
import { setDiffPalette, useDiffPalette, type DiffPalette } from '../../lib/diff-palette';
import { ChevronDownIcon } from '../../components/ui/icon';
import {
  CODE_SIZES,
  DEFAULT_CODE_SIZE,
  installedFonts,
  setCodeFont,
  setCodeSize,
  setTabSize,
  setUiFont,
  setWrapLines,
  TAB_SIZES,
  useTypography,
  type TabSize,
} from '../../lib/typography';
import { PreferencesGroup, PreferencesPane, PreferencesRow, SegmentedControl, Stepper } from './preferences';
import { DiffIgnoreRow } from './diff-ignore-row';
import { isMac } from '../../lib/platform';

const PALETTES = {
  light: { bg: '#ffffff', panel: '#f6f8fa', line: '#d0d7de', text: '#8b949e', add: '#abf2bc', del: '#ffc1bf', accent: '#0969da' },
  dark: { bg: '#171717', panel: '#1f1f1f', line: '#2e2e2e', text: '#525252', add: 'rgba(34,197,94,0.4)', del: 'rgba(239,68,68,0.4)', accent: '#60a5fa' },
};

const DIFF_COLOURS: Record<DiffPalette, Record<'light' | 'dark', { add: string; addText: string; del: string; delText: string }>> = {
  default: {
    light: { add: '#d9f6e1', addText: '#1a7f37', del: '#fcdfdd', delText: '#cf222e' },
    dark: { add: '#1c3a27', addText: '#4ade80', del: '#3d1f21', delText: '#f87171' },
  },
  colorblind: {
    light: { add: '#d6ebff', addText: '#0969da', del: '#ffe5cf', delText: '#bc4c00' },
    dark: { add: '#1b3552', addText: '#58a6ff', del: '#3d2712', delText: '#f0883e' },
  },
};

const PALETTE_OPTIONS: { value: DiffPalette; label: string; hint: string }[] = [
  { value: 'default', label: 'Default', hint: 'Green and red' },
  { value: 'colorblind', label: 'Colour-blind friendly', hint: 'Blue and orange' },
];

const THEMES: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'system', label: 'System', hint: isMac ? 'Follows macOS' : 'Follows your desktop' },
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
];

function MiniWindow(props: { theme: 'light' | 'dark' }) {
  const { theme } = props;
  const diffPalette = useDiffPalette((state) => state.palette);
  const palette = diffPalette === 'default'
    ? PALETTES[theme]
    : { ...PALETTES[theme], add: DIFF_COLOURS.colorblind[theme].add, del: DIFF_COLOURS.colorblind[theme].del };

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
              <span className={cn('text-xs font-medium', 'text-text')}>{option.label}</span>
              <span className="text-[11px] text-text-muted">{option.hint}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DiffColoursPicker() {
  const { theme } = useTheme();
  const palette = useDiffPalette((state) => state.palette);

  return (
    <div role="radiogroup" aria-label="Diff colours" className="grid grid-cols-2 gap-3">
      {PALETTE_OPTIONS.map((option) => {
        const active = palette === option.value;
        const colours = DIFF_COLOURS[option.value][theme];
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setDiffPalette(option.value)}
            className="group cursor-pointer text-left"
          >
            <div
              className={cn(
                'flex flex-col gap-[3px] overflow-hidden rounded-lg border-2 bg-bg p-2 font-mono text-[10px] leading-[14px] transition-colors',
                active ? 'border-accent' : 'border-border group-hover:border-text-muted',
              )}
            >
              <div className="flex gap-1.5 rounded-sm px-1" style={{ background: colours.del, color: colours.delText }}>
                <span>−</span>
                <span className="text-text-secondary">return a - b;</span>
              </div>
              <div className="flex gap-1.5 rounded-sm px-1" style={{ background: colours.add, color: colours.addText }}>
                <span>+</span>
                <span className="text-text-secondary">return a + b;</span>
              </div>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xs font-medium text-text">{option.label}</span>
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

function useInstalledFonts() {
  return useQuery({ queryKey: ['installed-fonts'], queryFn: installedFonts, staleTime: Infinity });
}

/** Keeps a saved font listed even when it is no longer installed. */
function withCurrent(names: string[], current: string | null) {
  if (!current || names.includes(current)) {
    return names;
  }
  return [current, ...names];
}

function SelectField(props: { value: string; ariaLabel: string; onChange: (value: string) => void; children: ReactNode }) {
  const { value, ariaLabel, onChange, children } = props;

  return (
    <div className="relative w-full">
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full cursor-pointer appearance-none truncate rounded-md border border-control-border bg-raised pl-2.5 pr-7 text-xs text-text outline-none hover:bg-control-hover focus:border-focus"
      >
        {children}
      </select>
      <ChevronDownIcon size="xs" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
    </div>
  );
}

function FontRow(props: { label: string; hint: string; defaultLabel: string; value: string | null; fonts: string[]; onChange: (font: string | null) => void }) {
  const { label, hint, defaultLabel, value, fonts, onChange } = props;

  return (
    <PreferencesRow label={label} hint={hint}>
      <SelectField ariaLabel={label} value={value ?? ''} onChange={(next) => onChange(next || null)}>
        <option value="">{defaultLabel}</option>
        {withCurrent(fonts, value).map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </SelectField>
    </PreferencesRow>
  );
}

function TypographyGroup() {
  const { uiFont, codeFont, codeSize, tabSize } = useTypography();
  const { data: fonts } = useInstalledFonts();

  return (
    <PreferencesGroup label="Fonts">
      <FontRow
        label="Interface font"
        hint="Menus, sidebars, comments and the guide."
        defaultLabel="System default"
        value={uiFont}
        fonts={fonts?.all ?? []}
        onChange={setUiFont}
      />
      <FontRow
        label="Code font"
        hint="Diffs, file contents and code in comments. Lists monospaced fonts."
        defaultLabel="Default monospace"
        value={codeFont}
        fonts={fonts?.monospaced ?? []}
        onChange={setCodeFont}
      />
      <PreferencesRow label="Code font size" hint="Diffs and file contents.">
        <Stepper
          ariaLabel="Code font size"
          value={codeSize}
          steps={CODE_SIZES}
          defaultValue={DEFAULT_CODE_SIZE}
          format={(value) => `${value}px`}
          onChange={setCodeSize}
        />
      </PreferencesRow>
      <PreferencesRow label="Tab width" hint="Spaces a tab character takes up in code.">
        <SegmentedControl<string>
          ariaLabel="Tab width"
          value={String(tabSize)}
          options={TAB_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
          onChange={(next) => setTabSize(Number(next) as TabSize)}
        />
      </PreferencesRow>
    </PreferencesGroup>
  );
}

function WrapLinesRow() {
  const wrapLines = useTypography((state) => state.wrapLines);

  return (
    <PreferencesRow label="Long lines" hint="Off keeps each line on one row; scroll a file sideways with the trackpad, Shift-scroll or the bar under it.">
      <SegmentedControl<'wrap' | 'scroll'>
        ariaLabel="Long lines"
        value={wrapLines ? 'wrap' : 'scroll'}
        options={[
          { value: 'wrap', label: 'Wrap' },
          { value: 'scroll', label: 'Scroll' },
        ]}
        onChange={(next) => setWrapLines(next === 'wrap')}
      />
    </PreferencesRow>
  );
}

export function GeneralPane() {
  return (
    <PreferencesPane>
      <PreferencesGroup label="Appearance">
        <PreferencesRow stacked label="Theme" hint={`System switches with your ${isMac ? 'macOS' : 'desktop'} appearance.`}>
          <ThemePicker />
        </PreferencesRow>
        <PreferencesRow stacked label="Diff colours" hint="Colours for added and removed lines, stats and status letters.">
          <DiffColoursPicker />
        </PreferencesRow>
      </PreferencesGroup>
      <TypographyGroup />
      <PreferencesGroup label="Diffs">
        <DiffLayoutRow />
        <WrapLinesRow />
        <DiffIgnoreRow />
      </PreferencesGroup>
    </PreferencesPane>
  );
}
