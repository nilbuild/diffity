# Diffity design system

The rules every UI change must follow. Tokens live in `apps/desktop/src/styles.css`, primitives in
`apps/desktop/src/components/ui`, the icon set in `apps/desktop/src/components/ui/icon.tsx`.
Reference feel: GitHub's PR review UI with Linear/Raycast polish. It should read as a dense,
calm desktop tool.

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

### Surfaces (from back to front)

| Token      | Light     | Dark      | Use |
|------------|-----------|-----------|-----|
| `canvas`   | `#ffffff` | `#0d1117` | Main content: the diff/code area, PR page, welcome page, text fields |
| `panel`    | `#f6f8fa` | `#151a22` | Chrome: toolbar, sidebars, agent panel, card headers, dialog footer |
| `raised`   | `#ffffff` | `#1c222c` | Cards, secondary buttons, popovers, dialogs, tooltips |
| `hover`    | `#eef1f4` | `#222a35` | Hover fill for rows and ghost controls |
| `active`   | `#e4e8ed` | `#2b3441` | Pressed/current neutral state (pill tabs, list nav) |
| `muted`    | `#eef1f4` | `#232b36` | Neutral fill: neutral badges, inline code |
| `selected` | `#e7effe` | `#1b2c48` | Selected row in a list or tree (accent-tinted) |

### Borders

| Token           | Light     | Dark      | Use |
|-----------------|-----------|-----------|-----|
| `border-subtle` | `#e8ebef` | `#212833` | Row dividers inside a bordered container |
| `border`        | `#d5dbe2` | `#2d3541` | Default: panes, cards, inputs, secondary buttons. This is also the global default border colour |
| `border-strong` | `#b9c1cb` | `#3d4756` | Floating layers, hovered inputs and buttons, selected segment |

### Text

| Token       | Light     | Dark      | Use |
|-------------|-----------|-----------|-----|
| `fg`        | `#1f2328` | `#e6edf3` | Primary text, titles |
| `fg-muted`  | `#4f5864` | `#9aa4b2` | Secondary text, idle icons, labels |
| `fg-subtle` | `#6a737d` | `#7d8794` | Meta text, placeholders, counts, line numbers. Passes WCAG AA on canvas and panel |

### Accent and semantic colours

| Token          | Light     | Dark      | Use |
|----------------|-----------|-----------|-----|
| `accent`       | `#2563eb` | `#4c8dff` | Links, active tab indicator, focus, accent text and icons |
| `accent-solid` | `#2563eb` | `#2f6fed` | Filled backgrounds under white text (primary button). Use this, not `accent`, for fills |
| `accent-soft`  | `#e7effe` | `#19294a` | Tinted backgrounds: accent badges, active toggle, user chat bubble |
| `accent-fg`    | `#ffffff` | `#ffffff` | Text on `accent-solid` |
| `added`        | `#1a7f37` | `#3fb950` | Diff additions: `+n` stats, A/U status, diff line colour |
| `removed`      | `#d1242f` | `#f85149` | Diff deletions: `−n` stats, D status |
| `success`      | `#1a7f37` | `#3fb950` | Resolved, viewed, logged in, completed |
| `warning`      | `#9a6700` | `#d29922` | Modified (M), stale, outdated, pending permission, `question` |
| `danger`       | `#d1242f` | `#f85149` | Errors, destructive actions, `must-fix` |
| `info`         | `#0969da` | `#58a6ff` | Neutral informational callouts |
| `backdrop`     | ink 36%   | black 60% | Dialog scrim |

Tinted badge and callout recipe: `bg-{tone}/12 text-{tone}`, adding `border border-{tone}/30` or `/40` for callouts.

**Where colour goes:** the accent marks primary actions, the current tab, selection and focus.
Semantic colours mark status: file status letters (M/A/D/R/U), severity tags, thread status and diff stats.
Everything else stays neutral.

### Type scale (system font, 13px base)

`--font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif`
`--font-mono: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace`

| Class       | Size / line | Use |
|-------------|-------------|-----|
| `text-2xs`  | 11 / 16     | Meta text, badges, kbd, counts, section labels in dense lists |
| `text-xs`   | 12 / 16     | Secondary UI text, sidebar meta, small buttons, code in diffs (mono) |
| `text-sm`   | 13 / 20     | **Default** body and UI text, menu items, inputs, buttons |
| `text-base` | 14 / 20     | Section titles in dialogs and settings, PR title |
| `text-lg`   | 16 / 24     | Page titles (rare) |

Don't use arbitrary sizes (`text-[13px]`). Weights: 400 body, 500 labels/buttons/tabs, 600 titles and file names.
Section labels are sentence case, `text-xs font-medium text-fg-muted`, not uppercase tracking.

