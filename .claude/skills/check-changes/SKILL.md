---
name: check-changes
description: "Use when asked did I break anything, run or pick the right tests for touched files, validate or pre-push check a change, verify track edits, the shell/cache policy after a js/css edit (tags stay ?v=dev), merging or pushing to the deploy branch, or triaging a Playwright timeout/hang or `--wait` exit 124 (machine load vs real failure). A red Actions run is ci-red-triage; driving a PR to green is steward."
---

# Validate changes before committing/pushing

## This tree, right now

Live selection, run when the skill loads (Claude Code expands the line; Cursor and
Codex run the command by hand — it is `pick-tests`, 0.1 s, read-only):

!`node tools/ci/pick-tests.mjs 2>&1 | head -24`

## Prerequisites

`--fast` needs only Node modules; browser batches need the headless shell.
The SessionStart hook installs both (AGENTS.md §Verification 1); the manual
fallback is `bash tools/env/cloud-agent-install.sh`.

The suite is slow software rendering. **One command composes the rest**
(`pick-tests` selection, inline `verify-track` / `graph-parity` /
`tooling-fast` / `bump-cache --check`, then `test-bg` with **one browser
group per batch**):

```sh
node tools/ci/verify-change.mjs --plan       # what this change needs (JSON); explicit paths override the diff: --plan js/circuits/monza.js .claude/skills/x/SKILL.md
node tools/ci/verify-change.mjs --fast       # no browsers — default for verify-agent
node tools/ci/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/ci/verify-change.mjs --wait       # every batch — ONLY when the parent asked
```

**BEFORE A PUSH, `--fast` IS NOT THE TOP RUNG.** AGENTS.md rule 3 is a ladder
and `verify-change` sits on rung 2: `test:tooling-fast` is a SUBSET of the unit
files (the live figures are rule 3's, generated), and the rest have taken deploys
red three times. The only pre-push
check that runs what the deploy runs is

```sh
node tools/ci/deploy.mjs --gate-only         # pushes NOTHING; a dirty tree is fine
```

Use `verify-change --fast` in the edit loop and for a subagent verdict; run
`--gate-only` once before you push. Green on rung 2 never means green on
rung 3 (`docs/notes/PREPUSH-GATE-LADDER.md`).

`--wait` blocks for the full queue. Subagents and the default loop use `--fast` or a single
started batch, then read the log's `= run …` verdict line (anchor and waiter: `references/triage.md` §Rules
that prevent the class; AGENTS.md rules 4-5). Push once per verified batch: a push over a live run cancels it.

Is the tree already red? Not a `--plan` question: `node tools/ci/deploy.mjs --train`
prints the deploy branch's last ci / pages / nightly conclusions; before blaming your
change, `verify-agent` with `--base <ref>` answers `DELTA: same-red | new-on-session |
already-red-on-ref`; before fixing a red you did not cause, `node tools/ci/who-is-on-it.mjs`.
Scale the plan to AGENTS.md §Verification's table: its `batches` can list more browser
groups than the cap; the engine / physics recipe is `references/engine-physics.md`.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

Pinned flags without re-learning CLIs (Cloud has no `.mcp.json` catalog):

```sh
./tools/mcp/apex-tools-mcp.sh call apex_verify_change_fast '{"dryRun":true}'
./tools/mcp/apex-tools-mcp.sh call apex_pick_tests '{}'
./tools/mcp/apex-tools-mcp.sh call apex_bump_cache_check '{}'
node tools/track/verify-track.cjs monza          # one circuit (plain CLI; no wrap)
./tools/mcp/apex-tools-mcp.sh smoke
```

## Load on demand

- Gate contracts, ratchets, reading a failure → [`references/guards.md`](references/guards.md)
- A test timed out / hangs / `--wait --timeout` exited 124 / passes solo but not loaded (or vice versa) —
  step 0 (read-only load + log anchors), the decision tree and `test-solo.mjs` → [`references/triage.md`](references/triage.md)
- No cache bump after a `js/`/`css/` edit (`?v=dev`; the deploy stamps hashes); `gen-shell` after a manifest change (last
  edit before commit) → [`references/bump.md`](references/bump.md)
- Engine / physics / `js/game.js` change: which two groups, the master gate, ratchets, vstd-lint →
  [`references/engine-physics.md`](references/engine-physics.md)
- After `sync-pr.mjs` (HEAD is left on `sync-pr-<branch>`, not your branch) →
  [`references/sync-pr.md`](references/sync-pr.md)
- Merging with / pushing to the deploy branch, union sweeps, baseline
  grow/shrink rules, Pages concurrency → [`references/deploy.md`](references/deploy.md)
