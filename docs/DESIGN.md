# Diffity design

**UI = the ported diffity web UI.** The desktop frontend is the React UI of the diffity web app
(`~/Vibecode/diffity/packages/ui`) moved into `apps/desktop/src` and wired to the Tauri backend. It must look and
behave the same as the web app: same components, colours, fonts, icons, spacing and shortcuts. Treat it as a port,
not a redesign.

## Rules

1. **Reuse before adding.** New UI (desktop-only screens, Claude, reviews, GitHub sign-in) is built from the patterns
   that already exist: the button styles in `components/ui/button-styles.ts` (primary / outline / ghost / icon /
   group), `SegmentedToggle`, the options-menu dropdown (`overlayPanel`: `bg-overlay rounded-lg p-1 ring-1 ring-overlay-border`, no shadow,
   `menuItemClass`), the dialog shell of `github-dialog.tsx` / `confirm-dialog.tsx`, borderless lists
   (`h-7`/`h-8` rows with hover and selected fills), `CommentForm` buttons and `ThreadBadge`.
2. **Colours come from the tokens in `src/styles/app.css`** (`bg`, `bg-secondary`, `bg-tertiary`, `border`,
   `text`, `text-secondary`, `text-muted`, `accent`, `added`, `deleted`, `modified`, `diff-*`, `hover`, `active`, `selected`, `fill`, `fill-hover`, `raised`, `control-border`, `control-hover`, `overlay`, `overlay-border`). Dark mode
   is `[data-theme='dark']` on `<html>`, toggled by `hooks/use-theme.ts` (stored in `localStorage['diffity-theme']`).
   Fonts are Geist (UI, bundled locally) and the original diffity mono stack for code (see Type and density).
3. **Icons live in `src/components/icons`**, one component per file. The web app's icons are used as they are;
   new ones (sparkle, stop, refresh, external-link, folder-open, key, brand-logo) follow the same 16px, 1.5px stroke,
   `currentColor` style. No icon libraries.
4. **Desktop chrome.** Every page's top bar is `components/layout/title-bar.tsx`: the web toolbar plus
   `data-tauri-drag-region` and a 78px left inset for the macOS traffic lights (overlay title bar, lights at 14,13).
5. **Code style (mandatory for new or changed code):** destructure props inside the function body, never in the
   signature; use early returns; braces around every `if` body; no comments for the obvious. Ported code keeps its
   original style except where it had to change.

## Type and density

- Fonts: `@fontsource-variable/geist` (UI, imported in `main.tsx`, no CDN). Code keeps the original diffity mono stack:
  `'SF Mono', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', 'Menlo', monospace` (ligatures off). Mono is for
  code, diffs, paths, shas, line numbers and branch names; everything else is sans.
- Never change the root font size: `html` stays at 16px so Tailwind rem sizes are real pixels; `body` is 13px / 20px.
- Sizes: `text-xs` 12/16, `text-[13px]` UI base, `text-sm` 13/20, `text-base` 14/20; meta 11–12px. Code uses `.code-text`
  (13px / 22px rows); gutter numbers 12px tabular.
- Heights: title bar 44px (traffic lights are positioned for it), buttons and inputs 28px (`h-7`, `px-3`), small 24px,
  tree / list / menu rows 28–32px (`h-7`/`h-8`), file and thread headers 36px (`h-9`), History rows ~52px, context bar
  36px, status bar 28px. Sidebar 300px default, resizable 220px…50% of the window (drag the edge, double-click to reset,
  stored in `localStorage['diffity-sidebar-width']`).
- Spacing scale 4 / 8 / 12 / 16 / 20 / 24px. Sidebar inner padding 12px (header, filter and tree share one left edge);
  content padding 20–24px; diff blocks (general comments, outdated threads, file cards) are separate cards with a 16px gap.
  Radii: `rounded-md` controls and rows, `rounded-lg` cards, popovers and menus, `rounded-xl` dialogs.

## Surfaces, borders and colour

- **No shadows anywhere** (buttons, chips, popovers, menus, dialogs, toasts). Separation comes from a 1px border plus a
  surface colour.
- **Few borders.** Structural lines only: title bar bottom, context/PR bar bottom, sidebar edge, status bar top, card
  outlines, diff table internals, popover outline. Lists never get per-row borders or a box: rows use hover
  (`bg-hover`) and selected (`bg-selected` + accent icon/check) fills.
- Surfaces: `bg` content, `bg-secondary` chrome (title bar, sidebar, status bar, card headers), `overlay` +
  `ring-overlay-border` for popovers/menus/dialogs/toasts (white on a tinted page in light, lifted `#232323` in dark),
  `fill` / `fill-hover` for soft inputs and tracks, `raised` + `control-border` / `control-hover` for outlined buttons.
- Buttons (`components/ui/button-styles.ts`): `buttonPrimary` (accent solid; disabled = neutral fill, muted text),
  `buttonOutline` (1px `control-border`, raised fill, the default toolbar button), `buttonGhost`, `buttonIcon` /
  `buttonIconOutline`, `buttonGroup` (outlined split button with a visible divider). Toggles show their active state
  with `bg-selected text-accent`.
- Inputs (`inputField`): soft filled (`bg-fill`), no border until focus; focus = `border-accent/45`, no ring or glow.
  No native `<datalist>`/`<select>` popups and no browser autocomplete (`autoComplete="off"`, `autoCorrect="off"`,
  `spellCheck={false}`); suggestions use our own dropdown.
- Colour is soft: tinted badges (`bg-x/12 text-x`), avatars as tinted initials, notices as neutral pills with a small
  coloured dot/icon. Text contrast: `text-secondary` and `text-muted` both meet AA on their surfaces.
