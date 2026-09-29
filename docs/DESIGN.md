# Diffity design

**UI = the ported diffity web UI.** The desktop frontend is the React UI of the diffity web app
(`~/Vibecode/diffity/packages/ui`) moved into `apps/desktop/src` and wired to the Tauri backend. It must look and
behave the same as the web app: same components, colours, fonts, icons, spacing and shortcuts. Treat it as a port,
not a redesign.

## Rules

1. **Reuse before adding.** New UI (desktop-only screens, Claude, reviews, GitHub sign-in) is built from the patterns
   that already exist: the button styles in `components/ui/button-styles.ts` (primary / outline / ghost / icon /
   group), `SegmentedToggle`, the options-menu dropdown (`bg-bg-secondary rounded-lg p-1 shadow-lg ring-1 ring-border`,
   `menuItemClass`), the dialog shell of `github-dialog.tsx` / `confirm-dialog.tsx`, bordered lists
   (`rounded-md border border-border p-1` with `h-8` rows), `CommentForm` buttons and `ThreadBadge`.
2. **Colours come from the tokens in `src/styles/app.css`** (`bg`, `bg-secondary`, `bg-tertiary`, `border`,
   `text`, `text-secondary`, `text-muted`, `accent`, `added`, `deleted`, `modified`, `diff-*`, `hover`, `raised`, `toggle`). Dark mode
   is `[data-theme='dark']` on `<html>`, toggled by `hooks/use-theme.ts` (stored in `localStorage['diffity-theme']`).
   Fonts are Geist (UI) and Geist Mono (code), bundled locally (see Type and density).
3. **Icons live in `src/components/icons`**, one component per file. The web app's icons are used as they are;
   new ones (sparkle, stop, refresh, external-link, folder-open, key, brand-logo) follow the same 16px, 1.5px stroke,
   `currentColor` style. No icon libraries.
4. **Desktop chrome.** Every page's top bar is `components/layout/title-bar.tsx`: the web toolbar plus
   `data-tauri-drag-region` and a 78px left inset for the macOS traffic lights (overlay title bar, lights at 14,13).
5. **Code style (mandatory for new or changed code):** destructure props inside the function body, never in the
   signature; use early returns; braces around every `if` body; no comments for the obvious. Ported code keeps its
   original style except where it had to change.

## Type and density

- Fonts: `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, imported in `main.tsx` (no CDN).
  `--font-sans` = Geist, `--font-mono` = Geist Mono (ligatures off). Mono is for code, diffs, paths, shas, line
  numbers and branch names; everything else is sans.
- Sizes (Tailwind tokens redefined in `app.css`): `text-xs` 12/16, `text-sm` 13/20 (UI base, body is 13px),
  `text-base` 14/20, `text-lg` 16/24; meta text `text-[11px]`. Code uses the `.code-text` class: 12.5px / 20px rows
  (diff rows, file viewer, hunk headers); line numbers 11.5px tabular. Don't use `text-sm leading-6` for code.
- Heights: title bar 44px (traffic lights are positioned for it), buttons 28px (`h-7`), small buttons 24px (`h-6`),
  context/banner rows 32px (`h-8`), file headers 32px, hunk/expand rows 24px, tree and menu rows 24–28px, status bar
  24px, sidebar 256px. Spacing scale: 4 / 6 / 8 / 12px; file blocks `mx-3 my-2`, radius `rounded-md` (menus `rounded-lg`).
- Buttons come from `components/ui/button-styles.ts`: `buttonPrimary` (accent), `buttonOutline` (bordered, `bg-raised`,
  the default secondary), `buttonGhost`, `buttonIcon` (28px square), `buttonGroup` + `buttonGroupItem` for split /
  grouped buttons. `SegmentedToggle` is a tertiary track with a raised active pill (`bg-toggle`), `iconOnly` for icons.
- Fewer boxes: one border per thing. Threads are a single bordered card (header strip, comments separated by hairlines);
  the composer is one bordered box; empty states and History use a single bordered list, not cards in cards.
- Paths: `PathLabel` renders the directory muted and the file name bright (file headers).
- Diff rows: changed lines get a 2px coloured left edge and tinted line numbers (`td.diff-gutter` rules in `app.css`);
  the bottom expand band says "N unmodified lines".
- Dark theme (reference: a native git client): near-black neutrals `#141414` page, `#1a1a1a` bars/sidebar, `#242424`
  tertiary, `#282828` borders; saturated but dark diff rows (`#182a1d` added, `#2e1819` removed, darker gutters);
  neutral hunk band `#1c1c1c` with blue-grey text; accent `#3b82f6`. Light theme keeps the GitHub palette.

