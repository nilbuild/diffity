# Diffity design

**UI = the ported diffity web UI.** The desktop frontend is the React UI of the diffity web app
(`~/Vibecode/diffity/packages/ui`) moved into `apps/desktop/src` and wired to the Tauri backend. It must look and
behave the same as the web app: same components, colours, fonts, icons, spacing and shortcuts. Treat it as a port,
not a redesign.

## Rules

1. **Reuse before adding.** New UI (desktop-only screens, Claude, reviews, GitHub sign-in) is built from the patterns
   that already exist: the button styles in `components/ui/button-styles.ts` (primary / outline / ghost / icon /
   group), `SegmentedToggle`, menus and popovers from `components/ui/popover.tsx` (portal, collision-aware, `bg-overlay` + `border-overlay-border`, no
   shadow), the dialog shell of `confirm-dialog.tsx` / the settings dialog, borderless lists
   (`h-7`/`h-8` rows with hover and selected fills), `CommentForm` buttons and `ThreadBadge`.
2. **Colours come from the tokens in `src/styles/app.css`** (`bg`, `bg-secondary`, `bg-tertiary`, `sidebar`, `frame`, `frame-border`, `border`,
   `text`, `text-secondary`, `text-muted`, `accent`, `added`, `deleted`, `modified`, `diff-*`, `hover`, `active`, `selected`, `fill`, `fill-hover`, `raised`, `control-border`, `control-hover`, `overlay`, `overlay-border`). Dark mode
   is `[data-theme='dark']` on `<html>`, toggled by `hooks/use-theme.ts` (stored in `localStorage['diffity-theme']`).
   Fonts are the macOS system font (UI) and the original diffity mono stack for code (see Type and density).
3. **Icons: Phosphor, `fill` weight, through `components/ui/icon.tsx` only.** Every glyph is a named export there
   (`SettingsIcon`, `CommentIcon`, `GitPullRequestIcon`…) built by `glyph()`; nothing else imports `@phosphor-icons/react`
   and there are no other icon libraries. Solid shapes use `fill`; line-only glyphs (chevrons, arrows, plus, x, check,
   search, refresh) use `bold` so they carry the same visual weight. Sizes via `size`: `xs` 12, `sm` 14, `md` 16 inline,
   `lg` 18 toolbar, `xl` 20 rail. Colour = `text-secondary`, active/hover = `text`. File-status letters stay coloured.
   Almost every glyph is a custom 20px-grid icon in the same file (`customGlyph` / `lineGlyph`): filled rounded
   shapes and 2.4px round-capped strokes; only naturally solid glyphs use Phosphor `fill`. Only
   `components/icons/brand-logo.tsx` and `spinner.tsx` live elsewhere. Tree icons are neutral grey; no blue icons.
   Claude-related marks use the `claude` colour token (terracotta), everything else stays neutral.
4. **Desktop chrome.** Every page's top bar is `components/layout/title-bar.tsx`: the web toolbar plus
   `data-tauri-drag-region` and a 78px left inset for the macOS traffic lights (overlay title bar, lights at 14,13).
5. **Code style (mandatory for new or changed code):** destructure props inside the function body, never in the
   signature; use early returns; braces around every `if` body; no comments for the obvious. Ported code keeps its
   original style except where it had to change.

## Type and density

- Fonts: the macOS system font (SF Pro via `-apple-system`) for UI: it is optically sized for 11–13px and reads more
  clearly than Geist did at those sizes (compared side by side in the app). Code keeps the original diffity mono stack:
- Never change the root font size: `html` stays at 16px so Tailwind rem sizes are real pixels; `body` is 13px / 20px.
- Type scale: 11 (badges, kbd, section labels), 12 `text-xs` (meta, secondary lines), 13 (UI base, rows, buttons),
  15 (dialog / panel titles), 18 (page headings such as the empty state); weights 400 / 500 (labels, active tabs) /
  600 (titles, repo name). Code uses `.code-text`
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
- Surface levels (lightest → darkest in light mode, tokens in `app.css`):
  1. `bg` content (white / `#19191c`), cards on it are `bg` + `border` with `bg-secondary` headers;
  2. `sidebar` (`#f6f7f9` / `#141416`) for sidebars and the comments drawer;
  3. `frame` (`#eaecef` / `#0e0e10`): the window chrome — rail, title bar and status bar form one continuous frame;
  the workspace (sidebar + content) is an inset panel with a `frame-border` outline and a 10px left radius
  (`Workspace` in `title-bar.tsx`), which is what separates the title bar from the sidebar;
  4. `overlay` + `overlay-border` for popovers, menus, dialogs and tooltips (raised, bordered, no shadow);
  `raised` + `control-border` for buttons, inputs, segmented-control thumbs and the active rail tile.
- Action colours: one solid `primary` (blue) action per view; Claude actions use `buttonClaude` (terracotta tint) or
  `buttonClaudeSolid` / `buttonGroupClaude`; PR actions show a green PR icon; git sync tints Pull (`pull`) and
  Push/Publish (`push`) only when there is something to move; notices use a coloured dot.
- Buttons (`components/ui/button-styles.ts`): `buttonPrimary` (primary solid; disabled = neutral fill, muted text),
  `buttonOutline` (1px `control-border`, raised fill, the default toolbar button), `buttonGhost`, `buttonIcon` /
  `buttonIconOutline`, `buttonGroup` (outlined split button with a visible divider). Toggles show their active state
  with a neutral `bg-selected text-text`; segmented controls use a `raised` thumb with a `control-border` ring.
- Inputs (`inputField`): white (`raised`) fill with a `control-border` outline; focus = `border-focus`, no ring or glow.
- Colour is soft: tinted badges (`bg-x/12 text-x`), avatars as tinted initials, notices as neutral pills with a small
  coloured dot/icon. Text contrast: `text-secondary` and `text-muted` both meet AA on their surfaces.
