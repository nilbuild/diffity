# Diffity design system

The rules every UI change must follow. Tokens live in `apps/desktop/src/styles.css`, primitives in
`apps/desktop/src/components/ui`, the icon set in `apps/desktop/src/components/ui/icon.tsx`.
Reference look: the previous Diffity web UI (`~/Vibecode/diffity/packages/ui`), which follows GitHub's
light palette and a neutral-grey dark palette. Dense, flat, calm: text-xs chrome, contrast from surface
steps rather than heavy borders, blue only for primary actions, links and selection.

## Hard rules

1. **No shadows.** No `shadow-*`, `drop-shadow-*`, `ring-*` or `box-shadow`, including focus rings.
   Tailwind's shadow scales are reset in `@theme`, so `shadow-*` classes generate nothing.
   Separate surfaces with a 1px border plus a surface step. Floating layers (popover, menu,
   dialog, tooltip) use `border-border-strong`.
2. **Focus uses `outline`**, never a ring. A global `:focus-visible` rule (2px `--focus-ring`, offset 1px)
   already applies to everything. Text fields show focus as `border-accent` and suppress the outline.
3. **Icons come only from `@/components/ui/icon`**, which is Phosphor in the `fill` weight. Never import
   `@phosphor-icons/react` directly, and never hand-roll an `<svg>`. The only exception is `Spinner`.
4. **Colours come only from tokens.** Never write hex, `rgb()`, or Tailwind palette colours
   (`bg-blue-500`, `text-gray-400`) in components. Use opacity modifiers on tokens for tints
   (`bg-danger/10`, `border-warning/40`).
5. **Use the primitives.** Don't restyle a raw `<button>`, `<input>`, popover or dialog when a
   primitive exists. If one is missing a variant, extend the primitive; don't fork it in a feature.
6. Code style (mandatory): destructure props inside the function body, never in the signature;
   use early returns; put braces around every `if` body; don't comment the obvious.

## Tokens

All colours are CSS variables on `:root`, redefined for dark mode. Tailwind utilities map 1:1
(`bg-panel`, `text-fg-muted`, `border-border-strong`…). The theme is applied via
`html[data-theme]`, which `lib/theme.ts` always sets, so a `dark:` variant exists but should be rare.

Values come from the previous app's `app.css` (light = GitHub, dark = neutral greys with rgba tints).

### Surfaces (from back to front)

| Token      | Light     | Dark      | Use |
|------------|-----------|-----------|-----|
| `canvas`   | `#ffffff` | `#171717` | Main content: diff/code area, comment bubbles, text fields |
| `panel`    | `#f6f8fa` | `#1a1a1a` | Chrome: toolbar, sidebars, sub-toolbars, file headers, thread cards, popovers |
| `raised`   | `#ffffff` | `#1a1a1a` | Dialogs and cards that sit on `panel` |
| `muted`    | `#eaeef2` | `#262626` | Neutral fill: comment composer box, segmented control track, summary chips, inline code |
| `hover`    | `rgba(208,215,222,.32)` | `rgba(161,161,170,.10)` | Hover fill for rows and ghost controls (translucent, works on any surface) |
| `active`   | `rgba(208,215,222,.48)` | `rgba(161,161,170,.18)` | Current row (with a 2px `border-l-accent`), pressed state |
| `selected` | = `active` | = `active` | Alias kept for older call sites |

### Borders

| Token           | Light     | Dark      | Use |
|-----------------|-----------|-----------|-----|
| `border-subtle` | `#d8dee4` | `#1f1f1f` | Row dividers, diff gutter/content separator |
| `border`        | `#d0d7de` | `#262626` | Default: panes, file cards, inputs, secondary buttons. Global default border colour |
| `border-strong` | `#afb8c1` | `#3a3a3a` | Floating layers (popover, menu, dialog, tooltip), hovered inputs |

### Text

| Token       | Light     | Dark      | Use |
|-------------|-----------|-----------|-----|
| `fg`        | `#1f2328` | `#e5e5e5` | Primary text |
| `fg-muted`  | `#656d76` | `#a3a3a3` | Secondary text, labels |
| `fg-subtle` | `#8b949e` | `#737373` | Meta text, placeholders, line numbers, idle icons |

### Accent and semantic colours

