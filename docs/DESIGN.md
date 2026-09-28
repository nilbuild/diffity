# Diffity design system

The rules every UI change must follow. Tokens live in `apps/desktop/src/styles.css`, primitives in
`apps/desktop/src/components/ui`, the icon set in `apps/desktop/src/components/ui/icon.tsx`.

**Reference look:** the un.ms Research app. Warm paper surfaces, dark warm-brown ink, a serif display face for
titles, a quiet sans for UI, tan chips and folder tabs, one green accent, thin warm borders, round
pills and circular outlined icon buttons. It should feel like a calm reading tool, not a dashboard.

## Hard rules

1. **No shadows.** No `shadow-*`, `drop-shadow-*`, `ring-*` or `box-shadow`, including focus rings. Tailwind's
   shadow scales are reset in `@theme`. Separate surfaces with a surface step (canvas → paper → tan) and 1px warm borders.
2. **Focus uses `outline`**, never a ring. A global `:focus-visible` rule (2px `--focus-ring`, offset 1px) applies to
   everything. Text fields show focus as `border-accent`.
3. **Icons come only from `@/components/ui/icon`** (Phosphor, `fill` weight). Never import `@phosphor-icons/react`
   directly and never hand-roll an `<svg>` (the only exception is `Spinner`).
4. **Colours come only from tokens.** No hex, `rgb()` or Tailwind palette colours in components. Use opacity modifiers on
   tokens for tints (`bg-danger/10`, `border-accent/50`).
5. **Use the primitives.** Extend a primitive with a variant rather than restyling a raw element in a feature.
6. Code style (mandatory): destructure props inside the function body, never in the signature; use early returns;
   put braces around every `if` body; don't comment the obvious.

## Tokens

All colours are CSS variables on `:root`, redefined for dark mode (`html[data-theme='dark']`, set by `lib/theme.ts`)
and re-scopable with `[data-theme-preview]`. Tailwind utilities map 1:1 (`bg-paper`, `text-fg-muted`…). Light values
were sampled from the reference screenshots; dark is a warm charcoal/brown counterpart, never neutral grey or navy.

### Surfaces

| Token        | Light     | Dark      | Use |
|--------------|-----------|-----------|-----|
| `canvas`     | `#f0ede7` | `#1d1a17` | App background: title bar, sidebars, agent panel, page background, active folder tab |
| `panel`      | `#f0ede7` | `#1d1a17` | Alias of canvas for chrome (kept for older call sites) |
| `paper`      | `#fbf9f5` | `#231f1b` | Content sheets: diff/code, conversation card, comment bubbles, inputs, lists on the welcome page |
| `raised`     | `#faf7f2` | `#27231e` | Popovers, menus, toasts |
| `muted`      | `#e5d7c4` | `#3b3229` | Tan: chips, inactive folder tabs, segmented-control track, selected toggle fill, user chat bubble |
| `muted-soft` | `#ebe4da` | `#2d2823` | Soft tan: thread cards, composer box, file headers, count pills inside chips, inline code |
| `hover`      | brown 7%  | cream 6%  | Hover fill (translucent, works on any surface) |
| `active`     | brown 11% | cream 10% | Pressed state |
| `selected`   | brown 9%  | cream 8%  | Current row in the sidebar and tree (plus `font-medium text-fg`) |

### Borders

| Token           | Light     | Dark      | Use |
|-----------------|-----------|-----------|-----|
| `border-subtle` | `#e6ded2` | `#2c2722` | Dividers inside a sheet, section rules |
| `border`        | `#dbd4ca` | `#37312a` | Default: panes, cards, inputs, outline pills. Global default border colour |
| `border-strong` | `#c5bcb0` | `#4b433a` | Hovered outline pills and inputs |

### Text

| Token       | Light     | Dark      | Use |
|-------------|-----------|-----------|-----|
| `fg`        | `#362a22` | `#ede5d9` | Titles, selected rows, primary text |
| `fg-muted`  | `#685f58` | `#b4a998` | Body copy, idle sidebar rows, labels, icons in circular buttons |
| `fg-subtle` | `#9a9189` | `#80766a` | Counts, meta, placeholders, line numbers |