- Section labels are sentence case, 11–12px medium `text-secondary` (no uppercase tracking).
- Paths: `PathLabel` renders the directory muted and the file name bright (file headers).
- Diff rows: changed lines get a 2px coloured left edge and tinted line numbers (`td.diff-gutter` rules in `app.css`);
  long lines wrap at word boundaries (`overflow-wrap:anywhere`); the bottom expand band says "N unmodified lines".
- Dark theme mirrors the light structure: frame `#0e0e10`, sidebar `#141416`, content `#19191c`, borders `#2d2d32`,
  overlays `#232327`; dark diff rows (`#182b1f` added, `#2f191b` removed); neutral hunk band. Light diff colours are
  gentle GitHub tints (`#edfcf1` / `#fef1f0`, neutral blue-grey hunk band `#f3f6fa`). Accent `#0969da` / `#3b82f6`
  only for primary buttons and focus; links are underlined text. `claude` (`#c96442` / `#e08a6d`) marks Claude. Selected states are soft neutral fills (`selected`, `active`).

## Desktop additions (styled like the web UI)

- Welcome screen (`routes/welcome.tsx`): mark + tagline, three action tiles (Open folder ⌘O, Clone, Pull request),
  Recent grouped by day (neutral initials badge, name, parent path, time), drop-a-folder hint.
- Window layout (see the map in UX-AUDIT.md): rail · title bar · workspace panel · status bar. Title bar (44px, on the
  frame): sidebar toggle (⌘\\) · repo name · "what to review" picker … Comments · Ask Claude to review · Send N to
  Claude / Submit review #N · ⋯. Nothing about how the diff is displayed lives there. The picker popover (440px): search
  field (a sha or `a..b` range offers "Open …"), "Uncommitted changes" with All · Staged · Unstaged, the PR or "branch vs
  base", one-line commit rows, and "All commits, ranges and branches…" as a footer.
- Diff bar (`components/diff/view-options.tsx`, 40px, top of the content column, fixed while the diff scrolls): viewed
  progress ("1 of 3 files viewed"), open-comment navigation (k/N open, prev/next, copy, delete all) … "Hide whitespace"
  toggle · Unified | Split segmented control · ⋯ (Expand / Collapse all files). Hidden when the view is empty.
- Popovers and menus use `components/ui/popover.tsx` (`Popover`, `useMenu`, `MenuItem`, `MenuLabel`,
  `MenuSeparator`): rendered in a portal, positioned from the anchor, flipped above and shifted inside the viewport,
  max-height with scroll, so nothing clips at a sidebar edge.
- Sidebar (`components/layout/sidebar-frame.tsx`, `sidebar` surface): Files · Changes as a segmented
  control; a filter row (filter input · "commented only" chip when there are comments · ⋯ with Tree/List and
  expand/collapse all folders); a quiet summary line ("3 files +7 −2" or "k of N viewed"); the tree (12px indent, guide
  lines, filled file/folder icons, coloured status letter, comment badges). Collapsing (title-bar toggle or ⌘\\) leaves a
  48px strip with the three view icons; the state is global and remembered.
- Rail (`components/layout/activity-rail.tsx`, 52px, on the frame): project tiles (neutral monochrome initials; active
  = raised tile with a ring and a 4px pill indicator centred on it; inactive = soft fill), manual order that never
  re-sorts on select, pointer drag to reorder (others slide to open the slot), right-click removes, ⌘1–9 and ⌘⇧[ ]
  switch, ⌘-click opens a new window. Below the tiles a dashed "+" tile (Open folder, ⌘O); Settings gear at the bottom.
  Hover tooltips (name, shortcut, path) appear to the right after 300ms.
- Status bar (32px, on the frame below the workspace): branch switcher, upstream (or "Local only" / detached), a
  labelled segmented sync control (Fetch · Pull N · Push N, or Fetch · Publish branch without an upstream), notices
  as neutral pills, repo path, and the PR (#N title) shortcut.
- Branch switcher (`features/pr/branch-switcher.tsx`, click the branch in the status bar): search, Local branches
  (current checked, ahead/behind), Remote branches (checked out as a local tracking branch), Pull requests (#, title,
  author, checks) and "Check out pull request #N" for a typed number or URL. Switching with uncommitted changes asks
  first (Cancel / Stash and switch). There is no separate Pull requests toolbar button.
- Home (`/overview`, `components/layout/dashboard.tsx`; also shown for Changes when the tree is clean), max 1000px:
  header with labelled secondary buttons, a quiet status line, one "Up next" hero (the only emphasised surface),
  a To review list and History, all using `ListRow` (row = action, stats flush right, chevron / ⋯).
- Claude: "Ask Claude to review" split button with focus menu and "Resolve open comments"; a status pill
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
- Pull requests: the branch switcher and the ref-picker entry check one out; a 40px PR bar (bottom border) sits above
  the diff: state icon · title · #N · checks icon … Sync comments (badge) · GitHub · Details (· Back to <branch>).
  Details opens a 920px dialog: description on the left, a tinted sidebar with status, branches, checks, changes,
  GitHub comments and actions.
- `@claude` autocomplete in comment and reply forms.
- Comments across views: toolbar "Comments N" chip (all open threads of the repo, `c`) opens a right-hand drawer grouped
  by view then file; a neutral status-bar pill points at open comments in other views; outdated / committed
  threads show their anchor snippet with an "Outdated" badge and "View in commit abc1234".
- GitHub: no separate dialog. The PR bar carries sync/post actions; account sign-in lives in Settings → GitHub.
- File headers: Preview toggle for Markdown/SVG (rich diff), open in editor, revert file.