| Token          | Light     | Dark      | Use |
|----------------|-----------|-----------|-----|
| `accent`       | `#0969da` | `#60a5fa` | Links, text actions ("Reply", "Add comment"), active tab indicator, focus |
| `accent-hover` | `#0550ae` | `#93c5fd` | Hovered links/text actions |
| `accent-solid` | `#0969da` | `#3b82f6` | Filled backgrounds under white text: primary button, active segment, gutter "+" |
| `accent-soft`  | `#ddf4ff` | `rgba(96,165,250,.12)` | Tinted backgrounds (user chat bubble, icon tiles). For toggles prefer `bg-accent/12` |
| `accent-fg`    | `#ffffff` | `#ffffff` | Text on `accent-solid` |
| `added`        | `#1a7f37` | `#4ade80` | Additions, A/U status |
| `removed`      | `#cf222e` | `#f87171` | Deletions, D status |
| `renamed`      | `#0969da` | `#60a5fa` | R/C status |
| `success`      | `#1a7f37` | `#4ade80` | Resolved, viewed |
| `warning`      | `#9a6700` | `#facc15` | Modified (M), pending, outdated, `question` |
| `danger`       | `#cf222e` | `#f87171` | Errors, destructive actions, `must-fix` |
| `info`         | `#0969da` | `#60a5fa` | Informational callouts |
| `backdrop`     | black 40% | black 60% | Dialog scrim |

### Diff colours

| Token                  | Light     | Dark                   | Use |
|------------------------|-----------|------------------------|-----|
| `--diff-add-bg`        | `#dafbe1` | `rgba(34,197,94,.10)`  | Added line (content and gutter) |
| `--diff-add-word`      | `#abf2bc` | `rgba(34,197,94,.35)`  | Word-level addition |
| `--diff-del-bg`        | `#ffebe9` | `rgba(239,68,68,.10)`  | Deleted line |
| `--diff-del-word`      | `rgba(255,129,130,.4)` | `rgba(239,68,68,.35)` | Word-level deletion |
| `--diff-hunk-bg` / `-fg` | `#ddf4ff` / `#0969da` | `rgba(96,165,250,.10)` / `#60a5fa` | Hunk/expand separator rows |
| `--diff-expanded-bg`   | `#f6fcff` | `rgba(96,165,250,.05)` | Expanded context |
| `--diff-comment-bg`    | `#fff8c5` | `rgba(234,179,8,.10)`  | Selected/commented code line (yellow) |
| `--diff-comment-gutter`| `#ecd364` | `rgba(234,179,8,.30)`  | Line number of a selected/commented line |

`add-bg`, `del-bg`, `hunk-bg/fg`, `comment-bg/gutter` also exist as Tailwind colours (`bg-diff-comment-bg`…).

Tinted badge recipe: `rounded-full bg-{tone}/15 text-{tone}` (the `Badge` primitive). Callouts add `border border-{tone}/30`.

**Where colour goes:** blue marks primary actions, links/text actions, the current tab and the current row's left edge.
Semantic colours mark status only. Everything else stays grey.

### Type scale (system font, 13px base)

`--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`
`--font-mono: 'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Menlo', monospace`

| Class       | Size / line | Use |
|-------------|-------------|-----|
| `text-2xs`  | 11 / 16     | Meta text, badges, kbd, counts, section labels in dense lists |
| `text-xs`   | 12 / 16     | **Chrome default**: buttons, menu items, toolbars, labels, file headers (mono), diff code (mono) |
| `text-sm`   | 13 / 20     | Body text: comments, file-tree rows, inputs |
| `text-base` | 14 / 20     | Section titles in dialogs and settings, PR title |
| `text-lg`   | 16 / 24     | Page titles (rare) |

Don't use arbitrary sizes (`text-[13px]`). Weights: 400 body, 500 labels/buttons/tabs, 600 titles and file names.
Section labels are sentence case, `text-xs font-medium text-fg-muted`, not uppercase tracking.

### Radii

`rounded-sm` 4px (status letters, kbd, menu rows, gutter "+") · `rounded-md` 6px (buttons, inputs, toggles, inset text field) ·
`rounded-lg` 8px (thread cards, comment bubbles, composer box, popovers, dialogs, file cards). `rounded-full` for badges, avatars, dots.
`rounded-xl` and larger are not used.

### Spacing and density

- Base on a 4px grid. Common steps are `1` (4px), `1.5` (6px), `2` (8px), `3` (12px) and `4` (16px).
- **Control heights:** 24px `h-6` (`sm`: inline, dense lists, card actions), 28px `h-7` (`md`: default,
  toolbars, panel headers), 32px `h-8` (`lg`: forms, hero actions).
