---
name: check-changes
description: Use when the user asks did I break anything, run the right tests, validate changes, ready to push, pre-commit/pre-push checks, test selection for touched files, verify track edits, or confirm cache bump before shipping Apex 26 changes. For Playwright timeouts/hangs use test-timeout-triage; spawn verify-agent for a read-only --fast JSON verdict.
---

# Validate changes before committing/pushing

The suite is slow software rendering. **One command composes the rest**
(`pick-tests` selection, inline `verify-track` / `graph-parity` /
`tooling-fast` / `bump-cache --check`, then `test-bg` with **one browser
group per batch**):

```sh
node tools/verify-change.mjs --plan       # what this change needs (JSON)
node tools/verify-change.mjs --fast       # no browsers — default for verify-agent
node tools/verify-change.mjs              # fast gate + start batch 1 (background)
node tools/verify-change.mjs --wait       # every batch — ONLY when the parent asked
```

`--wait` blocks for the full queue. Subagents and the default loop use
`--fast` or a single started batch, then read
`artifacts/logs/*.log` for `= run (passed|failed|timedout|interrupted)`.

Full wrap map (every `apex_*`, never-wrap): `docs/AGENT-SURFACE.md`.
Pinned flags without re-learning CLIs (Cloud has no `.mcp.json` catalog):

```sh
./tools/apex-tools-mcp.sh call apex_status '{}'
./tools/apex-tools-mcp.sh call apex_verify_change_fast '{"dryRun":true}'
./tools/apex-tools-mcp.sh call apex_pick_tests '{}'
./tools/apex-tools-mcp.sh call apex_verify_track '{"id":"monza"}'
./tools/apex-tools-mcp.sh call apex_wgx_validate_static '{}'
./tools/apex-tools-mcp.sh call apex_select_specs '{"since":"HEAD~1"}'
./tools/apex-tools-mcp.sh call apex_assets_verify '{}'
./tools/apex-tools-mcp.sh call apex_float_audit '{"id":"monza"}'
./tools/apex-tools-mcp.sh call apex_select_recall '{}'
./tools/apex-tools-mcp.sh call apex_cache_bump_only '{"since":"HEAD~1"}'
./tools/apex-tools-mcp.sh call apex_graph_parity '{"base":"HEAD~1","id":"monza"}'
./tools/apex-tools-mcp.sh smoke                 # five repo wrappers; no Chromium
```

Browser wraps (`apex_eval` / `apex_shot` / `apex_carshot` / …) take the lock —
call `apex_status` first. Never wrap `test-bg` start/`--wait`.

Pieces underneath:

```sh
git status --short && git diff --stat
node tools/pick-tests.mjs                 # groups this change needs
node tools/pick-tests.mjs --staged
node tools/pick-tests.mjs --bg            # ready-to-paste background command
```

Routing lives in `RULES` at the top of `tools/pick-tests.mjs`. An unrouted
change is a missing rule — add it there; `tests/unit/test-groups.test.mjs`
fails if a source directory routes to nothing. **One exception:**
`js/track/graph.js` is routed to a group, but its real gate is
`tools/graph-parity.cjs` (see [references/guards.md](references/guards.md)).

## Run them in the background

```sh
pgrep -cf pw-browsers; cat /proc/loadavg   # expect 0 browsers, load < ~3
node tools/test-bg.mjs <group> [group...]
node tools/test-bg.mjs --status
node tools/test-bg.mjs --stop
```

`verify-change` batches at **one browser group** (padded with node-only
groups). `test-bg` itself caps total groups at `floor(CORES/WORKERS)` with
no browser/node split — `smoke` + `physics` is allowed on 4 cores. Do not
pair two browser groups yourself. Do not edit `js/`/`css/` while a run
serves this tree (use a worktree).

## Escalation

| Step | Command | Why |
|---|---|---|
| 1 | `node tools/test-bg.mjs tiny` | page loads, `__apex` responds |
| 2 | `npm run test:tooling-fast` | ~25 s — enough for most edits |
| 3 | `node tools/verify-track.cjs <id>` | any track edit — 2 s, no browser |
| 4 | groups `pick-tests` named | via `verify-change` or `test-bg` |
| 5 | `npm run test:sweeps` | before pushing, if geometry moved |

WGX / `js/render/webgpu/` edits: `node tools/wgx-validate.mjs --static`
first (no browser). Full Dawn pass is a parent-session job, not a subagent.

## Load on demand

- Track/graph/cache/smoke guards, how to read a failure, push rules →
  [references/guards.md](references/guards.md).
