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
| Sidebar (sidebar surface) | Navigate inside the target | Changes · Files · History, filter + commented-only chip + ⋯ (tree/list, expand/collapse folders), summary line, file tree |
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

## Remaining

- Very large diffs (thousands of files) are still rendered eagerly apart from auto-collapsed files; no virtualisation.
- The window title is only the repo name (no ref).
- With "Send to Claude" off, @claude mentions in a submitted PR review are posted but not sent to Claude (the popover warns). Decide whether mentions should always go to Claude.
- A PR review posted from a non-PR view (e.g. an old commit) can only post comments GitHub can anchor; unanchored ones are reported as failed.
- The edit-rejected guard is per turn, so after one denial Claude can't resolve any thread in that run, even ones whose edits were approved (conservative by design).
- PR picker lists the 30 most recently updated open PRs; older ones need `#number`. No device-flow sign-in in the new GitHub pane (only when `DIFFITY_GITHUB_CLIENT_ID` is set; import/token cover it).