- **Bars:** the app toolbar is `h-11`. Pane headers and sub-toolbars are `h-9` with `px-2` or `px-3` and `border-b border-border`.
- **List rows:** `h-7` (file sidebar), 24px for the virtualised tree, `text-sm`. Rows use `border-l-2 border-l-transparent hover:bg-hover`;
  the current row uses `bg-active border-l-accent`. Viewed files are `opacity-50` with a struck-through name.
- **Status letters:** 18px `rounded-sm font-mono text-2xs font-bold`, `bg-{added|removed|warning|renamed}/15`.
- **Comment counts:** `CommentCount` (icon + number, `text-accent` in lists, `text-fg-subtle` in file headers), not pills.
- **Card padding:** `px-3 py-2` for dense cards (threads, tool calls), `p-4` for dialogs and settings panels.
- Gaps: 4px between icon buttons, 6–8px between buttons, 12px between cards.

## Layout skeleton

```
┌ Toolbar (bg-panel, h-11, border-b) ────────────────────────────────────────────┐
│ Sidebar (bg-panel) │ ResizeHandle │ Main (bg-canvas)          │ ResizeHandle │ Agent (bg-panel) │
```

Panes are separated only by `ResizeHandle` (the 1px `bg-border` line). Adjacent panes must not add their own border on that edge.
The diff renders as a column of bordered file cards (8px radius, sticky 36px `bg-panel` header with a `border-b`, mono 12px path)
inset 12px inside the canvas. The sub-toolbar above it (`CommentNavBar`) is `bg-panel` with a `bg-muted` "N files changed +a −d" chip.

## Comments

- **Composer** (`CommentComposer` → `MarkdownEditor`): one flat `bg-muted rounded-lg` box. Header row: label
  ("Add a comment on line 5") left, tiny Write/Preview tabs and the @ button right. Then an inset `bg-canvas rounded-md`
  textarea. Footer inside the box: severity dropdown (`SeverityPicker`, a ghost "Severity ▾" menu) left;
  Cancel (ghost), Add single comment (secondary), Start a review / Add review comment (primary) right, all `md` (28px).
  No card around it, no border.
- **Thread** (`ThreadCard`): `bg-panel rounded-lg`, no border (pending threads get a dashed `border-warning/60`, the active one
  `border-accent`). Header: mono `text-2xs text-fg-subtle` "Line 5", severity/status badges; right side: Ask Claude,
  "Resolve"/"Reopen" and "Collapse" as tiny text actions, overflow menu. Each comment is a `bg-canvas rounded-lg px-3 py-2.5`
  bubble: 20px avatar, `text-xs font-semibold` author, `bot` pill, `text-2xs` time, body indented `pl-7`. Footer: accent "Reply" link.
- **Collapsed/resolved thread:** a single inline 24px button (comment icon, "N comments", badges).
- **Conversation** (general comments): `rounded-lg bg-panel` (or `bg-accent/5` when non-empty) header with accent "Add comment" link,
  body is an inset `bg-canvas rounded-md` well holding thread cards.

## Primitives (`components/ui`)

