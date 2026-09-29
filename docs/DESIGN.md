# Diffity design

**UI = the ported diffity web UI.** The desktop frontend is the React UI of the diffity web app
(`~/Vibecode/diffity/packages/ui`) moved into `apps/desktop/src` and wired to the Tauri backend. It must look and
behave the same as the web app: same components, colours, fonts, icons, spacing and shortcuts. Treat it as a port,
not a redesign.

## Rules

1. **Reuse before adding.** New UI (desktop-only screens, Claude, reviews, GitHub sign-in) is built from the patterns
   that already exist in the ported code: the toolbar chips/groups (`bg-bg-tertiary rounded-md`), the options-menu
   dropdown (`bg-bg-secondary rounded-md shadow-lg ring-1 ring-border`, `menuItemClass`), the dialog shell of
   `github-dialog.tsx` / `confirm-dialog.tsx`, dashboard cards (`border border-border rounded-lg bg-bg-secondary`),
   `CommentForm` buttons (`bg-accent text-white` primary, text buttons for secondary actions) and `ThreadBadge`.
2. **Colours come from the tokens in `src/styles/app.css`** (`bg`, `bg-secondary`, `bg-tertiary`, `border`,
   `text`, `text-secondary`, `text-muted`, `accent`, `added`, `deleted`, `modified`, `diff-*`, `hover`). Dark mode
   is `[data-theme='dark']` on `<html>`, toggled by `hooks/use-theme.ts` (stored in `localStorage['diffity-theme']`).
   Fonts are the system sans / mono stacks from the same file.
3. **Icons live in `src/components/icons`**, one component per file. The web app's icons are used as they are;
   new ones (sparkle, stop, refresh, external-link, folder-open, key, brand-logo) follow the same 16px, 1.5px stroke,
   `currentColor` style. No icon libraries.
4. **Desktop chrome.** Every page's top bar is `components/layout/title-bar.tsx`: the web toolbar plus
   `data-tauri-drag-region` and a 78px left inset for the macOS traffic lights (overlay title bar, lights at 14,13).
5. **Code style (mandatory for new or changed code):** destructure props inside the function body, never in the
   signature; use early returns; braces around every `if` body; no comments for the obvious. Ported code keeps its
   original style except where it had to change.

## Desktop additions (styled like the web UI)

- Welcome screen (`routes/welcome.tsx`): brand logo, Open folder (⌘O) / new window, open a PR URL, recent
  repositories, drag a folder onto the window.
- Page switcher (Changes | Files) and a ref menu (All / Staged / Unstaged / Commits and branches…) in the toolbar;
  the repo name opens the overview (the web app's dashboard plus a Compare card).
- Git fetch / pull / push icon group with ahead/behind counts.
- Claude: "Review with Claude" split button with focus menu and "Resolve open comments"; a status pill
  ("Claude is reviewing… · 3 comments · 0:42", Stop) replaces it while a run is active; "Resolve with Claude" on
  each open thread; "Claude Code is working…" inside threads being addressed; file-write approval modal with a
  diff preview (Deny / Allow once / Always allow).
- GitHub-style pending reviews: comment forms offer "Add single comment" and "Start a review" / "Add review
  comment"; pending comments carry a "Pending" badge; "Finish your review" popover with summary, verdict and
  destinations (Send to Claude, Post to GitHub PR #N).
- `@claude` autocomplete in comment and reply forms.
- GitHub dialog: the web app's push/pull dialog plus sign-in (import from `gh`, paste a token) and sign-out.
- File headers: Preview toggle for Markdown/SVG (rich diff), open in editor, revert file.
