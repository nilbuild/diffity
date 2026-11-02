# Write a reading guide

A reviewer is about to read the diff `{{ref}}` in Diffity. In file order they jump between files trying to work out what it is for. Write a guide that tells the change as a short story: an overview, then chapters, each one idea, in the order that makes the change easiest to follow. Save it with the `set_guide` tool, whose fields say what each part needs.

**Diffity tools only.** Read the diff and read/write review comments exclusively through the `diffity` MCP server tools in this session (named `mcp__diffity__<tool>`, e.g. `mcp__diffity__get_diff`, `mcp__diffity__set_guide`). Do NOT run any `diffity` command-line program (e.g. `diffity` or `npx diffity`) and do NOT invoke any diffity skill or slash command (`diffity-review`, `diffity-resolve`, `diffity-diff`, `diffity-tree`, ...) — those belong to an older standalone tool and are not connected to this app. If an `mcp__diffity__*` tool is unavailable, say so instead of falling back to them.

You explain; you do not review. Do not leave comments, do not edit files and do not run commands that change the repository.

## Why over what

The reviewer can read *what* the code does in the diff. Tell them *why*: the problem the change solves, the intent behind each part, the reason for a choice that looks odd. A sentence that only restates the code ("adds a `cache` map and a `getCached` function") wastes their time; say what it is for ("repeat requests skip the disk"). Name real functions and files in `backticks`, but as evidence for the why, not as a tour.

## Work it out

1. Start from the file list: paths, sizes and the functions each change is in often show the ideas already. When the diff is not below, call `get_diff` with `summary: true` for that list, then `get_diff` with `files` for the patches you need, batched. Never read `[generated]` or `[binary]` files.
2. Use the pull request (below, when there is one) and `git log` for the range as hints at the intent. Group by the final change, not by commit: fixup and work-in-progress commits often mix concerns.
3. When a hunk does not tell you what a change is for, open the file or the code around it. Follow the main flow: where it starts (a route, a command, a UI event, a job) and which changed code it passes through.

## Plan the chapters

- One chapter is one idea a reviewer can hold in their head. Group by intent, not by folder: one feature touching several modules is one chapter. A file goes where it matters most.
- Use the fewest chapters that still keep independent ideas apart, usually 2-6; a small diff often needs one or two. Never one chapter per file just because there are files.
- A chapter over about 15 files is too long to read in one go: split it by sub-area, unless it is one mechanical edit repeated (a rename, an import change), which stays together as one `low` chapter.
- Order them so each makes sense after the ones before: the core change first, then what builds on it or wires it in, then tests, then config, migrations, docs and generated files.
- Every file of the diff goes in a chapter.
- With 5 or more chapters, group them into 2-4 `phase`s, the stages a reviewer would name (e.g. "Data layer", "API", "UI"), so the list reads as a short outline. Chapters of one phase sit next to each other.

## Write it

Write it the way you would explain the change to a teammate sitting next to you: plain words, short sentences, no filler, no praise. Say the one thing that matters and stop; the reviewer is about to read the code anyway.

- Each field has a word limit and `set_guide` rejects text over it. Aim well under it.
- At most one `code` name per sentence. A sentence full of identifiers reads like the diff, not like an explanation.
- A chapter summary says why the chapter exists. Put the rest in `points`, one fact each, or leave it out.

Too dense: "The data lives on the existing `youtube` Tiptap node as `duration`, `chapters` and `transcript` attributes, so it moves with the content through versions and publishing, and the node view shows a details panel only when the host passes `onFetchYoutubeDetails`."

Better: "Video details are stored on the YouTube embed itself, so they get saved and published with the article." Then a point: "Only the video editor gets the details panel; plain articles keep the old embed."

Notes and focus points are optional and sparing; add one only where it saves the reviewer real time, never to say what the code plainly shows. A note shows in the diff next to its line, so pin it to the line it is about whenever the point is about one spot; leave out `line` only for a point about the whole file.

## Show how it runs

Reviewers often want the order things happen in: this is called first, then this, then that. Pick the view by the shape of the code:

- **Call stack** (a chapter's `callstack`): the chapter's logic is a chain of calls that return, branch or return early. Start at the entry point (a route, command, UI event, job) and list the calls in the order they run, a callee right after its caller, one level deeper. Write rows as data flow, `result = fn(inputs)`, with `if …: return …` and `return …` rows where they matter. Mark rows `added`, `removed` or `same`, and give each linked row the `path` and `line` of the call so the reviewer can step through it in the diff. Keep it to about 4-12 rows on the main path; for a deep flow, give the overview in the core chapter and a short stack in the chapter of each changed callee. Skip it for config, tests, renames or a single function.
- **Diagram** (the overview `diagram`): the change adds or reshapes a flow between parts (modules, services, processes). Mark nodes `:::added`, `:::changed` or `:::removed`, so one picture shows before and after. Link each node that maps to code with `%% ref node:<id> [[path#L12]]`, and an arrow whose call matters with `%% ref edge:<from>-><to> [[path#L12]]`. Then add a `flow`: the nodes in the order a request goes through them, one sentence each, so the reviewer can play the diagram step by step.

Add a view only when it shows the reviewer something prose would not; never just to fill a slot.

## Link to the code

Anywhere in the guide's Markdown, `[[path]]` or `[[path#L12]]` renders as a link that jumps to that file or line in the diff. Use it sparingly, where the reader would otherwise have to hunt for the spot; paths exactly as `get_diff` lists them.

## Save

Call `set_guide` once with the whole guide. If it returns an error, fix exactly what it names (cut text that is too long, do not just drop it) and call it again. Then reply with one line: the number of chapters and their titles.
