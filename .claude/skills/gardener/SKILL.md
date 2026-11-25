---
name: gardener
description: "Use when working code needs tidying: decouple a module, dedupe copied helpers, a file to split, game.js façade bloat, unclear structure, or a structure survey into a cleanup plan issue. Not for: dead code or a ratchet over → slim-bloat."
---

# Gardener — prune the structure, change no behaviour

The Gardener is a hunter that does not hunt bugs, perf or features. It finds structure debt (copies instead of
helpers, state parked on the wrong owner, coupling through `G`, a file doing fifteen jobs, two predicates for one
concept) and writes it up as a plan; the cleanup itself is separate implementation work. Role definition: Bryce, 2026-11-25 ~02:15Z ("more like
a hunter but it doesn't focus on bugs or improvements or optimizations, it focuses on cleaning up code, making things
clearer, cleaner, decoupling, structure etc"; ~02:17Z "the gardener can also use the lsp mcp/tools heavily"; ~02:41Z "I thought gardeners wouldn't
create PRs, just issues or big design plans"). The first plans: tracking issues #6454 (js), #6455 (UI) and #6456
(tooling); the evidence for the rules below is the survey note of PR #6442 (`GARDENER-SURVEY-2026-11-25.md`).

**The boundary.** Too big or dead (a ratchet OVER, an unused symbol, dead CSS, a stale comment) → skill `slim-bloat`.
Wrong shape (duplication, coupling, unclear ownership, a split along the jobs a file already has) → here. A bug found
while gardening is a `bug` issue of its own. A launch (when, how many) → skill `dispatcher`; owning a CARVE PR →
`steward`.

## apex-lsp first

Bryce, ~02:33Z: "it can use grep but should use the lsp". Every JS-symbol number in a plan row (callers, consumer
files, copies, free names) comes from one of these and cites the query; skill `code-nav` has the call shapes and
`.claude/rules/js-nav.md` the grep boundary:

| tool | job |
|---|---|
| `lsp_outline {file}` | a module's shape: the map of the jobs a big file does |
| `lsp_references` / `lsp_callers` `files: true` | fan-in and fan-out per file; `G.<member>` consumers (one consumer = state parked on `G`) |
| `lsp_symbols {query}` | same-named copies across files: the duplicate finder |
| `lsp_definition body: true` | two suspected twins side by side: a copy, or one rule spelled two ways? |
| `lsp_hover` | implicit-`any` seams a move would cross |
| `lsp_diagnostics {file}` | the move type-checks, before the floor |

Grep is for text shapes only (an inline `((x % L) + L) % L`, storage keys, CSS, YAML, comments). Free names of a block:
`node tools/check/extract-module.mjs <file> <start> <end>`. Same-scope twins: `node tools/check/dup-functions.mjs`.
`G` fan-in figures are lower bounds where a module destructures `const {…} = G`; re-check a "1 consumer" row by text.

## SURVEY — read-only; the output is an issue, never a PR

1. Step 0: agent `prior-art-scout` on the slice (plus the open `tracking` issues of earlier surveys,
   `docs/notes/G-FACADE-REVIEW-2026-11-20.md`, `docs/notes/DEFECT-LEDGER.md` §8, `docs/ARCHITECTURE.md`
   §Extraction lessons): the `known:` list.
2. Census: `node tools/check/ratchets.mjs --json` (which rows sit at slack 0, and what keeps raising them:
   `docs/notes/CEILING-HISTORY.md`), the apex-lsp passes above.
3. One agent `gardener` per `js/` slice, in parallel, with `known:` (its `tools:` list leads with apex-lsp and its
   rows cite the query behind each number); a non-JS slice (`tools/`, `css/`, tests) gets `code-hunter` with
   `focus: duplication` or `mess`. Do the parent's own fan-in checks with the apex-lsp tools too.
4. Agent `finding-verifier` on the cited rows before any of them enters the plan; unread rows stay PLAUSIBLE.
5. File ONE tracking issue per area (`issue_write`, labels `tracking` plus its `area:*`; never `ready`, which would
   launch it): a checklist of items ranked by payoff ÷ risk, each with What/where, Hurts, Shape, PRs (one carve
   each), Pin first, Frees (ratchet lines, `gMembers`, `topLets`), Risk, Collides (the open PRs on the same files);
   each number cites its LSP query. The body ends with `Re-measure-by: <date>` and one line
   `Tools used: lsp N · grep M · read K` (parent and agents together). A detail note too long for the body may sit on an
   unmerged branch, linked from the issue. No PR, no commit to the deploy branch. About monthly.

## CARVE — a worker's PR, only for an item Bryce picked

A CARVE starts only when Bryce picks one checklist item, by his own `ready` click on its sub-issue or a `decision:`
comment on the tracking issue (that provenance is the grant: AGENTS.md §Coordination); the worker follows these
rules and skill `steward`. Before the first edit:

- **Quiet queue.** Carve only when the deploy tip is green (no open `deploy:red`, the latest Pages run on the tip
  passed) AND at most 10 PRs are ready or labelled `land` (`node tools/ci/pr-board.mjs --json`) AND no other
  Gardener PR is open. Otherwise stop and report the count.
- **No collisions.** List the files of every open non-docs PR (`pull_request_read` `get_files`, or the survey's
  Collides line refreshed). Skip any file one of them touches until it lands. D-033 allows parallel edits; the
  Gardener declines them on purpose, because a cleanup that conflicts with a feature costs the feature.
- **`G` sub-façade moves** follow the E-then-A decision in `G-FACADE-REVIEW-2026-11-20.md`: a lane already in that
  domain, or Bryce's `decision:` (skill `steward` §Lane, item 6).

Then, in order:

1. **Characterization tests first**, their own commit: they pass on the old code and pass unchanged after the move
   (a unit table for a pure helper; a recorded input series for a stateful one; a snapshot such as
   `node tools/car/parts-ladder.mjs --json` for geometry). A behaviour the copies disagree on is recorded, not
   unified silently: the choice is Bryce's.
2. **One carve.** Move, re-point callers, delete the copy. A new file follows the new-file recipe in
   `.claude/rules/game-code.md`; IIFE stays IIFE. Run the leftover check of
   [carves.md](../slim-bloat/references/carves.md) §1 (`lsp_references` on every removed symbol) and `lsp_diagnostics` on every edited file.
3. **Ratchets only go down** (the rule's home: `.claude/rules/game-code.md`). A Gardener PR never carries
   `ratchet-raise`; it may ADD a new per-file or shrink-only ceiling (a new row is not a raise).
4. The floor (AGENTS.md rule 3), then the PR through skill `steward` (draft, one push per round, `pr-reviewer`
   before the flip). The PR body names the tracking issue item and its measured before/after numbers; tick the item there.

## Never

- A behaviour change, a bug fix, a tolerance or a feature riding along: file an issue and link it.
- `updateCar()` / `render()` splits, the timestep, physics, IIFE→ESM, a "simplified" load-bearing quirk
  ([do-not.md](../slim-bloat/references/do-not.md)).
- Renaming a stored key, an `__apex` hook name or a DOM id a spec or the bridge reads.
- A PR from SURVEY; two carves in one PR; a second Gardener PR while one is open.
