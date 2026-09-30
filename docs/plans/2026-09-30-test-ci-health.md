# Test and CI health — plan (2026-09-30)

Status: **PLAN** — docs-only PR first; each numbered slice lands as its own
small draft PR against `claude/f1-game-project-26h3ng`. Do not merge; Bryce's
merge worker merges one at a time. Owner: this workstream (claim via
`who-is-on-it.mjs --claim`).

## Goal

Make the change-aware gate honest and cheaper without dropping coverage:

1. Exit the `steering.spec.js` quarantine so `APEX_FAIL_ON_FLAKY=1` can fail a
   real flake again, after the deterministic `road-follow` failure is fixed and
   shared-page isolation no longer leaks assists between tests. Only then land
   the measured `480 s → 170 s` re-time that puts the file under the selected
   gate's 180 s per-test cap.
2. Close the `props-over-road.spec.js` push-blind hole (1500 s declaration →
   never selected) by sharding so each test fits the budget without shrinking
   the circuit set. Report (and fix only if clear) the nightly reds on monza,
   mosport and zandvoort.
3. Clear `twinDebt` (ceiling 7): adapt the seven portable specs that still burn
   browser minutes for `__apex`-only assertions, lowering the ratchet after
   each green `APEX_VM_PAGE=1` run. Never adapt without that run.
4. Convert the three largest UI `waitForTimeout` farms to condition waits and
   planner-skip the 49 unit files that run twice per PR, lowering the tree
   ratchets after each win.

Hard rules (copied from the brief, not optional): never disable/skip tests,
loosen assertions/tolerances/timeouts, raise ratchets/baselines, or grow
quarantine/suppression lists. Lowering a stale cap is fine. Every behaviour
change needs a test that would fail before the change. Stay off files other
workstreams clearly own beyond a minimal hook.

## Current state (file / line evidence)

### A. Steering quarantine + road-follow

| fact | where |
|---|---|
| Quarantine row still present | `tests/data/flaky-quarantine.json` lines 27–32 (`steering.spec.js` since 2026-09-22) |
| File budget still 480 s | `tests/specs/steering.spec.js:99` `test.describe.configure({ timeout: 480_000 })` |
| `road-follow` asserts `|on.x − off.x| > 0.25` | `tests/specs/steering.spec.js:161–194`; fails byte-identical at `0.15284059935810101` on bahrain (ledger §2026-09-22) |
| Shared-page reset is shallow | `tests/helpers/fixtures.js:424–448` — clears input / freeze / camera / dialogs; does **not** reset `roadFollow` / `raceLineAssist` / other `setPhysics` knobs |
| Authority test restore was wrong (0.7), now fixed to 0 | `tests/specs/steering.spec.js:270–271` `finally { freeze(false); setPhysics({ roadFollow: 0 }) }` — ledger records this cured the racing-line leak, not road-follow itself |
| Freeze during measurement landed | same block, comment cites train `36656970688` / ledger item 2 |
| Re-time held back | `docs/notes/DEFECT-LEDGER.md` ~2569–2575: CI llvmpipe slowest 26.2 s, local SwiftShader 139.9 s; 170 s is ready but must not select the file while road-follow is red |
| Probe that changes the `continue` changes which corners are sampled | ledger ~2521–2526 — instrument only by writing `frac`/`k`/`dxOff` for corners the test already checks |

### B. props-over-road push-blind + nightly reds

| fact | where |
|---|---|
| One test, all circuits, `setTimeout(1500000)` | `tests/specs/props-over-road.spec.js:84–91` |
| Selected gate caps at 180 s/test | `tools/ci/select-budget.mjs` `perTestTimeoutSec: 180`; docs/TESTING.md row for this spec |
| Node port is the blocking fleet audit | `tests/unit/props-over-road.test.mjs` (~90 s, 52 circuits); VM geometry ≠ browser (no asset pack) |
| TESTING.md still says nightly RED on monza / mosport / zandvoort | `docs/TESTING.md` ~1255 |
| Ledger history | monza baked building fixed 2026-09-22 (`DEFECT-LEDGER.md` ~158–209); mosport/zandvoort were pit-wall sampling (fixed 2026-09-23 to `track.hw` ladder) — if still red, cause may have moved (pack overhang vs baseline drift) |
| Sibling still unsharded | `tests/specs/terrain-over-road.spec.js:173` also declares 1500 s — **out of scope** unless a one-line mention is needed in the shard helper |

### C. twinDebt = 7

Measured on tip (`node -e '…twinDebt()'`):

```
tests/specs/albert-park-foundation.spec.js   (1 test, fixtures import)
tests/specs/autopilot.spec.js                (3)
tests/specs/cota-foundation.spec.js          (2)
tests/specs/imola-foundation.spec.js         (1)
tests/specs/pit-signs.spec.js                (1 — live painter/upload/draw)
tests/specs/qatar-foundation.spec.js         (1)
tests/specs/suzuka-foundation.spec.js        (1)
```

