# UX audit

A walkthrough of the app as a user. Each line is a problem and what was changed. Screens tested in the real app
(scratch repos: dirty repo with history and a branch, empty repo, non-git folder, a public repo checked out on a PR
branch) and in the browser mock.

## Review flow

- "Finish your review" offered Comment / Approve / Request changes on plain local changes, with no idea where it went → the toolbar button is now "Submit comments" (no PR) or "Review #N" (open PR for the branch). Without a PR there is no verdict: the popover asks "What happens next": **Send to Claude** (Claude answers questions and makes edits, asking before each) or **Just save the comments** (publish here, nothing sent). With a PR: **Post to GitHub pull request #N** (with the verdict radios, only there) plus **Also send to Claude**.
- Submit buttons were generic ("Submit review") → labels say exactly what happens: "Send 3 comments to Claude", "Publish 3 comments", "Post review to #42", "Post to #42 & send to Claude".
- A local review stored the verdict "comment" → `submit_review` accepts `verdict: null`; the review-feedback prompt says "none (local review)".
- No hint how to get GitHub posting → when the repo has a GitHub remote the popover says "Sign in to GitHub" (opens Settings) or "No open pull request for this branch".
- Sending to Claude when Claude isn't installed/logged in failed only after submit → the popover warns inline with a link to Settings; start failures show a toast with a Settings action.
- "Add single comment" / "Start a review" / "Add review comment" / "Pending" were GitHub jargon → "Comment now" (or "Reply now") / "Start a review" / "Add to review" / "Add draft reply", badge "Draft", tooltips explain drafts are private until submitted. "Discard review" → "Discard drafts".
- Success toast always said "Review submitted" → "Sent to Claude", "Published 2 comments", "Approved"… GitHub failure after saving says the comments are saved and how to push them again.

## Choosing what to review