### Accent and semantic colours

| Token          | Light     | Dark      | Use |
|----------------|-----------|-----------|-----|
| `accent`       | `#3f8548` | `#7dbb83` | Green text/icons: outline CTA ("AI review", "Add comment"), links, "Reply" |
| `accent-solid` | `#42884b` | `#4d9656` | Filled green pills: primary button, "Finish your review", ref dot, logo |
| `accent-soft`  | `#dde8d3` | green 14% | Green-tinted cards (welcome "Open folder"), accent badges |
| `accent-fg`    | `#ffffff` | `#ffffff` | Text on `accent-solid` |
| `added` / `success` | `#3f8548` | `#7dbb83` | Additions, added/untracked dot, resolved |
| `removed` / `danger` | `#b4483a` | `#e2907f` | Deletions, deleted dot, destructive actions, `must-fix` |
| `warning`      | `#a0701c` | `#d8b163` | Modified dot, pending, outdated, `question` |
| `renamed` / `info` | `#3e6e9c` | `#8bb2d6` | Renamed/copied dot, informational |
| `folder`       | `#a88a64` | `#c3a57d` | Folder icons in the tree |
| `backdrop`     | ink 28%   | black 55% | Dialog scrim |

### Diff colours (warm-tuned)

| Token                   | Light     | Dark        | Use |
|-------------------------|-----------|-------------|-----|
| `--diff-add-bg` / `-word` | `#e4eed8` / `#c3dcaa` | green 11% / 28% | Added line / word |
| `--diff-del-bg` / `-word` | `#f6e2d9` / `#ecbfae` | coral 11% / 28% | Deleted line / word |
| `--diff-hunk-bg` / `-fg`  | `#ece5da` / `#7d6c5a` | `#2a251f` / `#bba78d` | Hunk/expand separator rows |
| `--diff-expanded-bg`      | `#f5f1ea` | cream 2.5%  | Expanded context |
| `--diff-comment-bg` / `-gutter` | `#f8edc6` / `#ecd89c` | ochre 12% / 32% | Selected/commented line and its number |

## Typography

- `--font-serif`: **Source Serif 4** (variable, optical sizes), bundled locally via `@fontsource-variable/source-serif-4`
  and imported in `main.tsx`, so the offline app never hits a CDN. Use `font-serif font-semibold` for titles only:
  page/section titles (nav-bar label, "Conversation", PR title, settings section headings, dialog titles,
  empty-state headings, welcome "Diffity", agent run headers, markdown headings).
- `--font-sans`: system (SF Pro) → Inter → Segoe UI. All UI text.
- `--font-mono`: SF Mono → ui-monospace → JetBrains Mono. Code and file paths in diff headers.

| Class       | Size / line | Use |
|-------------|-------------|-----|
| `text-2xs`  | 11 / 16     | Meta, counts, badges, kbd |
| `text-xs`   | 12 / 16     | Buttons, pills, chips, toolbars, diff code (mono) |
| `text-sm`   | 13 / 20     | Body, sidebar/tree rows, menu rows, inputs, comments |
| `text-base` | 14 / 20     | Serif card titles (Conversation, run headers) |
| `text-lg`/`xl`/`3xl` | 16 / 18 / 30 | Serif: nav-bar title, dialog/settings/empty-state titles, PR title and welcome |

Weights: 400 body, 500 labels/buttons/selected rows, 600 serif titles. Section labels are sentence case, sans
`text-sm font-medium text-fg`, optionally followed by a hairline rule (`after:h-px after:flex-1 after:bg-border`).

## Shape and spacing

- Radii: `rounded-lg` 8px (menu rows, sidebar rows, inputs, inner bubbles) · `rounded-xl` 12px (cards, diff file cards,
  thread cards, composer, popovers, dialogs, folder-tab tops) · `rounded-full` (every button and pill, chips, badges,
  segmented controls, avatars, status dots, circular icon buttons).