Ratchet: `tests/data/ratchets.json` `tree.twinDebt.ceiling: 7`, `slack: 0`.
Adaptation path: `ADAPTED` in `tools/ci/twinned-specs.mjs` + mutant in
`tests/data/mutants.json` + green `APEX_VM_PAGE=1 node --test <spec>` (see
`docs/TESTING.md` §vmPage). `understeer-cue` is the standing proof that
static portability ≠ fidelity — if a debt spec goes red under the adapter,
put it in `BROWSER_ONLY` with the reason (that is not raising twinDebt; it
moves the count down with an explicit hole). Existing `albert-park-foundation.test.mjs`
and `pit-signs.test.mjs` are **not** twins of these browser specs (source /
VM-build contracts); do not list them in `TWINNED`.

### D. waitForTimeout farms + double-run unit files

| fact | where |
|---|---|
| Tree ratchet `waitForTimeout: 149` | `tests/data/ratchets.json` |
| Top offenders | `ui-audit` 22, `menu-traversal` 15, `menu-keyboard` 13 (`tree-counts.mjs --offenders`) |
| 49 unit files run twice per PR | `docs/notes/CI-CAPACITY-2026-09-29.md` ~160–162 (tooling-fast under guards **and** a `vm-b` topical group) |
| Planner already scopes some node work | `tools/ci/node-plan.mjs` — extend so topical-group membership that is already covered by tooling-fast is skipped on PR without dropping deploy/nightly coverage |

## Design

### Shared principles

- One independently shippable slice per PR; draft until full CI green on the
  exact head SHA, then undraft. Never merge from this agent.
- Sync to ship only on conflict or tip-red required check (`sync-pr.mjs`).
- Prefer test-side / harness fixes over product physics changes for (1) unless
  measurement proves the assist is under-strength at the failing corner.
- Prefer sharding and planner skips over raising budgets or excluding coverage.
- After every ratchet win: `ratchets.mjs --update` only lowers; commit the
  lower ceiling in the same PR as the win.

### Isolation contract for steering (slice 1a)

Extend the shared-page per-test reset (or a steering-local `beforeEach` /
`finally` helper) so every test starts with:

- `roadFollow: 0`, `raceLineAssist: 0` (shipped defaults pinned by
  "by default nothing steers the car")
- `freeze(false)`, cleared input (already done)
- empty AI field when the test needs a solo line (`startLiveRace` already
  clears rivals)