| Component | Import | Key props |
|-----------|--------|-----------|
| `Button` | `ui/Button` | `variant`: `primary` (solid `accent-solid`) \| `secondary` (transparent + `border`, default) \| `ghost` \| `danger`; `size`: `sm` 24 \| `md` 28 `px-3 text-xs` (default) \| `lg` 32; `loading` (shows Spinner, disables). Put icons as children before the label |
| `IconButton` | `ui/IconButton` | `label` (required; it is the aria-label and the tooltip), `shortcut?` shown in the tooltip, `active?` (`bg-accent/12 text-accent`), `size`: `sm` 24 \| `md` 28, `variant`: `ghost` \| `primary`, `tooltipSide`. Idle icon colour is `fg-subtle` |
| `Tooltip` / `useTooltip` | `ui/Tooltip` | `useTooltip(content, side)` returns `{ anchorProps, tooltip }` for custom triggers; `<Tooltip content>` wraps arbitrary children. 450ms delay, portal, bordered |
| `SegmentedToggle` | `ui/SegmentedToggle` | `value`, `options: {value,label,title?}[]`, `onChange`, `size`: `sm` \| `md`. `bg-muted` track, selected segment is solid `accent-solid` with white text (old toolbar style) |
| `Tabs` | `ui/Tabs` | `value`, `items: {value,label,icon?,count?}[]`, `onChange`, `variant`: `underline` (toolbar and pane headers; 2px accent indicator, fills parent height) \| `pill` \| `list` (vertical nav) |
| `Badge` / `CountBadge` | `ui/Badge` | `tone`: `neutral` \| `accent` \| `success` \| `warning` \| `danger` \| `info`. `CountBadge` has `count`, `icon?` (12px pill) |
| `Kbd` | `ui/Kbd` | children, e.g. `⌘L` |
| `Input` / `Textarea` | `ui/Input` | `Input`: `size` `sm` \| `md` \| `lg`, `icon` (leading), `trailing`, `mono`, `invalid`, `wrapperClassName`; `className` targets the `<input>`. `Textarea`: `mono`, `invalid`. Both use `bg-canvas` and `focus:border-accent` |
| `Popover` | `ui/Popover` | `open`, `onOpenChange`, `anchorRef`, `align`: `start` \| `end`, `side`: `bottom` \| `top` (flips automatically when out of room). Portal, closes on outside click and Escape |
| `Menu` | `ui/Menu` | `trigger({onClick, ref, open})`, `items: (MenuItem \| 'separator' \| {heading})[]` where `MenuItem = {label, icon?, hint?, danger?, disabled?, checked?, onSelect}`. For custom menus inside a `Popover`, compose `MenuList`, `MenuRow` (`icon`, `hint`, `description`, `checked`, `danger`), `MenuHeading` and `MenuSeparator` |
| `Dialog` | `ui/Dialog` | `open`, `onOpenChange`, `title?`, `description?`, `footer?`, `padded` (default true, `p-4` body), `className` for width/height. Header has a close button, footer is `bg-panel` and right-aligned. Escape and scrim click close it |
| `confirmDialog()` | `ui/ConfirmDialog` | `await confirmDialog({ title, message, confirmLabel?, danger? })` resolves to a boolean |
| `EmptyState` | `ui/EmptyState` | `icon?` (pass a 20px icon; it sits in a 40px bordered tile), `title`, `description?`, `action?`, `tone`: `neutral` \| `danger` |
| `Spinner` | `ui/Spinner` | `size` (default 14), `className` (colour via `text-*`) |
| `ResizeHandle` | `ui/ResizeHandle` | `value`, `onChange`, `min`, `max`, `direction` (`left` means the pane is to the right). Renders a 1px border line with a 7px invisible hit area, showing a 2px accent line only while hovered or dragged |
| `Checkbox` / `Radio` / `CheckMark` | `ui/Checkbox` | `Checkbox`: `checked`, `onChange(checked)`, `label?`, `description?`, `disabled?`. `Radio`: `checked`, `onSelect`, `label?`, `description?`. `CheckMark` is the bare 16px box (`tone`: `accent` \| `success`) for custom toggles such as the diff "Viewed" pill. Never use a native `<input type="checkbox">` |
| `Markdown` | `components/markdown/Markdown` | `compact` (13px, for comments and chat). Default is 14px (PR bodies and previews). `mentions` renders `@claude` (outside code/links) as an accent pill. Handles mermaid, external links and a copy button on code blocks |

## Icons

- Library: **`@phosphor-icons/react` 2.1.10**, weight **`fill`**, set globally by `IconProvider` in `App.tsx`.
- Import semantic names from `@/components/ui/icon` (`CommentIcon`, `SparklesIcon`, `GitBranchIcon`…). If you need
  a new icon, add a re-export there with an `…Icon` name. Check its fill variant first: if Phosphor draws
  the glyph inside a filled square (as it does for X, Plus, Code, Check, TextT, Minus and DotsThree), pick a solid
  alternative or wrap it with `solidGlyph()` (the `bold` weight), as `XIcon`, `PlusIcon` and `CodeIcon` do.
- **Sizes:** 12 for icons inline with 11–12px text, badges, chips and small (`sm`) buttons; 14 is the default
  (menu rows, `md` buttons, `sm` icon buttons, list rows); 16 for 28px toolbar/header icon buttons;
  20 inside `EmptyState`; 24 for hero marks. Don't use 10, 11, 13 or 15.
- Colour: idle icons use `text-fg-muted` (or `text-fg-subtle` in meta rows) and inherit `currentColor`. Use accent or
  semantic colour only when the icon carries state (AI actions use `text-accent`, a viewed check uses `text-success`).