- Heights: 24 `sm`, 28 `md` (default), 32 `lg`. Title bar `h-12`; sub-bars and sidebar headers `h-11`.
- Sidebar rows: `h-7 rounded-lg px-3`, inset `px-2` in the list; idle `text-fg-muted`, hover `bg-hover`,
  current `bg-selected font-medium text-fg`. A coloured 10px **status dot** replaces letter badges
  (added/untracked green, modified ochre, deleted red, renamed blue). Counts and stats are right-aligned `text-xs`.
- Generous but not loose: 12px gaps between cards, 16–20px dialog padding.

## Layout

```
┌ Title bar (canvas, h-12): traffic lights · repo / ● ref ▾ · folder tabs (Changes Files PR) ········ controls · ◯ ◯ ◯ ┐
│ Sidebar (canvas)  │ Nav bar (serif title · chip · actions) / diff sheets on canvas │ Agent panel (canvas) │
```

- **Breadcrumb:** repo menu (`text-sm font-medium`), a `/`, and the `RefPicker` (green dot + label). Branch lives in
  the git-sync pill on the right.
- **Folder tabs** (`Tabs variant="folder"`): `rounded-t-xl` tabs sitting on the title bar's bottom border; inactive are
  tan (`bg-muted`), the active one is `bg-canvas` and covers the border so it merges with the page.
- **Title-bar actions:** outline green pill for AI review, outline/filled pills for review and git sync, then
  circular icon buttons (`IconButton variant="circle"`) for shortcuts, settings and the agent panel.
- Panes are separated by `ResizeHandle` (1px line). Adjacent panes don't add their own border on that edge.

## Primitives (`components/ui`)

| Component | Import | Key props |
|-----------|--------|-----------|
| `Button` | `ui/Button` | Pills. `variant`: `primary` (filled green) \| `secondary` (warm outline, default) \| `outline` (green outline + green text, for CTAs) \| `ghost` \| `danger`; `size` `sm` 24 \| `md` 28 \| `lg` 32; `loading` |
| `IconButton` | `ui/IconButton` | `label` (aria-label + tooltip), `shortcut?`, `active?`, `size` `sm` \| `md`, `variant`: `ghost` (rounded-lg) \| `circle` (thin round outline, title bar) \| `primary`, `tooltipSide` |
| `Tooltip` / `useTooltip` | `ui/Tooltip` | Inverted ink pill (`bg-fg text-canvas`). 450ms delay |
| `SegmentedToggle` | `ui/SegmentedToggle` | Tan `rounded-full` track; selected segment is a `bg-paper` pill |
| `Tabs` | `ui/Tabs` | `variant`: `folder` (title bar) \| `underline` \| `pill` (tan when active) \| `list` (vertical nav, tan when active) |
| `Badge` / `CountBadge` | `ui/Badge` | `rounded-full` tinted pills. `neutral` is tan |
| `Kbd` | `ui/Kbd` | `bg-muted-soft` key cap |
| `Input` / `Textarea` | `ui/Input` | `bg-paper rounded-lg`, warm border, `focus:border-accent`. Filters use `wrapperClassName="rounded-full"` |
| `Popover` / `Menu` | `ui/Popover`, `ui/Menu` | `rounded-xl border bg-raised`; rows `rounded-lg text-sm` |
| `Dialog` | `ui/Dialog` | `rounded-xl bg-canvas`, serif `text-lg` title, borderless header, footer with a hairline |
| `confirmDialog()` | `ui/ConfirmDialog` | `await confirmDialog({ title, message, confirmLabel?, danger? })` |
| `EmptyState` | `ui/EmptyState` | Icon in a circular outline, serif `text-xl` title |
| `Spinner`, `ResizeHandle`, `Checkbox` / `Radio` / `CheckMark`, `Markdown` | | Unchanged APIs; checks are green, markdown headings are serif |

## Icons