Add a unit or spec assertion that a deliberate leak (`setPhysics({ roadFollow:
0.7 })` left uncleared) is restored by the reset — that is the test that would
have failed before the isolation fix (ledger's racing-line flake class).

### road-follow diagnosis (slice 1b)

Reproduce **without** removing the `continue`:

1. Give the test its own `test.setTimeout` if the file budget is still 480 s.
2. Log only `frac`, `k`, `dxOff`, `|on.x-off.x|` for corners that pass the
   `|k| >= 0.012` filter (write from inside the existing arms).
3. Name the failing corner; decide among: (a) floor too high for today's slip
   model at that speed/ticks, (b) assist gain 0.6 under-moves at that `k`,
   (c) shared `s` / tyre state from a prior sample in the same test.
4. Prefer a **relative** assertion that still fails when the assist is a no-op
   (e.g. `|on−off| > c · |dxOff|` with a mutant that forces `roadFollow` to 0
   on the "on" arm) over lowering `0.25` without evidence. Do not loosen the
   floor just to green the quarantine exit.
5. Delete the quarantine row in the **same** commit as the fix.
6. Re-time `480 → 170` only in a follow-up commit/PR after a green full-file
   run with the quarantine gone.

### props-over-road shard (slice 2)

Split the single all-circuit test into N tests (circuit shards), each with a
timeout that measuredCheap / the 180 s cap can accept. Options ranked:

1. **Preferred:** `test.describe` over shards of ~6–8 circuits (or
   `APEX_CIRCUIT_SHARD=i/n` like elevation-tracks-vm), one `test()` per shard,
   shared `BASELINE` / helpers unchanged. Coverage = union of shards = full
   roster. `TRACK=<id>` still runs one circuit.
2. Do **not** drop circuits from the browser audit; the node port remains the
   fast fleet gate and stays untouched except if a shared helper moves.

Nightly reds: reproduce with `TRACK=monza|mosport|zandvoort` against the
browser spec; if the cause is a clear scenery placement or stale BASELINE
entry owned by this audit, fix in a tiny follow-up PR; if it is circuit
scenery ownership, hand off with measurements (frac, colour, height, emitter).

### twinDebt (slice 3)

For each of the seven, in dependency order (foundations first — they are one
test each and already on fixtures):

1. `APEX_VM_PAGE=1 node --test tests/specs/<file>.spec.js` — must be green.
2. Add mutant that reddens a named assertion (`tests/data/mutants.json`).
3. Add `ADAPTED` entry with the measured reason string.
4. Lower `twinDebt.ceiling` by 1 in the same PR.
5. If red under the adapter for a structural reason, `BROWSER_ONLY` + reason
   and lower the ceiling the same way (debt is "unaccounted portable", not
   "must adapt").

`pit-signs.spec.js` is the riskiest (real painter/upload/draw); run it first
or last as a deliberate spike — if the VM cannot paint, `BROWSER_ONLY` it.

### waitForTimeout + planner-skip (slice 4)

1. Convert `ui-audit` / `menu-traversal` / `menu-keyboard` sleeps to
   `waitForFunction` / visibility / `__apex` condition waits with
   `{ polling: 100 }` (wait-polling-lint). Lower `waitForTimeout` after each
   file.
2. In `node-plan.mjs` (PR path only): skip unit files that tooling-fast already
   runs when the diff does not need their topical group for another reason —
   mirror the "49 run twice" note. Deploy push / Pages / nightly still run
   everything. Add a unit test that pins the skip set is a subset of
   tooling-fast ∩ topical groups (anti-vacuity: a file not in tooling-fast is
   never planner-skipped).

## Ordered slices (each independently shippable)

| # | slug / PR title | size | ships |
|---|---|---|---|
| 0 | `docs/plans/2026-09-30-test-ci-health.md` (this file) | S | plan only |
| 1a | steering shared-page isolation (reset assists + leak-detecting test) | S | isolation only; quarantine stays until 1b |
| 1b | road-follow diagnosis + fix; delete quarantine row | M | quarantine exit |
| 1c | steering `480 → 170` re-time | S | select-specs can bill the file; only after 1b green on CI |
| 2a | shard `props-over-road.spec.js` under the 180 s cap | M | push-blind hole closed |
| 2b | monza / mosport / zandvoort nightly findings (± fix if clear) | S–M | report or fix |
| 3.1…3.n | one ADAPTED (or BROWSER_ONLY) spec per PR; ceiling −1 | S each | twinDebt → 0 |
| 4a | convert ui-audit waitForTimeout farm; lower ratchet | S | |
| 4b | menu-traversal + menu-keyboard farms; lower ratchet | S | |
| 4c | planner-skip the 49 double-run unit files on PR; pin with a test | M | |

Slices 3.* can interleave with 4.* once 1c and 2a are landed or clearly
blocked; do not start 1c before 1b.

## Tests and measurements per slice

| slice | prove before | prove after |
|---|---|---|
| 1a | full `steering.spec.js` still has the road-follow red; racing-line passes | new isolation test fails if reset is removed; racing-line still green; no new quarantine |
| 1b | log names failing corner; mutant shows assist no-op fails | full file green locally + CI; quarantine row gone; `flaky-quarantine.test.mjs` green |
| 1c | file still declares 480 | declares 170; `select-budget` / measuredCheap admits it; oversize shard not required solely for budget |
| 2a | `select-specs` on a `js/track` touch lists props-over-road as excluded | each shard ≤ cap; union covers `auditTracks()`; TRACK= one circuit still works |
| 2b | nightly / TRACK= repro | finding note in PR body; fix only with before/after measure |
| 3.* | `twinDebt().length === N`; adapter red or unrun | adapter green (or BROWSER_ONLY); ceiling N−1; `twinned-specs` verify green |
| 4a–b | offender counts 22/15/13 | lower; specs still green (`ui` group or named specs) |
| 4c | 49 overlap on PR plan | plan JSON shows skip; deploy/nightly plan unchanged; unit pin |

Edit-loop: `npm run test:tooling-fast` (or `tooling-fast.mjs --jobs=3`). Browser:
one group or one spec via `test-bg.mjs` / `remote-group.mjs` per AGENTS.md.
Pre-push: `deploy.mjs --gate-only`.

## Risks

- **road-follow is a real assist under-move**, not a test bug — then the fix
  touches `js/input/steer-tuning.js` / physics and collides with tune-physics
  workstreams; keep the product change minimal and mutant-backed.
- **Re-timing while red** would block every `js/input/` push — never land 1c
  early.
- **Adapting a foundation that needs GLX fixtures** can redden the browser
  copy (2026-09-22 bahrain-foundation revert) — always re-run the browser
  copy in the same change when touching the import.
- **props shard helper shared with terrain-over-road** — avoid editing
  terrain's file in 2a; duplicate a tiny shard helper if needed.
- **Parallel agents** on scenery / UI / steering-authority-freeze — claim
  paths; stand down if a live claim owns the same files.

## What this workstream is NOT doing

- Merging PRs or enabling auto-merge.
- Raising ratchets, baselines, quarantine lists, or assertion tolerances.
- Growing `js/game.js` (no product feature work in this stream).
- Fixing `terrain-over-road`'s 1500 s declaration (sibling; optional later).
- Teaching `track-build-vm` to load the asset pack (ledger OPEN; separate).
- Adapting `understeer-cue` or other `BROWSER_ONLY` entries.
- CI account / merge-queue repository settings.
- Broad UI redesigns while converting waits (condition waits only).

## Final report checklist (end of workstream)

- PR links + head SHAs for plan + each slice
- Shipped vs deferred (with reason)
- Before/after: quarantine rows, steering timeout, twinDebt ceiling,
  waitForTimeout count, props-over-road select-specs inclusion, planner
  double-run count