- Always pair icon-only controls with `IconButton` so they get a label and tooltip.
- Mapping conventions: AI actions use `SparklesIcon`, explain uses `LightbulbIcon`, comments use `CommentIcon`, revert uses `UndoIcon`,
  close uses `XIcon`, overflow menus use `MoreIcon`, and disclosure uses `ChevronRightIcon` rotated 90° when open.

## Agent panel, PR tab, settings (agents-ui)

- **Theme previews.** `[data-theme-preview='light' | 'dark']` on any element re-scopes the colour tokens for its subtree
  (`styles.css`), so mini previews (Settings → Appearance swatches) use normal token classes, never hex.
- **Agent timeline.** Typed messages are right-aligned `accent-soft` bubbles; runs started by an action (Review, Resolve,
  `@claude` thread, review feedback) render a `RunHeader` (accent icon tile + title + mono detail) instead. Agent text is
  full-width `Markdown compact`. Consecutive tool calls collapse into a quiet "N steps" row (12px icons, `text-fg-subtle`),
  thinking is a muted disclosure, pending steps use a 1.5px `border-border-strong` ring (not an icon).
- **Permission card:** `border-warning/50` card, "Claude wants to edit `path`", embedded diff, `panel` footer with
  **Allow once** (primary), Always allow (secondary) and Deny (ghost, right). Answered requests collapse to one line.
- **Status pills** (PR state) use `rounded-full` + `border-{tone}/30 bg-{tone}/12 text-{tone}`; checks and review decision
  are icon + label in the tone colour.
- Settings rows: `SettingGroup` (bordered `raised` card, `divide-border-subtle`) with label + description left, control right.

## Diff surface (`components/diff-surface`)

- `theme.ts` maps @pierre/diffs onto the tokens through `unsafeCSS` (the `unsafe` layer beats the library's base layer; our CSS
  variables inherit into its encapsulated DOM). It sets line backgrounds directly from `--diff-*` (instead of the library's colour
  mixing), word-diff spans from `--diff-*-word`, hunk separators from `--diff-hunk-*`, and line numbers in `fg-subtle`.
- Syntax: Shiki `github-light` / `github-dark` (`DIFF_THEMES`), same as the old app. Indicators are `classic` (+/− column).
  Hunk separators are `line-info-basic` (full-width `diff-hunk-bg` row with expand buttons).
- **Selection** paints only code lines: `--diff-comment-bg` on the line, `--diff-comment-gutter` on its number. Annotation rows
  (composer, threads) always stay `canvas` — never let the selection tint reach `[data-line-annotation]`.
- Gutter "+" (`[data-utility-button]`) is an 18px `accent-solid` square with 4px radius and a 10px glyph.
- `SURFACE_TOKEN_CSS` is colours only (embedded diffs like the permission preview). `SURFACE_UNSAFE_CSS` adds the file-card chrome.
  The file header is `FILE_HEADER_HEIGHT` (36px) and CodeSurface passes the same value as `itemMetrics.diffHeaderHeight`; change both
  together. Never add borders or padding that change item heights; draw card edges with the `::after` overlay.
- Single-file views (`hideFileHeader`) render full-bleed with no card.

## Do / Don't

| Do | Don't |
|----|-------|
| Separate with `border-border` and a surface step (`panel` next to `canvas`) | Add `shadow-*`, `ring-*` or glows |
| Use `bg-active` + `border-l-accent` for the current row and `bg-accent/12` for an on toggle | Use `bg-accent` fills for list selection |
| Use `accent-solid` for filled accent backgrounds | Put white text on `accent` in dark mode (contrast fails) |
| Keep comment UI flat: `muted` composer box, `panel` thread card, `canvas` bubbles | Nest bordered boxes inside bordered boxes |
| Use `Button`/`IconButton`/`Input` | Hand-style `<button>`/`<input>` with ad-hoc classes |
| Use `text-2xs`…`text-lg` | Use `text-[13px]` or other arbitrary sizes |
| Use 12/14/16/20/24 icon sizes | Use 10/11/13/15 or hand-rolled SVG |
| Write sentence-case section labels | Use uppercase tracking-wider labels |
| Tint status with `/15` backgrounds and `/30–/40` borders | Use solid semantic backgrounds except for `danger` buttons |
| Keep chrome (`panel`) and content (`canvas`) distinct | Nest `raised` cards inside `raised` cards without a border |