- The ref menu only had All / Staged / Unstaged and "Commits and branches…" → a picker with sections: Uncommitted (with file counts and one-line explanations), Branch (the PR, or "<branch> vs <base>"), Recent commits (subject, sha, author, time) and "All commits, ranges and branches…".
- "All changes" was ambiguous → "Uncommitted changes"; single refs read "Changes since X".
- Opening a commit showed "Commit abc1234" and nothing else → a context bar under the toolbar: Back, sha (click to copy), subject, author, relative date (full date on hover). PRs show title, #N link and head → base; ranges show "Comparing a...b".
- Opening the root commit failed (`<sha>~1..<sha>`) → the backend diffs a root commit against the empty tree (test added).
- Commit list rows were a sha + subject → subject, sha, author, relative time and files/+/− (`git log --shortstat`), search by message, author or hash, infinite scroll (with a "Load more" fallback), skeleton rows, error + retry, and a "Changes since" hover action (`<sha>..HEAD`).
- (superseded, see Landing and density) Overview was a file list and a commit list → status card (repo, branch, upstream/ahead/behind or "no upstream", open PR or "sign in to see PRs"), "What do you want to review?" targets (uncommitted summary, last commit, PR or branch-vs-base, browse files), uncommitted files, commits, and a Compare card with base/head inputs and branch suggestions.
- Dashboard "M" status used a non-existent `text-changed` class (no colour) → `text-modified`, with tooltips for S/M/A.
- PRs checked out with `gh pr checkout` from a fork were not detected (branch name/remote didn't match) → `find_pr` also reads `branch.<b>.merge` (`refs/pull/N/head`) and accepts the branch's tracked fork as head repo.

## Loading, empty and error states

- White flash then an overlay spinner on launch → branded static splash in `index.html` (theme-aware), replaced seamlessly by `AppSplash` ("Opening <repo>…", "Large repositories can take a few seconds…" after 6s).
- Blank overlay while comments load → `DiffSkeleton` (toolbar, sidebar, file blocks); file/folder skeletons in the file browser.
- No sign of in-app loading → thin top progress bar while a page loads data for the first time or a mutation runs.
- Revert / undo had no feedback → loading → success/error toasts. Git fetch/pull/push toasts explain themselves; buttons show counts ("Push 2 commits") and are hidden when there is no remote.
- "No changes found" for every case → specific empty states: clean working tree (review last commit / the PR / branch vs base / browse), nothing staged, no unstaged changes, empty repository, empty commit, whitespace-only changes.
- Error page offered unrelated actions → "Try again" (resets queries), and for a non-git or missing folder only "Open another repository" plus a `git init` hint. Titles per error code.
- "Review with Claude" on an empty diff → hidden when there is nothing to review.

## Claude

- After the user denied a write, Claude still resolved the thread with "Fixed: …" → the permission layer flags the turn when a write/edit is rejected and the MCP `resolve` tool then returns `edit_rejected` ("reply instead, leave it open"). Prompts (resolve, thread, review-feedback) have a "Rejected edits" section: never resolve without an applied edit, stop editing that thread, reply with the proposal. Verified with a real run: denied edits, thread stayed open with an explanatory reply.
- `@claude` wasn't highlighted in rendered comments → a rehype plugin highlights whole-word mentions outside code/links (same rules as `mentionsAgent`, tests added).
- Status pill text was long enough to squeeze the toolbar → shorter labels ("Claude is on your review…").

## Finding comments

- Claude reviewed uncommitted changes, the user switched views (or committed) and the comments vanished with no pointer back → a repo-wide Comments drawer (toolbar chip with the open count, `c`), grouped by view and file, filters Open/Resolved/All and Everyone/Claude/You; clicking a row opens that view and flashes the thread. Other views' open comments are announced by a banner ("3 open comments in Uncommitted changes · 2 from Claude · Show").
- After committing, `work` was empty and its threads were invisible → the empty view lists them ("3 comments left on changes that are no longer here") with the stored snippet, reply/resolve and "View in commit abc1234" when the code is in HEAD's commit; threads on files that left a view show above the diff. The drawer marks them "Changes were committed" / "Code changed since".
- Claude's finish toast said "Claude finished reviewing — 3 comments" with no location → "Claude left 3 comments on Uncommitted changes · View" (works from any page); the running pill says "on <view>" when you are elsewhere and its comment count links there.

## Toolbar and layout

- At 1280–1400px the view toggle label and files-changed chip were hidden → view toggle (with labels), stats and Hide whitespace moved to the context bar; comment navigation became one compact group ("2/5 open", prev/next, copy, delete); the GitHub button is an icon (+ "#N"); the branch chip hides below 1180px. Fits at 1280 with Claude running.

## Settings, shortcuts, welcome

- Theme, editor, Claude path and GitHub sign-in had no home → Settings dialog (⌘, or ⋯ → Settings…, gear on the welcome screen): theme, editor (VS Code/Cursor/Zed/other), Claude Code status + custom path + "Check again", GitHub account.
- Theme was per-component state (toggles didn't sync; ignored system theme on first run) → one global store, defaults to the system theme.
- Keyboard shortcuts were only discoverable on the diff page → `?` works everywhere, listed in ⋯ and Settings, shortcut list updated (⌘,, comment keys).
- Welcome: non-git folder toast now explains `git init`; moved/deleted recent repos say so.

## Landing and density (compact pass)

Walked through as a user opening a repo: what do I need first? The changes. The status card, "What do you want to
review?" tiles, uncommitted-file list, commits card and compare card all answered questions nobody had yet.

- **Decision: no overview as a destination.** A repo opens straight into Uncommitted changes (it already did; the
  overview was one click away on the repo name and looked like the landing). We do not auto-jump to the last commit or
  the branch when the tree is clean: the working tree view updates live as you edit, and jumping away would move the
  view under you. Instead the clean-tree empty state is a short calm list: the PR (or "<branch> vs <base>"), Last commit
  (sha + subject), "Pick a commit or compare branches" (History) and "Browse files". Empty repos only offer Browse files.
- The overview became **History** (third tab: Changes | Files | History), one column: quick picks only when they exist
  (uncommitted N files, the PR / branch vs base), a one-line Compare form, and the commit list with single-line rows.
  Removed: status card (branch/upstream/PR moved to the status bar), target tiles, uncommitted file list (duplicate of
  Changes), card headers and helper sentences.
- Welcome was four stacked cards → one row (mark, tagline, Open folder ⌘O), a plain Recent list (name, muted parent
  path, time; remove on hover), a small PR URL input with an Open button that appears when you type, and the drop hint.
  "Open in new window" button dropped (⌘-click a recent repo instead).
- Two header bars → one. View mode (icons) and Hide whitespace moved into the title bar next to the review picker; the
  file count and +/− moved to the sidebar header; the context bar now only appears where it carries information
  (commit, PR, range). Branch chip, git sync group and GitHub button moved to a 24px status bar at the bottom.
- Empty views no longer show a disabled "Resolve with Claude" and "Submit comments".
- Density: Geist / Geist Mono, 13px UI, 12.5px code on 20px rows (was 14px / 24px), 24px tree rows, 32px file headers,
  28px buttons, one-border thread cards, lighter hunk bands, dim directory + bright file name in file headers, a coloured
  left edge and tinted line numbers on changed lines, "N unmodified lines" on the bottom expand band. About 20% more
  code lines fit on screen.
- Dark theme re-based on near-black neutrals (#141414 / #1a1a1a / #282828 borders) with darker, more saturated diff rows.

## Settings (rework)

- The single-column settings sheet was cramped and mixed status, forms and links → time.fyi-style dialog: 780px, left rail with "Find a setting" search and grouped icon tabs (General, Editor, Keyboard shortcuts · Claude Code, GitHub · About), pane title + close, grouped label/hint rows with a fixed control column.
- Theme had only Light/Dark → System / Light / Dark with mini-window swatches; System follows macOS live. Default diff layout lives in General.
- Claude Code status was a line of coloured text → status card (Ready / Logged out / Not found badge, binary path, Re-detect), binary path row, "What Claude can do here".
- GitHub account: avatar card with source (gh CLI or keychain), Switch, Sign out behind an inline confirm; signed out shows "Import from gh" and a token row.
- Contextual links open the right pane (review popover → GitHub, Claude errors → Claude Code). Shortcuts pane reuses the shortcut modal data.

## Pull requests

- Checking out a PR was only possible from the welcome screen with a URL → a "Pull requests" toolbar button and a "Pull requests…" ref-picker entry open a searchable picker (state, draft, review decision, checks, +/−, author, updated, fork `owner:branch`); `#123` or a URL checks out closed/merged PRs too.
- Checkout with local edits failed with a git error → a dialog explains what's uncommitted and offers Cancel or "Stash and check out" (`git stash push --include-untracked`); the stash is popped automatically on "Back to <branch>", and put back if the checkout fails.
- After checkout the user landed on a bare diff → the PR diff opens with a PR bar (state, title, #N, author, base ← head, checks, description, Sync comments, Back to <branch>) and the PR's review threads are pulled in automatically.
- The base branch could be stale, skewing the PR diff → `checkout_pr` fetches the base too; merged PRs whose branch was deleted fall back to `pull/<n>/head`.
- Verified read-only on sindresorhus/p-queue #233 (same-repo, dirty tree → stash → back restores) and pmndrs/zustand #3580 (fork → `pr-3580`, 4 review comments pulled, "Review #3580" offered). Nothing was posted.

## Information architecture and visual pass (round 3)

Walked through the six main jobs as a user (open a repo and see what changed; review a file, comment, ask Claude;
send comments to Claude; look at a commit / compare branches; check out and review a PR; switch projects). The rule
that fell out: **controls live next to what they change, and every region has one job.**

### Map: screen → regions → what lives there

| Region | Job | Contents |
| --- | --- | --- |
| Rail (frame, left, 52px) | Which project | Project tiles (manual order, drag to reorder, ⌘1–9), "+" Open folder (⌘O) below them, Settings at the bottom |
| Title bar (frame, top, 44px) | Where am I, and the big actions | Sidebar toggle (⌘\\), repo name, "what to review" picker (+ Back when not on Uncommitted) … Comments (C), Ask Claude to review, Send N to Claude / Submit review #N, ⋯ (shortcuts, theme, settings, about) |
| Context bars (workspace top) | Facts about the chosen target | PR bar (state, title, base ← head, checks, sync, back to branch); commit header inside the diff |
| Home (`/overview`, and Changes when the tree is clean) | What should I review next | Header (repo, branch switcher, Browse files, Open in editor) · quiet status line · "Up next" hero · To review list · History |
| Sidebar (sidebar surface) | Navigate inside the target | Files · Changes, filter + commented-only chip + ⋯ (tree/list, expand/collapse folders), summary line, file tree |
| Diff bar (content top, 40px) | How the diff looks, and moving through it | Viewed progress, open-comment navigation (k/N, prev/next, copy, delete all) … Hide whitespace, Unified \| Split, ⋯ (expand / collapse all files) |
| Content | The work | File cards, thread cards, general comments; empty states with next steps |
| Status bar (frame, bottom, 32px) | Repository status | Branch switcher, upstream, fetch/pull/push, notices, path, PR shortcut |
| Drawer (right) | Everything commented, anywhere | Comments panel (C): filters, grouped by view → file, card rows |

### Decisions

- **"Still blending in" → four surface levels.** Frame (rail + title bar + status bar, darkest tint), sidebar (tinted),
  content (white / near-black), overlays (raised with a border). The workspace is an inset panel with an outline and a
  rounded left edge, so the title bar can no longer merge into the sidebar. Cards, inputs and buttons get visible
  `control-border` outlines; selection stays a soft neutral fill; accent only on primary buttons, focus and links.
- **Light mode designed on purpose.** Crisp white content, softly tinted chrome in two clear steps, readable greys
  (`#4b535d` / `#646c76`, AA on every surface they sit on), gentler diff tints and a neutral hunk band instead of
  bright blue. Dark mode follows the same structure.
- **Icons: Phosphor fill** (compared Phosphor fill/duotone, Heroicons 20 solid, Iconsax bold/bulk, Fluent filled and
  the old Lucide set in the running app). Phosphor has friendly rounded solid shapes and the git glyphs (branch,
  commit, pull request, diff) the others lack. One wrapper, `components/ui/icon.tsx`; Lucide and the 45 hand-made
  outline icons are gone.
- **Font: macOS system font** instead of Geist. At 11–13px SF Pro is noticeably more legible (optical sizes) and feels
  native; the code font is unchanged. Type scale 11 / 12 / 13 / 15 / 18.
- **Sidebar header had four icon buttons and a "View options" popover that clipped.** The header row is gone: the
  filter is the first thing, tree/list and expand/collapse moved into a ⋯ menu, hide-sidebar moved to the title bar as
  a standard toggle (⌘\\, remembered). Layout and whitespace are no longer in a menu: Unified | Split and Hide
  whitespace sit in the diff bar above the diff they change. All menus now use a portal popover with viewport
  collision handling.
- **Comment navigation moved out of the title bar** into the diff bar (it moves through the diff). The title bar keeps
  only identity and the three big actions.
- **Clean working tree is a starting point, not a dead end.** "Everything is committed" with branch and sync state,
  tiles for the last commit, the PR or "branch vs base", open comments, and the recent commits list.
- **Rail:** "+" moved below the tiles (Slack/Discord style) as a dashed tile; active tile is a raised tile with a ring
  and a pill indicator centred on it; tooltips are custom (name, shortcut, path) instead of slow native titles; ⌘O now
  works inside a repository too (it was advertised but only worked on the start screen).
- **Project switching leaked data between repositories.** Going repo A → start screen → repo B showed A's pull
  request in B's toolbar and status bar, because the cache swap keyed off the API's current path, which the start
  screen resets. The cache now tracks its own owner (`activateRepoCache`), cancels in-flight queries before swapping,
  and switching stays instant with no layout jump (verified by capturing the first frame after a click).
- **Review popover (PR):** "Review with Claude" vs "Review #430" read alike → "Ask Claude to review" (sparkle) and
  "Submit review #430" (PR icon). The popover is sectioned (summary → GitHub post + verdict → Claude + scope → one
  action button that says exactly what happens); Claude scope is explicit ("All N comments" vs "Only comments that
  mention @claude (M)") with a list of what is sent; on a PR "send to Claude" is off by default and remembered per
  repo; a disabled submit says why.
- `/` to focus the filter did nothing on the Changes view (selector looked for "Filter files..."); fixed.

## Round 4 (feedback on the framed layout)

- Tabs read Files · Changes · History (browse → review → past). A repo still opens on Changes.
- Icons that looked odd (Changes, folder, PR, branch with hollow + filled nodes) are now a small custom set in
  `ui/icon.tsx` drawn on a 20px grid in one style: rounded filled shapes, filled nodes, 1.9px round strokes for
  connectors (Changes = rounded doc with ±, folder, clock, branch, pull request, commit, compare). Status-bar sync
  uses Phosphor bold arrows.
- File tree is neutral: grey filled folders (slightly lighter), outlined-filled grey files; colour only in status letters.
- Blue is only for the primary button and focus. Claude has its own colour (`claude`, terracotta `#c96442` /
  `#e08a6d` dark) for the sparkle, Claude avatars, @claude mentions and the rail activity dot; links are underlined
  text, not blue.
- Files page: "Open in Editor" is a ghost icon at the end of the header row (tooltip names the configured editor,
  ⌘⇧E). File and folder rows have a context menu (Open in editor, Copy path, Collapse other folders); file cards keep
  the hover editor button with the editor's name.
- Clean state lost the big check icon: title + one line, aligned with the cards.
- Ranges and commits use short SHAs and friendly labels everywhere (picker, comment groups, toasts):
  "7081c9a → HEAD", "Commit 7081c9a · subject", "main → feature". The separate ← became a × inside the picker chip
  ("Back to uncommitted changes"); the big "Comparing …" heading is a one-line context row.
- Title-bar ⋯ has the same outlined chrome as its neighbours.
- Comment previews render markdown inline (bold, code; lists and headings flattened), clamped to two lines.
- Resolve collapses the thread at once (optimistic, short fade) with an Undo toast; undo reopens and expands it.
- Claude running pill is neutral: terracotta spinner, "Claude is reviewing · 0:02", Stop; the count shows only once
  Claude has left comments.
- Rail: 10px between tiles and extra space before "+".
- Comments drawer: each view group collapses; open by default for the current view and for groups with open Claude
  comments; the choice is remembered per repository and view.
- Status-bar sync is a labelled segmented control: Fetch (last fetch time in the tooltip) · Pull N · Push N. Without an
  upstream it shows "Publish branch" (and no Pull); Push is inert with a reason when there is nothing to push.
- @claude mentions always reach Claude, also when a PR review is posted with "Send to Claude" off.
- PR bar was one crowded line (state pill, title, #, "wants to merge into", branches, checks, updated, Description,
  Sync comments, GitHub). Now: state icon (open/draft/merged/closed colour) · title (takes the space) · #N muted …
  icon buttons only: checks status (tooltip), Sync comments (badge = review threads on GitHub not pulled yet; tooltip
  shows last sync), Open on GitHub, and a Details chevron. Details opens a light panel: status + review decision,
  copyable base ← head branches, author / opened / updated, checks, changes, and the markdown description (collapsible).
- Empty state only says "Only whitespace changed" when whitespace hiding is on and the unfiltered diff has files.

## Round 5

- **One icon family.** Every glyph in `ui/icon.tsx` is now drawn on the same 20px grid: filled rounded shapes and
  2.4px round-capped strokes (about 2px at 16px); PR, branch, commit, compare, fetch, pull, push, sidebar, pencil,
  eye/whitespace, unified/split, chevrons, close, more, search, comment, check, copy, trash, external link, editor,
  file, folder, clock, home are custom. Only naturally solid glyphs (gear, sun, moon, key, keyboard, info, warning,
  sparkle, send, stop, GitHub, tree) remain Phosphor `fill`. Checked on an in-app contact sheet at 12/14/16/20px in
  light and dark.
- **Action colours.** Tried blue vs green for the single primary action per view (screenshot `variants-primary.png`);
  kept blue because green already means "added" in diffs and status. System: primary = solid blue (`primary`
  token; Submit review with drafts, Review changes, Compare, Post); Claude = terracotta — soft tinted fill for "Ask
  Claude to review", solid for "Send N to Claude"; PR actions keep a green PR icon on a neutral button; git sync
  tints Pull (blue) / Push and Publish (green) only when there is something to move; notices get a coloured dot
  (terracotta when Claude is involved). Destructive red only inside menus and confirms.
- **Traffic lights.** AppKit can reset the buttons' frames while they live in our container (seen as one green dot
  at the left edge after switching apps). The positions captured on the first pass are re-applied on every pass,
  and the frontend asks Rust to realign on window focus, blur and visibility changes (covers Space switches and
  restore); window events (resize, move, focus, theme, scale, fullscreen) still trigger it natively. Checked focused,
  unfocused, minimise/restore and full screen.
- **Popovers.** Ref picker, branch switcher, Compare, Claude menu, review popover and the ⋯ menu now render through
  the portal `Popover` with flip/shift, so nothing is clipped by the sidebar or rail.
- **Home instead of the History tab.** The sidebar is Files · Changes. Home (click the repo name, click the current
  project tile, ⌘⇧H, or Changes when nothing is uncommitted) is a full-width page: repo and branch, Working cards
  (uncommitted with staged/unstaged/new counts, PR with state, branch vs base, open comments with Claude count),
  and the history list with search and Compare. Commit rows are wide (subject, author avatar + name, sha, time, +/−,
  "Changes since" on hover); clicking opens the commit, and the × in the picker returns to Uncommitted / Home. The
  author name that collapsed to zero width in the narrow sidebar rows is fixed by the new layout.

## Round 6 (Home as a review queue, PR details)

- Home gave every card the same weight, including empty ones. It is now a review queue:
  - **Header:** repo name, branch (click → branch switcher), and labelled secondary buttons "Browse files" and
    "Open in <editor>".
  - **Status line** (quiet text, never cards): "Working tree clean · No open comments · ↑0 ↓0 with origin/main".
  - **Up next** hero, the only emphasised surface: the most relevant thing to review, picked as uncommitted changes →
    checked-out PR → branch vs its base (when it differs) → latest commit, with one explaining line, file count,
    +/− and a diffstat bar, and [Review] (primary) + [Ask Claude to review] (Claude style).
  - **To review:** only non-empty items — the remaining candidates, open comments grouped by view, open PRs on GitHub
    (meta line: #, author, updated, Draft / Review required badges, checks dot; click checks it out through the usual
    guard) or a single "Sign in to GitHub" row when signed out.
  - **History:** the same rows, grouped by day, search + Compare in the section header.
- **Rows:** one layout everywhere (`components/ui/list-row.tsx`): icon · title over meta · stats flush right
  (+adds −dels and the diffstat bar, no gaps) · a chevron that turns into ⋯ on hover (same width, no jump). The whole
  row is the main action; secondary actions (Changes since, Open on GitHub, Ask Claude) are in the ⋯ menu and on
  right-click. No reserved hover-only action column.
- **PR bar:** controls are labelled (Sync comments with a count badge, GitHub mark + "GitHub", Details), checks are a
  single status icon, and the editor and GitHub icons are never the same glyph. Details (and clicking the title) opens
  a dialog instead of the inline panel: title, state, author and the markdown description on the left; a tinted
  sidebar with Status, Branches (copyable), Checks, Changes (+ Review changes), Comments on GitHub (Sync now, last
  synced) and Actions (Open on GitHub, Back to branch, Ask Claude to review). Esc or a click on the dimmed backdrop
  closes it.

## Round 7

- **Ask Claude to review asks first.** The button (diff toolbar, Home's Up next, row ⋯ menus and the PR dialog all
  route to it) opens a popover: "What should Claude focus on?" (multi-line), focus chips (Security, Performance,
  Correctness, Naming, Tests, Types — remembered per repo), and scope (all changes / only the focused file / only
  files matching a glob with a live match count). ⌘↵ or "Start review" starts; the split-button focus menu is gone.
  Backend: the `review` action takes `instructions` and `paths`; the prompt gets a "The user's instructions" section
  (takes priority over the generic passes) and a "Scope" section; paths are validated against the diff, `get_diff`
  returns only those files and `add_comment` rejects others. Verified with a real run on a scratch repo
  (instructions + `src/lib/*.ts`): one comment, only in `src/lib/math.ts`.
- ⋯ buttons in the sidebar filter row and the diff bar have the same outlined chrome and height as their neighbours.
- Dialog backdrop is darker (black/45).
- Rail: the active project is an ink tile (dark in light mode, light in dark mode) with no side indicator; inactive
  tiles stay soft grey; hover adds a ring.
- Status-bar repo path: click reveals the folder in Finder; right-click offers Reveal in Finder, Open in Terminal,
  Open in <editor>, Copy path.

## Round 8 (refresh, two personas, contextual actions)

### Refresh
Paths audited: the "Files changed on disk · Refresh" pill, repo-changed events, Fetch, project switching, ⌘R and a
full webview reload.
- **Found:** the Changes view showed Home whenever the uncommitted diff became empty, so refreshing after a commit
  (or any refresh of a clean tree) swapped the page for Home. ⌘R did nothing in the app window. Unsent comment text,
  the open composer, scroll position and manually collapsed files were lost on reload.
- **Now:** data refreshes never navigate. Home is shown only when a project is opened fresh (`openRepoAt` passes a
  one-shot `fresh` flag; clean tree → Home, otherwise the flag is cleared); an empty Changes view after a refresh
  shows a compact "No uncommitted changes" state with Go to Home / Review last commit / Browse files.
  - ⌘R refreshes all data in place ("Refreshed" toast); the route, scroll and composers stay.
  - The disk-change pill auto-refreshes when no composer is open; with one open it waits for you.
  - Composer text is saved per repo + review session + anchor (line, reply, general, path) until sent or cancelled;
    the open line composer, scroll anchor (top file) and manually toggled files are remembered per repo + view, so a
    full reload restores them (verified with a real reload).
  - If the lines under an open composer change, the composer moves to the top of the diff with "Your unsent comment
    on src/app.ts line 6. The code there changed, so it is kept here." (verified by editing the file mid-comment).

### Persona 1: reviewing AI-written work locally
- Comments save immediately; "Send N to Claude" (solid terracotta) counts your open comments Claude has not answered
  and that are not already queued (so an @claude thread in flight is never sent twice).
- Clicking it opens a popover: the comments grouped by file with checkboxes (all selected), an optional note for the
  whole batch, ⌘↵ to send. Backend: `resolve` takes `threadIds` + `note` (prompt lists only those threads and adds
  the note; Rust tests added).
- While running: "Claude is working on 2 comments · 0:04 · Stop" and "Claude Code is working…" on each thread. When
  done: "Claude resolved 2 of 2 comments" with "Review changes". Verified on the scratch repo: one edit applied
  (after approval), one answered without a change, both resolved with replies.

### Persona 2: reviewing someone else's PR
- Composer on a checked-out PR: primary "Start a review" / "Add to review" (draft), secondary "Post to GitHub now"
  (creates the comment and pushes that one thread immediately). Replies on PR threads are drafts that go with the
  review. Replies on Claude's local threads stay local and immediate.
- A hint line under every composer says where it goes: "Goes into your review on PR #430, posted when you submit",
  "Saved in Diffity only · @claude asks Claude", "… · Claude will reply".
- Thread badges: Claude (terracotta), Draft · GitHub, Posted (GitHub, links to the PR), Local (PR view only).
- "Ask Claude to review" on a PR leaves Claude-marked local comments; each has "Add to my review", which copies it
  into your GitHub review as an editable draft and resolves Claude's thread.
- Submit review #N is the primary (solid, count badge) when drafts exist; its popover has summary, verdict and the
  optional Claude section. Tested read-only: drafts were created locally and removed again; nothing was posted.

### Contextual title-bar actions
| Context | Primary | Secondary |
| --- | --- | --- |
| Uncommitted / staged / branch vs base | Send N to Claude (only with unanswered comments) | Ask Claude to review |
| Checked-out PR | Submit review #N (solid when drafts exist) | Ask Claude to review; Send N to Claude only for your local comments |
| Past commit or a range not ending at HEAD | — | Ask Claude to review (no Send to Claude: Claude edits the working tree) |
| Files | — | Send N to Claude for file comments |

## Round 9 (your own PR, thread cards, committed comments, traffic lights)

- **Your PR vs someone else's.** A checked-out PR whose author is the signed-in GitHub user is "Your PR" (terracotta
  chip in the PR bar); otherwise "Reviewing @author's PR".
  - Your PR: comments are local notes for Claude (primary "Comment", secondary "Comment & post to GitHub"; hint "A note
    for Claude on your PR #N, kept in Diffity"); the title bar shows "Send N to Claude", no Submit review.
  - Reviewers' open GitHub threads are listed in the Send popover under "Reviewer comments from GitHub", and the PR bar
    offers "Address N reviewer comments" (opens that popover). Opt-in "Post Claude's replies to these GitHub threads"
    posts each new Claude reply as a GitHub reply when the run ends (new `github_post_comment` command; replies end
    with a small "Reply drafted by Claude Code in Diffity" line).
  - After Claude edits files: "Commit & push" in the PR bar and a banner on Uncommitted ("These changes are on the
    branch of your PR #N · Commit & push"); "Push N commits" when commits are waiting. The commit dialog stages all
    files, commits with a message prefilled from Claude's resolve summaries, then pushes (`git_commit_all` + push; no
    amend or rebase).
  - Someone else's PR keeps the draft-review flow from round 8.
  - Verified with a mocked login on the scratch PR clone and a seeded reviewer thread; nothing was committed or pushed.
- **Thread cards.** Headers never wrap: the left side truncates, actions are no-wrap ("Ask Claude", "Resolve") and
  Delete moved into a ⋯ menu. Reply is a full-width "Reply…" field aligned with the comment text (40px inset).
- **Empty view with comments on committed code.** The Uncommitted view now shows a compact "No uncommitted changes"
  line with Home / Last commit / Browse files buttons, then "Comments on code that's since been committed (N)" with
  compact cards: middle-truncated path + line range, "View in commit abc1234" as the one visible action, everything
  else (Mark as addressed, Ask Claude about it, Delete) in ⋯.
- **Ref picker.** The clear × sits inside the chip after the chevron as a small round ghost button.
- **Traffic lights.** The positioning is now idempotent: every pass puts all three buttons in one container and lays
  them out from scratch (fixed 20px stride), repairing whatever AppKit did (reclaimed buttons, reset frames, hidden
  buttons, stacked at x = 0). It runs on window events, focus/blur/visibility and once a second while visible (a
  cheap frame compare). Repairs are logged (`traffic_lights: repaired …`). Stress-tested: project switching, ⌘\,
  Settings, ⌘R, theme switch, focus loss; no repair was needed after the first layout.

## Remaining

- "Post to GitHub now" pushes only new threads; replies to existing GitHub threads still go out with the review.

- Very large diffs (thousands of files) are still rendered eagerly apart from auto-collapsed files; no virtualisation.
- The window title is only the repo name (no ref).
- A PR review posted from a non-PR view (e.g. an old commit) can only post comments GitHub can anchor; unanchored ones are reported as failed.
- The edit-rejected guard is per turn, so after one denial Claude can't resolve any thread in that run, even ones whose edits were approved (conservative by design).
- PR picker lists the 30 most recently updated open PRs; older ones need `#number`. No device-flow sign-in in the new GitHub pane (only when `DIFFITY_GITHUB_CLIENT_ID` is set; import/token cover it).