- **Phosphor 2.1.10, `fill` weight**, set globally by `IconProvider` (`App.tsx`) — the reference's tab icons are solid
  glyphs. Bare glyphs that Phosphor draws inside a filled square (X, Plus, Code) use `bold` via `solidGlyph()`.
- Title-bar actions put the glyph inside a thin circular outline (`IconButton variant="circle"`, 14px glyph), matching
  the reference's top-right buttons.
- Sizes: 12 (inline with 11–12px text, pills), 14 (default, rows, circle buttons), 16 (28px ghost buttons), 20–24 (empty states).
- Idle icons inherit `fg-muted`/`fg-subtle`; use the accent only when the icon carries state or is an AI action.

## Comments

- **Composer** (`CommentComposer` → `MarkdownEditor`): one `rounded-xl bg-muted-soft` box. Header: label left, Write/Preview
  pill tabs and @ right. Inset `bg-paper rounded-lg` textarea. Footer inside the box: a "Severity ▾" outline pill menu, then
  Cancel (ghost), Add single comment (secondary), Start a review / Add review comment (primary).
- **Thread** (`ThreadCard`): `rounded-xl bg-muted-soft` card (dashed `border-warning/60` when pending, `border-accent`
  when active). Header "Line 5" + badges, Resolve/Collapse text pills, Ask Claude, overflow menu. Comments are `bg-paper`
  bubbles (20px avatar, author, bot pill, time, body). Footer: green "Reply".
- **Collapsed/resolved** threads shrink to a tan `rounded-full` pill ("N comments", badges).
- **Conversation**: `rounded-xl border bg-paper` card, serif title, green outline "+ Add comment".

## Agent panel, PR tab, settings

- **Run header:** circular green-outline icon, serif title with a human label ("Reviewing uncommitted changes",
  "Reviewing 85f5bf3 “Fix cache”" — `features/agent/ref-label.ts`, never a raw 40-char SHA), and a tan detail pill
  ("Focus: logic").
- **Working state:** a `bg-paper rounded-xl` card with spinner, "Claude Code is working", the current humanized step and an
  elapsed timer; shown for the whole run.
- Typed messages are right-aligned tan bubbles. Cards (tool groups, permission, run queue, PR, settings groups) are
  `rounded-xl border bg-paper`. Icon tiles are circular outlines. Example prompts are tan chips.
- **Theme previews:** `[data-theme-preview='light' | 'dark']` re-scopes tokens for Settings → Appearance swatches.
- Status pills (PR state) are `rounded-full` + `border-{tone}/30 bg-{tone}/12 text-{tone}`.

## Diff surface (`components/diff-surface`)

- `theme.ts` maps @pierre/diffs onto the tokens through `unsafeCSS`: code on `paper`, line backgrounds from `--diff-*`,
  word spans from `--diff-*-word`, hunk rows from `--diff-hunk-*`, split buffers hatched with `muted-soft`, numbers in `fg-subtle`.
- Syntax: Shiki **`everforest-light` / `everforest-dark`** (`DIFF_THEMES`) — warm, low-contrast palettes that sit on paper.
- Selection paints only code lines (`--diff-comment-bg` / `-gutter`); annotation rows stay `paper`.
- File cards: 12px radius, `::after` border overlay, sticky `muted-soft` header of `FILE_HEADER_HEIGHT` (36px) that is also
  passed as `itemMetrics.diffHeaderHeight`; change both together. Never add borders/padding that change item heights.
- Gutter "+" is an 18px `accent-solid` square with a 10px glyph. Single-file views render full-bleed on `paper`.

## Do / Don't

| Do | Don't |
|----|-------|
| Build hierarchy with canvas → paper → tan surfaces | Add shadows, glows or rings |
| Use serif only for titles | Set body text, buttons or code in serif |
| Use `rounded-full` pills for every button and chip | Mix square buttons into pill rows |
| Use status dots and right-aligned counts in lists | Bring back letter badges or heavy row fills |
| Use green for the one primary action per area | Use green for decoration or selection |
| Show human labels (ref names, short SHAs with subjects) | Show raw 40-char SHAs or internal tool names |