### Radii

`rounded-sm` 4px (badges, kbd, menu rows, inline chips) · `rounded-md` 6px (buttons, inputs, toggles, small cards) ·
`rounded-lg` 8px (cards, popovers, dialogs, diff file cards). Use `rounded-full` only for dots and count pills.
`rounded-xl` and larger are not used.

### Spacing and density

- Base on a 4px grid. Common steps are `1` (4px), `1.5` (6px), `2` (8px), `3` (12px) and `4` (16px).
- **Control heights:** 24px `h-6` (`sm`: inline, dense lists, card actions), 28px `h-7` (`md`: default,
  toolbars, panel headers), 32px `h-8` (`lg`: forms, hero actions).
- **Bars:** the app toolbar is `h-11`. Pane headers and sub-toolbars are `h-9` with `px-2` or `px-3` and `border-b border-border`.
- **List rows:** `h-7` with `px-3` (file sidebar), 24px for the virtualised tree. Rows use `hover:bg-hover`,
  the current row uses `bg-selected`, and row dividers inside a container use `border-border-subtle`.
- **Card padding:** `px-3 py-2` for dense cards (threads, tool calls), `p-4` for dialogs and settings panels.
- Gaps: 4px between icon buttons, 6–8px between buttons, 12px between cards.

## Layout skeleton

```
┌ Toolbar (bg-panel, h-11, border-b) ────────────────────────────────────────────┐
│ Sidebar (bg-panel) │ ResizeHandle │ Main (bg-canvas)          │ ResizeHandle │ Agent (bg-panel) │
```

Panes are separated only by `ResizeHandle` (the 1px `bg-border` line). Adjacent panes must not add their own border on that edge.
The diff renders as a column of flat bordered file cards (8px radius, `bg-panel` 44px header with a `border-b`) inset 12px inside the canvas.

## Primitives (`components/ui`)

| Component | Import | Key props |
|-----------|--------|-----------|
| `Button` | `ui/Button` | `variant`: `primary` \| `secondary` (default) \| `ghost` \| `danger`; `size`: `sm` 24 \| `md` 28 (default) \| `lg` 32; `loading` (shows Spinner, disables). Put icons as children before the label |
| `IconButton` | `ui/IconButton` | `label` (required; it is the aria-label and the tooltip), `shortcut?` shown in the tooltip, `active?` (accent-soft toggle state), `size`: `sm` 24 \| `md` 28, `variant`: `ghost` \| `primary`, `tooltipSide` |
| `Tooltip` / `useTooltip` | `ui/Tooltip` | `useTooltip(content, side)` returns `{ anchorProps, tooltip }` for custom triggers; `<Tooltip content>` wraps arbitrary children. 450ms delay, portal, bordered |
| `SegmentedToggle` | `ui/SegmentedToggle` | `value`, `options: {value,label,title?}[]`, `onChange`, `size`: `sm` \| `md` |
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

- `theme.ts` maps @pierre/diffs onto the tokens through `unsafeCSS` (the `unsafe` layer beats the theme's inline
  colours; our CSS variables inherit into the library's encapsulated DOM). Background is `canvas`, separators and
  buffers are `panel`, and add/remove use `added`/`removed`. Syntax colours still come from `pierre-light`/`pierre-dark`.
- `SURFACE_TOKEN_CSS` is colours only (use it for embedded diffs like the permission preview).
  `SURFACE_UNSAFE_CSS` adds the file-card chrome. The file header must stay exactly 44px tall because CodeView virtualises on that metric.
  Never add borders or padding that change item heights; draw card edges with the `::after` overlay.
- Single-file views (`hideFileHeader`) render full-bleed with no card.

## Do / Don't

| Do | Don't |
|----|-------|
| Separate with `border-border` and a surface step (`panel` next to `canvas`) | Add `shadow-*`, `ring-*` or glows |
| Use `bg-selected` for the current row and `accent-soft` for an on toggle | Use `bg-accent` fills for selection |
| Use `accent-solid` for filled accent backgrounds | Put white text on `accent` in dark mode (contrast fails) |
| Use `Button`/`IconButton`/`Input` | Hand-style `<button>`/`<input>` with ad-hoc classes |
| Use `text-2xs`…`text-lg` | Use `text-[13px]` or other arbitrary sizes |
| Use 12/14/16/20/24 icon sizes | Use 10/11/13/15 or hand-rolled SVG |
| Write sentence-case section labels | Use uppercase tracking-wider labels |
| Tint status with `/10–/12` backgrounds and `/30–/40` borders | Use solid semantic backgrounds except for `danger` buttons |
| Keep chrome (`panel`) and content (`canvas`) distinct | Nest `raised` cards inside `raised` cards without a border |
