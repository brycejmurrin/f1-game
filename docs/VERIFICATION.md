# Verification — the commands, the ladder, the floor, the flake procedure

The one home of the verification commands. `AGENTS.md` §Verification holds the
rules (what to run for which change) in one line each and links here; skills,
TESTING.md and plans link here instead of restating a command. Merged
2026-11-03 (docs/plans/2026-11-03-agent-surface-reset.md §4.9, D-001) from the
ladder note `notes/PREPUSH-GATE-LADDER.md` and TESTING.md's §1 command blocks and
§3 flake procedure.

## By change

What to run for each kind of change (AGENTS.md §Verification points here). Agents run no browser test locally: the
PR's tiers run the groups `pick-tests` names; a whole group (`remote-group.mjs <group>`) dispatches only with Bryce's own opt-in (`APEX_GH_OWNER_WRITE=1`: the dispatch is a gh-token write, recorded as his act), so an agent asks with `needs-decision`. A Bryce-attended session may run ONE named spec locally on his explicit grant, recorded in the PR body.

| change touches | verify with |
|---|---|
| docs or skills only | the docs-only fast path (AGENTS.md §The loop) |
| tools, tests | `tooling-fast --changed` plus the touched test file; the full suite runs on the PR as `Structural guards` |
| one circuit (`js/circuits/<id>.js`) | `node tools/track/verify-track.cjs <id>`; that circuit's foundation cases run on the PR (`tests/specs/circuit-foundation.spec.js` under APEX_CIRCUITS=<id>, or its ADAPTED spec) |
| one subsystem with its own spec | the floor (`tooling-fast --changed`); the spec `select-specs` names runs on the PR |
| `js/render/webgpu/` or `js/render/three/` | the path-scoped rule in `.claude/rules/` says what to run; software probes are not evidence about a player's GPU, so dispatch `gpu-census.yml` on `macos-latest` and read its Verdict step |
| engine / physics / `js/game.js` | the local floor is `tooling-fast --changed`; the groups `pick-tests` names run on the PR; name any left unrun as not-run in the PR |
| a whole browser group (not one spec) | the PR's ready run; `node tools/ci/remote-group.mjs <group>` on the PUSHED branch (`browser-group.yml`, four llvmpipe shards, 10–15 min wall) only with Bryce's opt-in |
| geometry the FLEET build executes (`tools/ci/geometry-paths.mjs`), or a group this box cannot time | locally only the floor (rule 3): never `npm run test:sweeps` here. CI's `sweeps` job runs the fleet on the PR when the diff reaches it (a lighting, car, debris-world or driving-line edit runs only its TARGETED suite there); for earlier proof (Bryce-attended: the hooks ask first) dispatch `ci.yml` with `group: <name>` and read the four Smoke jobs |

## 1. Which tests does this change need?

```sh
node tools/ci/pick-tests.mjs                 # GROUPS, vs the branch point + working tree
node tools/ci/pick-tests.mjs --staged
node tools/ci/pick-tests.mjs js/car/parts.js # explicit paths
node tools/ci/pick-tests.mjs --bg            # only the remote-group.mjs commands, one per browser group
node tools/ci/select-specs.mjs --since <ref>              # SPECS, one per line, under a time budget
node tools/ci/select-specs.mjs --since <ref> --budget-min 15
```

The routing rules live in `RULES` at the top of `tools/ci/pick-tests.mjs`: coarse
and biased toward running too much (a rule that is too narrow is a missed
regression; one that is too wide costs 10–40 minutes of serialized SwiftShader
per extra browser group). `select-specs` decomposes the picked groups into spec
files under a budget and names everything it skipped; it powers the change-aware
CI gate. A single spec (`npm test -- tests/specs/<file>.spec.js`) is always
preferable to its whole group when the change touches that spec's subject and
nothing else. `tests/unit/test-groups.test.mjs` asserts every group they name exists.

## 2. The local edit loop

```sh
node tools/ci/tooling-fast.mjs --changed --jobs=3 --quiet   # the diff-aware node check
node tools/ci/verify-change.mjs --plan --json               # the same selection, with its budget
node tools/ci/verify-change.mjs --fast --json
```

A green `--changed` run is evidence for the changed slice, not that the deploy
gate will pass (§4). Make ALL source edits first, then verify once: the tests
serve `js/` and `css/` from the working tree.

## 3. The pre-push floor

`tooling-fast --changed --jobs=3 --quiet`; `node tools/track/verify-track.cjs <id>`
for a circuit; the docs-only fast path for prose. No agent runs a browser spec
locally (AGENTS.md rule 5): the specs `pick-tests` / `select-specs` name are proven
by the PR's `selected` shard, and a whole group runs on the pushed branch with
`node tools/ci/remote-group.mjs <group>` when Bryce opts in (the group names are the ones
`pick-tests` prints):

