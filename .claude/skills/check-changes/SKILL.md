---
name: check-changes
description: "Use when asked did I break anything, pick the minimum tests, validate/pre-push, verify track edits, js/css shell/cache version bump, the deploy's own checks on a dirty tree, or Playwright timeout triage. Not red Actions → ci-red-triage; landing → ship."
---

# Validate changes before committing/pushing

The canonical command meanings and ladder are in
[`docs/VERIFICATION.md`](../../../docs/VERIFICATION.md). This skill adds the
failure triage and tool-routing details; it does not redefine the ladder.

Before fixing a known-class defect, grep [`docs/notes/DEFECT-LEDGER.md`](../../../docs/notes/DEFECT-LEDGER.md) for its scope; moving a browser spec onto the node gate (a VM twin) → [`references/vm-twin.md`](references/vm-twin.md).

## This tree, right now

Live selection, run when the skill loads (Claude Code expands the line; Cursor and
Codex run the command by hand — it is `pick-tests`, 0.1 s, read-only):

!`node tools/ci/pick-tests.mjs 2>&1 | head -24`

PR status only → **check**; diagnosing or fixing a failed PR → **steward**.

## Prerequisites

For prose-only edits, take the [canonical docs/skill fast path](../../../docs/VERIFICATION.md#docs-and-skill-changes)
before choosing the code gate below. Generated documentation is not prose-only;
agent-surface edits also run the focused `agent-config` checks.

`--fast` needs only Node modules; browser batches need the headless shell.
The SessionStart hook installs both (AGENTS.md §Verification 1); the manual
fallback is `bash tools/env/cloud-agent-install.sh`.

## The minimum before a push (one floor)

The pre-push floor is AGENTS.md rule 3 → docs/WORKERS.md §3 (its one home). In practice, two commands:

```sh
node tools/ci/verify-change.mjs --fast --json      # the fast phase: tooling-fast (when warranted), verify-track, graph-parity, bump-cache; no browsers
node tools/ci/test-bg.mjs --spec tests/specs/<file>.spec.js   # the ONE spec, background; pick it: select-specs.mjs --since <base>
```

(a circuit edit swaps the spec for `node tools/track/verify-track.cjs <id>`). The PR's tiers run the rest of the
ladder; name the groups `pick-tests` lists as not-run in the PR, or run one on the pushed branch with
`node tools/ci/remote-group.mjs <group>`. A started run's verdict is its log's `= run …` line (`references/triage.md`).

```sh
node tools/ci/verify-change.mjs --plan       # what this change needs (JSON); explicit paths override the diff: --plan js/circuits/monza.js .claude/skills/x/SKILL.md
node tools/ci/verify-change.mjs              # NOT a floor: starts batch 1, a WHOLE browser group (AGENTS.md §Verification's cost) — only when asked
node tools/ci/verify-change.mjs --wait       # every batch — ONLY when the parent asked; prefer remote-group.mjs
```

The commit hook guards Cursor and Codex commits too (AGENTS.md §Agent extensions; two calls: rule 12).

- **Already red?** `node tools/ci/deploy.mjs --train` prints the deploy branch's last ci /
  pages / nightly conclusions; `verify-agent --base <ref>` answers `DELTA: same-red |
  new-on-session | already-red-on-ref`; a red you did not cause → claim first (AGENTS.md §Git branch & deploy).
  A baseline comparison with no selected checks or unread results is unknown;
  both scoped runs green means no red, not a pre-existing failure.
- **Which groups, in what order?** `--plan`'s `batches` are the groups; locally run ONE spec
  (`test-bg.mjs --spec`), the groups on the pushed PR (`remote-group.mjs`), the rest named not-run:
  `references/engine-physics.md`.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

## Output and reading budget

Output levels, saved evidence and `--read` retrieval: [the common
contract](../../../docs/agent-output/README.md) (`node tools/agent-run.mjs -- <cmd>`).
Report the verdict, required/not-run groups and log paths; keep the exit status;
a partial, pending or truncated result never proves a pass.
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