## Desktop additions (styled like the web UI)

- Welcome screen (`routes/welcome.tsx`): mark + one-line tagline + Open folder (⌘O) on one row, a compact Recent
  list (name, muted parent path, relative time, remove on hover, ⌘-click = new window), a small "Open a pull request
  URL…" input and a drop-a-folder hint. Settings and theme are icon buttons in the title bar.
- Title bar (one row, 44px): repo name · page switcher (Changes | Files | History) · "what to review" picker
  (Uncommitted / Staged only / Unstaged only, the PR or "branch vs base", recent commits, "All commits, ranges and
  branches…") · Unified/Split (icons) · Hide whitespace (icon) … comment nav group · Comments · Claude · Submit · ⋯.
  Claude and Submit are hidden on an empty view with no comments. A slim 32px context bar appears only for a commit
  (Back, sha, subject, author, date), a PR or a compared range; plain views have no second bar.
- Sidebar header shows "N files +a −d" (or "k of N viewed"), then the filter. Files changed stats live there.
- Status bar (24px, bottom of Changes/Files/History): branch, upstream (or "Local only" / "Not published" / detached),
  fetch / pull / push with ahead/behind counts, repo path, and the GitHub button (PR #N + title, or "GitHub") that
  opens the GitHub dialog.
- History page (`/overview`, `components/layout/dashboard.tsx`): one calm column: quick picks (uncommitted, the PR or
  branch vs base, only when they exist), a one-line Compare form (base ... head), and the searchable commit list
  (single-line rows: subject, +/−, author, time, sha; "Changes since" on hover).
- Claude: "Review with Claude" split button with focus menu and "Resolve open comments"; a status pill
  ("Claude is reviewing… · 3 comments · 0:42", Stop) replaces it while a run is active; "Resolve with Claude" on
  each open thread; "Claude Code is working…" inside threads being addressed; file-write approval modal with a
  diff preview (Deny / Allow once / Always allow).
- Draft reviews: comment forms offer "Comment now" and "Start a review" / "Add to review"; drafts carry a "Draft"
  badge. The toolbar button is "Submit comments" (no PR) or "Review #N" (PR for the branch). Without a PR the popover
  offers "Send to Claude" vs "Just save the comments" (no verdict); with a PR it offers "Post to GitHub pull request
  #N" with Comment / Approve / Request changes, plus "Also send to Claude". Button labels say what happens
  ("Send 3 comments to Claude", "Publish 3 comments", "Post review to #N").
- Loading: branded static splash in `index.html` → `AppSplash` while a repo opens, `DiffSkeleton` / file skeletons,
  a thin top progress bar for first-time loads and mutations, loading toasts for git/revert operations.
- Settings dialog (⌘,), time.fyi style: left rail with search and grouped icon tabs (App: General, Editor, Keyboard shortcuts;
  Connections: Claude Code, GitHub; Diffity: About), pane title + close, grouped label/hint rows with a fixed control column,
  theme swatches, status cards for Claude Code and the GitHub account, inline confirm for sign-out.
- Pull requests: toolbar button and ref-picker entry open a searchable picker; checking one out shows a PR bar above the
  diff (state, title, base ← head, checks, description, Sync comments, Back to <branch>).
- `@claude` autocomplete in comment and reply forms.
- Comments across views: toolbar "Comments N" chip (all open threads of the repo, `c`) opens a right-hand drawer grouped
  by view then file; a slim banner under the context bar points at open comments in other views; outdated / committed
  threads show their anchor snippet with an "Outdated" badge and "View in commit abc1234".
- GitHub dialog: the web app's push/pull dialog plus sign-in (import from `gh`, paste a token) and sign-out.
- File headers: Preview toggle for Markdown/SVG (rich diff), open in editor, revert file.