- Section labels are sentence case, 11–12px medium `text-secondary` (no uppercase tracking).
- Paths: `PathLabel` renders the directory muted and the file name bright (file headers).
- Diff rows: changed lines get a 2px coloured left edge and tinted line numbers (`td.diff-gutter` rules in `app.css`);
  long lines wrap at word boundaries (`overflow-wrap:anywhere`); the bottom expand band says "N unmodified lines".
- Dark theme (reference: a native git client): near-black neutrals `#141414` page, `#1a1a1a` bars/sidebar, `#262626`
  fills, `#2a2a2a` borders, `#232323` overlays; saturated but dark diff rows (`#182a1d` added, `#2e1819` removed);
  neutral hunk band `#1c1c1c` with blue-grey text; accent `#3b82f6`. Light theme keeps the GitHub palette.

## Desktop additions (styled like the web UI)

- Welcome screen (`routes/welcome.tsx`): mark + one-line tagline + Open folder (⌘O) on one row, a compact Recent
  list (name, muted parent path, relative time, remove on hover, ⌘-click = new window), a small "Open a pull request
  URL…" input and a drop-a-folder hint. Settings and theme are icon buttons in the title bar.
- Title bar (one row, 44px, bottom border): repo name · page tabs (plain text tabs, subtle fill on the active one) ·
  "what to review" picker · Unified/Split (icons) · Hide whitespace (icon) … comment nav group · Comments · Claude ·
  Send to Claude / Review #N · ⋯. The picker popover (440px): search field (filters commits; a sha or `a..b` range
  offers "Open …"), one "Uncommitted changes · N files" row with an All · Staged · Unstaged segmented control (empty
  segments disabled, explanations in tooltips), the PR or "branch vs base", one-line commit rows (sha · subject · age,
  author in the tooltip, loads more on scroll), and "All commits, ranges and branches…" as a footer. A 36px context bar
  (bottom border) appears only for a commit (Back, sha, subject, author, date), a PR or a compared range.
- Sidebar (`components/layout/sidebar-frame.tsx`): header "N files +a −d" (or "k of N viewed") with tree/flat toggle,
  expand/collapse and hide; soft filter input; tree rows with 12px indent and guide lines, small file icons, the status
  as a coloured letter on the right, comment counts as tiny badges, full path in the tooltip. The flat list shows the
  file name bright and the directory dim. Single-child folder chains are collapsed ("apps/desktop/src").
- Status bar (28px, bottom of Changes/Files/History): branch switcher, upstream (or "Local only" / "Not published" /
  detached), fetch / pull / push with ahead/behind counts, notices as neutral pills ("Files changed on disk · Refresh",
  "N open comments in commit abc1234 · ×"), repo path, and the GitHub button that opens the GitHub dialog.
- Branch switcher (`features/pr/branch-switcher.tsx`, click the branch in the status bar): search, Local branches
  (current checked, ahead/behind), Remote branches (checked out as a local tracking branch), Pull requests (#, title,
  author, checks) and "Check out pull request #N" for a typed number or URL. Switching with uncommitted changes asks
  first (Cancel / Stash and switch). There is no separate Pull requests toolbar button.
- History page (`/overview`, `components/layout/dashboard.tsx`): centred 880px column. A slim header with a soft search
  field and a "Compare" button whose popover takes base / compare refs (own autocomplete, swap button). The list starts
  with a "Working" group (uncommitted changes, the PR or branch vs base) and then commits grouped by day (Today,
  Yesterday, Mon, Sep 26) under sticky headers. Rows (~52px, no borders): subject, then a muted line with sha ·
  avatar initial + author · age; +/− on the right, replaced by "Changes since" on hover.
- Claude: "Review with Claude" split button with focus menu and "Resolve open comments"; a status pill
  ("Claude is reviewing… · 3 comments · 0:42", Stop) replaces it while a run is active; "Resolve with Claude" on
  each open thread; "Claude Code is working…" inside threads being addressed; file-write approval modal with a
  diff preview (Deny / Allow once / Always allow).
- Local review (no pull request): no drafts. The composer has one "Comment" button (saved at once; `@claude` still
  asks Claude on that thread). The toolbar shows "Send N to Claude" (open comments whose last reply is not Claude's),
  one click, hidden when there are none.
- Pull request review (a PR is checked out): GitHub-style drafting ("Comment now" / "Start a review" / "Add to review",
  "Draft" badges). The toolbar button is "Review #N" (accent when drafts exist) → popover with summary, Post to GitHub
  with Comment / Approve / Request changes, and "Also send to Claude".
- Loading: branded static splash in `index.html` → `AppSplash` while a repo opens, `DiffSkeleton` / file skeletons,
  a thin top progress bar for first-time loads and mutations, loading toasts for git/revert operations.
- Settings dialog (⌘,), time.fyi style: left rail with search and grouped icon tabs (App: General, Editor, Keyboard shortcuts;
  Connections: Claude Code, GitHub; Diffity: About), pane title + close, grouped label/hint rows with a fixed control column,
  theme swatches, status cards for Claude Code and the GitHub account, inline confirm for sign-out.
- Pull requests: the branch switcher and the ref-picker entry check one out; a PR bar (bottom border) sits above the
  diff (state, title, base ← head, checks, description, Sync comments, Back to <branch>).
- `@claude` autocomplete in comment and reply forms.
- Comments across views: toolbar "Comments N" chip (all open threads of the repo, `c`) opens a right-hand drawer grouped
  by view then file; a neutral status-bar pill points at open comments in other views; outdated / committed
  threads show their anchor snippet with an "Outdated" badge and "View in commit abc1234".
- GitHub dialog: the web app's push/pull dialog plus sign-in (import from `gh`, paste a token) and sign-out.
- File headers: Preview toggle for Markdown/SVG (rich diff), open in editor, revert file.
