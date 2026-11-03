---
name: check-changes
description: "Use when asked did I break anything, which tests this change needs, validate or pre-push, verify track edits, js/css shell/cache version bump, deploy checks on a dirty tree, a Playwright timeout or a background run to wait on. Not for: red Actions → ci-red-triage; opening or landing the PR → steward."
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

`--fast` needs only Node modules; interactive browser pokes need the headless shell.
The SessionStart hook installs both (AGENTS.md §Verification 1); the manual
fallback is `bash tools/env/cloud-agent-install.sh`.

## The minimum before a push (one floor)

The floor is AGENTS.md rule 3 (its one home): `tooling-fast --changed --jobs=3 --quiet`, or `verify-track.cjs <id>`
for a circuit. In practice:

```sh
node tools/ci/verify-change.mjs --fast --json      # the fast phase: tooling-fast --changed, verify-track, graph-parity, bump-cache; no browsers
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet   # the same floor, plain; a red run ends with `failing files:` and `log:` lines
```

The PR's tiers run the rest of the ladder (every draft push gets the fast tier plus a selected browser shard); name
the groups `pick-tests` lists as not-run in the PR, or run one on the pushed branch with
`node tools/ci/remote-group.mjs <group>`. No local browser test runs (AGENTS.md rule 5): a Bryce-attended session
may run ONE named spec on his explicit grant, recorded in the PR body, as a background task.

```sh
node tools/ci/verify-change.mjs --plan       # what this change needs (JSON); explicit paths override the diff: --plan js/circuits/monza.js .claude/skills/x/SKILL.md
```

Anything over 2 minutes is ONE background Bash task logging to `artifacts/logs/` (AGENTS.md rule 4). Waiting:
`node tools/ci/wait-for.mjs --log-matches <log> '^= '` as the task; a `Monitor` (5 min default, 30 max) is early
warning only (`tail -f <log> | grep --line-buffered -E '^= |Error:'`). The verdict is the log's closing `= …` line
(`= tooling-fast passed|failed (<n> files, <m> failed)`; a `test-bg` log's `= bg exit N`); never the process table.

The commit hook guards Cursor and Codex commits too (AGENTS.md §Agent extensions; two calls: rule 12).

- **Already red?** `node tools/ci/deploy.mjs --train` prints the deploy branch's last ci /
  pages / nightly conclusions; `verify-agent --base <ref>` answers `DELTA: same-red |
  new-on-session | already-red-on-ref`; a red you did not cause → skill `steward` §Red.
  A baseline comparison with no selected checks or unread results is unknown;
  both scoped runs green means no red, not a pre-existing failure.
- **Which groups, in what order?** `--plan`'s `batches` are the groups; they run on the pushed PR
  (`remote-group.mjs`), the rest named not-run: `references/engine-physics.md`.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.

## Output and reading budget

Output levels, saved evidence and `--read`: [the common contract](../../../docs/agent-output/README.md). Report the
verdict, required/not-run groups and log paths; a partial or truncated result never proves a pass. Handoff snapshot:
`node tools/ci/session-status.mjs --summary` (`--pr <n>` adds live PR/CI state).

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
- A test timed out / hangs / a CI shard passes solo but not loaded (or vice versa) —
  step 0 (read-only load + log anchors), the decision tree and `test-solo.mjs` → [`references/triage.md`](references/triage.md)
- No cache bump after a `js/`/`css/` edit (`?v=dev`; the deploy stamps hashes); `gen-shell` after a manifest change (last
  edit before commit) → [`references/bump.md`](references/bump.md)
- Engine / physics / `js/game.js` change: which two groups, the master gate, ratchets, vstd-lint →
  [`references/engine-physics.md`](references/engine-physics.md)
- After `sync-pr.mjs` (HEAD is left on `sync-pr-<branch>`, not your branch) →
  [`references/sync-pr.md`](references/sync-pr.md)
- Merging with / pushing to the deploy branch, union sweeps, baseline
  grow/shrink rules, Pages concurrency → [`references/deploy.md`](references/deploy.md)
