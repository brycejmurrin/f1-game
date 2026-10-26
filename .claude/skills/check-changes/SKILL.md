---
name: check-changes
description: "Use when asked did I break anything, pick the minimum tests, validate/pre-push, verify track edits, js/css shell/cache policy, deploy-branch merge/push, or Playwright timeout triage. Red Actions → ci-red-triage."
---

# Validate changes before committing/pushing

The canonical command meanings and ladder are in
[`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md). This skill adds the
failure triage and tool-routing details; it does not redefine the ladder.

Before fixing a known-class defect, grep [`docs/notes/DEFECT-LEDGER.md`](../../../docs/notes/DEFECT-LEDGER.md) for its scope; moving a browser spec onto the node gate (a VM twin) → [`references/vm-twin.md`](references/vm-twin.md).

**Re-entry: read ONE section, not the file.** Which tests → §This tree, right now · before a push → §Prerequisites
(the gate) · a gate in flight → `node tools/ci/deploy.mjs --status`, or ONE `--wait --timeout 60` · a timeout or
red batch → [`references/triage.md`](references/triage.md) · after `sync-pr` →
[`references/sync-pr.md`](references/sync-pr.md) · red Actions → agent `ci-red-triage`.

## This tree, right now

Live selection, run when the skill loads (Claude Code expands the line; Cursor and
Codex run the command by hand — it is `pick-tests`, 0.1 s, read-only):

!`node tools/ci/pick-tests.mjs 2>&1 | head -24`

## Prerequisites

For prose-only edits, take the [canonical docs/skill fast path](../../../docs/VERIFICATION.md#docs-and-skill-changes)
before choosing the code gate below. Generated documentation is not prose-only;
agent-surface edits also run the focused `agent-config` checks.

`--fast` needs only Node modules; browser batches need the headless shell.
The SessionStart hook installs both (AGENTS.md §Verification 1); the manual
fallback is `bash tools/env/cloud-agent-install.sh`.

The suite is slow software rendering. **One command composes the rest**
(`pick-tests` selection, inline `verify-track` / `graph-parity` /
`tooling-fast` / `bump-cache --check`, then `test-bg` with **one browser
group per batch**):

```sh
node tools/ci/verify-change.mjs --plan       # what this change needs (JSON); explicit paths override the diff: --plan js/circuits/monza.js .claude/skills/x/SKILL.md
node tools/ci/verify-change.mjs --fast --json # machine-readable edit-loop verdict; no browsers — default for verify-agent
node tools/ci/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/ci/verify-change.mjs --wait       # every batch — ONLY when the parent asked
```

`--fast` is the edit-loop rung; before a code push run `node tools/ci/deploy.mjs --gate-only`
once (the ladder: AGENTS.md rule 3). A started batch's verdict is its log's `= run …` line
(`references/triage.md`).

The commit hook (two-call procedure: AGENTS.md rule 12) runs only in Claude Code sessions: Cursor and
Codex commits reach CI unguarded (two malformed changelog fragments did on 2026-10-26), so a
non-Claude branch's first CI run is its guard run — run `npm run test:guards` by hand before that push.

- **Already red?** `node tools/ci/deploy.mjs --train` prints the deploy branch's last ci /
  pages / nightly conclusions; `verify-agent --base <ref>` answers `DELTA: same-red |
  new-on-session | already-red-on-ref`; a red you did not cause → claim first (AGENTS.md §Git branch & deploy).
  A baseline comparison with no selected checks or unread results is unknown;
  both scoped runs green means no red, not a pre-existing failure.
- **Which groups, in what order?** `--plan`'s `batches` can exceed AGENTS.md §Verification's
  cap. Order: plan, then the two most specific groups one at a time (the master-gate spec
  alone for a quick signal), the rest named not-run, then the gate: `references/engine-physics.md`.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

## Output and reading budget

Agent-facing terminal calls default to compact through
`node tools/agent-run.mjs -- <existing command and arguments>`. Select
`--output-level diagnostic` or `--output-level full` before `--` when needed;
retrieve saved artifacts with `--read` instead of repeating an action for detail.
Configured MCP tools expose the same choices as `outputLevel` (default compact)
and `output_read`. [The common contract](../../../docs/agent-output/README.md)
explains saved evidence, pagination and the generated command catalog.

Load the reference below that matches the change or failure; expand only when
the evidence needs it. For routine reporting, return the verdict, required/not-run
groups and log paths from the supported JSON result; JSON is structured output,
not a promise of smaller output. Preserve the command's exit status and complete
logs. On failure, read and include the actionable failure block and relevant
cause/stack; offer full detail when requested or needed to diagnose. A partial,
pending or truncated result never proves a pass. Do not rerun an unchanged check
just to obtain a different output format.
For routine handoff snapshots use `node tools/ci/session-status.mjs --summary`
(`--pr <n>` adds live PR/CI state); omit `--summary` for the full handoff, or
use `--json` for complete data. Local log counts are not current-tip verification.
For tree health, `node tools/check/doctor.mjs` already prints only warnings,
failures and counts; its `--json` returns every check for programmatic analysis.

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