```sh
node --test tests/unit/docs-integrity.test.mjs tests/unit/agent-config.test.mjs
```

Run `npm run gen:check` when a generated reader or a tool `@doc` header changed.
The full tiers run on the PR: every draft push gets the fast tier plus the
`selected` legs under a 5-min budget with no overflow — one leg for a typical
diff; a wide diff still fans out, because `select-specs` never drops a routed
spec (its `Structural guards` A–D run the full `tooling-fast`, the check
`ready-gate` reads), the full tier runs once the PR is ready (a ready flip
skips the `selected` legs when the newest run on the same head passed them on
its first attempt with the same plan, on a base that is still the deploy tip:
`tools/ci/reuse-draft-selected.mjs`), and
`land.yml`'s `gate` check judges the merge result. A ready plan that DROPS a
routed spec (the over-budget pool is full) is red unless every dropped spec ran
green in a `remote-group.mjs <group>` run on the same head and base, first
attempt, llvmpipe (`tools/ci/dropped-group-runs.mjs`, #5480): run the group
BEFORE the ready flip (the verdict waits at most 7 min for a running one);
after the red, run it and flip draft and back. A worker ends its turn at
`land` (skill `steward` §Land).

## 4. The gate is a ladder, and the rungs are not the same size

Three commands are all called "the gate", and each is a strict subset of the next:

```sh
npm run test:guards                     # the commit hook's rung (cross-file guards)
npm run test:tooling-fast               # the structural rung; a green run writes the stamp ready-gate accepts
node tools/ci/deploy.mjs --gate-only    # the deploy's node half; reproduces a gate-only red; never pushes
node tools/gen/gen-ladder-figures.mjs --table   # the sizes, measured (never committed)
```

Green below never means green above. `node tools/gen/gen-ladder-figures.mjs`
prints the table (command, unit files it runs, how many it leaves out, when it
runs), measured from `tests/groups.json`, `tests/unit/` and ci.yml's "Pure-node
unit suites" step. The sizes are not committed: every PR that added a test file
changed the same digits, so any two such PRs conflicted on them (14 of 15
deploy-branch reds on 2026-09-29); `docs-integrity.test.mjs` checks the shape
(guards < tooling-fast < gate ≤ disk) and that no doc quotes a size.

The files the whole gate leaves out are the per-circuit geometry sweeps:
`ci.yml` gives them their own jobs, `deploy.mjs` leaves them to CI (running them
in the deploy duplicated ten minutes), and `tests/unit/prepush-gate-coverage.test.mjs`'s
`SWEEPS_ONLY` map enumerates them. Those CI jobs are conditional, so a pin in one
of those files can sit red for a while; if one starts breaking on source edits,
move it into a gate group rather than widening the list.

`tooling-fast` being a subset is deliberate: it is tuned for an edit loop, and
the files it leaves out cost about 7.5 minutes serial on this box (`game-vm-a`
137 s, `game-vm-b` 99 s, `node-slow` 85 s, `sweeps-parts` 54 s, `garage-unit`
47 s are 95 % of it; measured 2026-09-18). The problem was never the split; it
was that nothing said the split existed, so "tooling-fast is green" got read as
"the gate is green". `npm run test:tooling-fast` with no `--jobs` picks its own
width (`--jobs=2` when no Playwright suite or host browser is live and the 1-min
loadavg is under 2, else serial, and it prints which); serial the floor is ~47
min of file time on a 4-core container, `--jobs=3` measured 16.1 min
(2026-10-24, PR #3694). `deploy.mjs` keeps its pinned `--jobs=2`, CI its `--jobs=4`.

**The three incidents behind the ladder** — one shape, a source edit tripping a
pin in a file the pre-push command does not execute:

- **2026-09-02, runs 1888/1889.** Two deploys went red on pins tooling-fast never
  runs. Cure: `gateNodeSuites()` in deploy.mjs derives the Pages gate's node half
  from `ci.yml` at runtime, so the deploy runs exactly what the gate runs.
- **2026-09-10.** Six files sat in `test:garage-unit` / `test:steering-unit`,
  which ran in NO job. Fixed by adding them to the tooling-fast list.
- **2026-09-18.** `tests/unit/quali-persist.test.mjs` pins `setPaused`'s
  teardown as an exact source line; a fourth live-preview panel had to join it.
  `test:tooling-fast` passed 204/206; the break surfaced only when `deploy.mjs`
  reached its `test:state-unit` leg, after a push. The pin itself is good — that
  line is exactly where a new panel gets forgotten — so the fix taught the
  assertion the fourth closer rather than loosening it.

What exists because of them: `deploy.mjs --gate-only` (the gate's code path,
pushes nothing, accepts a dirty tree, keeps the loadavg and live-Playwright
refusals); `prepush-gate-coverage.test.mjs` (every unit file is run by the gate
or named in `SWEEPS_ONLY` with the job that runs it; it caught itself on its
first run). `test-coverage-audit` asks a different question ("is this file in
some topical group?") — a file can pass it while nothing runs it before a push.

## 5. Flaky tests

Playwright retries default to **1 under `CI`** when unset (`playwright.config.js`);
the change-aware `selected` gate sets `--retries=0` so a flake is news, not a
doubled bill — except a QUARANTINED spec, which `select-specs.mjs` schedules
alone in its own leg with `--retries=1` (2026-10-10, R3-CI-HEALTH-4), so one
quarantined flake cannot red an otherwise green leg. Under `APEX_FAIL_ON_FLAKY=1`
(every browser job in `ci.yml`) a pass-on-retry is a red unless its exact full
test title matches an unexpired policy in `tests/data/flaky-quarantine.json`;
the ledger names an accountable owner, evidence, expiry and review criteria.
Quarantined tests still run and permanent failures remain red. Agents fix real
failures; re-run a failed job at most once and only for timeout / infra errors
(`tools/ci/ci-rerun.mjs`); never skip a test or loosen a tolerance to get green.
`tests/unit/flaky-quarantine.test.mjs` pins the ledger and the wiring.

**Detection is daily, not by hand (2026-10-16).** `.github/workflows/flake-tally.yml`
runs `node tools/ci/flake-tally.mjs --events all --days 2 --propose --issue`
every morning over every FAILED `ci.yml` and `pages.yml` run of the last two
days (a green run holds no unquarantined flake under `APEX_FAIL_ON_FLAKY=1`, a
cancelled run tested nothing), tallied by spec + title, with the repeat offenders
proposed as quarantine rows — a test that passed only on retry in ≥ 2 runs, or
failed first-try on ≥ 3 branches. It rewrites one open issue labelled `flaky`;
the ledger itself stays a PR with an owner and the evidence run.

**Base-red detector.** The same workflow runs every 2 hours in `--base-red` mode
over the last 3 h of failed runs: a spec that failed first-try on 3 or more
unrelated branches, or on 2 including the deploy branch, is a red on the base,
not on any one diff. It opens, refreshes or closes ONE issue labelled `base-red`
("Base red suspects (auto)"). Advisory: nothing blocks on it; it exists so the
tenth session to meet the same red looks at the deploy branch first.

A pass that needed a retry is a red: list the flaky test in the PR like a
not-run group, then fix it or quarantine it. A failed or cancelled selected
matrix is red even if sibling JUnit is clean: missing execution evidence needs a
successful rerun.

## 6. CI and Pages

PR CI validates the PR head; the deploy branch requires one check, `gate`, whose
ci row requires `CI` green on the head (D-031). Every PR push starts CI (a
draft's run is the fast tier plus the 5-min-budget `selected` legs, §3); `= ci none` after a
push means no open PR carries the sha. A deploy-branch push starts the Pages release
train; there is no separate ship-push CI run. A green PR is not proof that Pages
is live; verify live `version.json` and the apex SHA with `deploy-research`
after Pages succeeds. For failure triage: `node tools/ci/ci-watch.mjs --sha <head>`
and agent `ci-red-triage`; never infer a verdict from a running job with zero
failures or from a cancelled superseded run.

## 7. Routine status reporting

`node tools/ci/session-status.mjs --summary` returns a bounded snapshot: branch,
push/dirty/live-run state, inventory counts, and up to three failed or unresolved
log examples (`--json` for full data, `--pr <n>` for live PR/CI evidence). The
local log counts describe historical files, not verification of the current
commit; unknown states stay unknown and the ready gate is not evaluated by it.

## Related readers

- [AGENTS.md](../AGENTS.md) — the binding rules, one line each.
- [steward](../.claude/skills/steward/SKILL.md) — the PR lifecycle: open, push, red, `land`, where a session ends.
- [TESTING.md](TESTING.md) — test groups, costs, harnesses and the release train.
- [ARCHITECTURE-MAP.md](ARCHITECTURE-MAP.md) — where verification tools fit.
- [AGENT-SURFACE.md](AGENT-SURFACE.md) — CLI and MCP ownership.
