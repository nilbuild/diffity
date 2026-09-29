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
- Overview was a file list and a commit list → status card (repo, branch, upstream/ahead/behind or "no upstream", open PR or "sign in to see PRs"), "What do you want to review?" targets (uncommitted summary, last commit, PR or branch-vs-base, browse files), uncommitted files, commits, and a Compare card with base/head inputs and branch suggestions.
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

## Toolbar and layout

- At 1280–1400px the view toggle label and files-changed chip were hidden → view toggle (with labels), stats and Hide whitespace moved to the context bar; comment navigation became one compact group ("2/5 open", prev/next, copy, delete); the GitHub button is an icon (+ "#N"); the branch chip hides below 1180px. Fits at 1280 with Claude running.

## Settings, shortcuts, welcome

- Theme, editor, Claude path and GitHub sign-in had no home → Settings dialog (⌘, or ⋯ → Settings…, gear on the welcome screen): theme, editor (VS Code/Cursor/Zed/other), Claude Code status + custom path + "Check again", GitHub account.
- Theme was per-component state (toggles didn't sync; ignored system theme on first run) → one global store, defaults to the system theme.
- Keyboard shortcuts were only discoverable on the diff page → `?` works everywhere, listed in ⋯ and Settings, shortcut list updated (⌘,, comment keys).
- Welcome: non-git folder toast now explains `git init`; moved/deleted recent repos say so.

## Remaining

- Very large diffs (thousands of files) are still rendered eagerly apart from auto-collapsed files; no virtualisation.
- The window title is only the repo name (no ref).
- A PR review posted from a non-PR view (e.g. an old commit) can only post comments GitHub can anchor; unanchored ones are reported as failed.
- The edit-rejected guard is per turn, so after one denial Claude can't resolve any thread in that run, even ones whose edits were approved (conservative by design).
