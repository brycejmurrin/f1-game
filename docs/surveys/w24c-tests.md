# W24c survey — test coverage for perf / memory profiling

Report-only. **No code or new tests in this PR.** Tip surveyed:
`82e4ad4b3` (`claude/f1-game-project-26h3ng`).

Path note: under `docs/surveys/` with the other Fleet D W24*/W25* surveys
(the `docs/README.md` `surveys/` row is on the deploy branch).

fleet: D · orchestrator: D · session: `cursor:bc-48c7fcc7-34db-5939-8fbf-6f437ae36f78`

Bryce (5:54 PM PT) asked for ways to improve logging, tiles, **tests**, and
Device Farm test types so profiling is better. This file is the **tests** lane:
concrete new or extended tests ranked by impact on catching phone memory /
frame-time regressions earlier.

Inventory: generated [`docs/TESTING-COVERAGE.md`](../TESTING-COVERAGE.md).
Prior art (do not re-propose as missing): I-1/I-2 mem-census +
`track-switch-memory`; race-cycle `aliveTracks` gate; M-4 / M-4a soundtrack
stream + song-change unit pins (`tests/unit/audio-sample-upgrade.test.mjs`);
M-1 / M-3a / M-5a / `GarageScene.release` unit coverage; PERF-KNOWN-WINS
“Already landed or stale”. Never gate on SwiftShader fps
([`PERF-FINDINGS`](../notes/PERF-FINDINGS.md) §0). Fail on **growth**, not a
fixed ~300 MB kill number
([`MEMORY-TOOLING-RESEARCH-2026-10-21`](../notes/MEMORY-TOOLING-RESEARCH-2026-10-21.md)).

| Instrument | This pass |
|---|---|
| Spec / unit inventory vs `TESTING-COVERAGE.md` | **Yes** |
| Open research ideas vs landed gates | **Yes** — MEMORY-TOOLING, perf-memory plan, PERF-KNOWN-WINS |
| Re-run of browser memory groups | **No** (docs-only; cite existing specs) |
| Device Farm jobs | **No** (propose only; no spend) |

Fleet path key: **A** = `governor.js`, TLX chunk/LOD/mirror, race, physics,
`game.js`, `index.html`. **D** = other perf, iOS, tools, UI, save, tests that
do not require those A paths.

---

## Ranked findings (impact first, max 10)

### 1. Race-cycle heap slope is logged, never gated — phone growth returns green

**Problem:** Cross-race JS growth can return without failing CI; the gate is only
`aliveTracks` identity.

**Evidence:** `tests/specs/race-cycle-memory.spec.js:17–18` (TLX
`renderer.info` logged not asserted); `:73–79` write `heapMB` with no slope
expect. Open ask in
`docs/notes/MEMORY-TOOLING-RESEARCH-2026-10-21.md:72` — “Heap-slope nightly …
cycle-3 minus cycle-2 post-GC heap under 2 MB.”

**Proposed change:** Extend `race-cycle-memory.spec.js`: after forced GC at
menu, assert `heap[cycle3] − heap[cycle2] ≤ 2` MiB (post-warm) on the phone
viewport (844×390 touch); keep identity asserts. Prefer a nightly / soft flag
first if SwiftShader noise is high.

**Size:** M · **Fleet:** D (`tests/specs/`, optional `tests/data/` baseline)

---

### 2. Decoded audio PCM (`audioMB`) never asserted in browser memory specs

**Problem:** Largest phone-resident music cost is invisible to
`usedJSHeapSize`, and no memory **spec** fails when `audioMB` climbs.

**Evidence:** `tools/lib/mem-census.mjs:17–19` documents `audioMB` as external
PCM; `:102` returns it. `race-cycle-memory` / `track-switch-memory` assert
tracks/heap, not `audioMB`. The only `audioMB` mention under `tests/` is a
fixture blob in `tests/unit/diagnostics-tools.test.mjs:49`. Plan M-4
(`docs/plans/2026-10-03-perf-memory.md`) ~75–90 MB.

**Proposed change:** In `track-switch-memory.spec.js` (or a new
`tests/specs/<new>-audio-session-memory.spec.js`): after menu→race with music
on, assert `census.audioMB` under a measured ceiling and that a song change
does not leave two full PCM buffers (`audioBuffers` ≤ 1 on the phone stream
path). Unit pins for M-4 / M-4a already exist — this is the **browser census**
twin.

**Size:** M · **Fleet:** D

---

### 3. `renderer.info.memory` has no post-warm menu ceiling

**Problem:** GPU-side retainers can climb across races while identity counts
stay green; cycle-on-cycle at 3 cycles was correctly rejected as flaky.

**Evidence:** `tests/specs/race-cycle-memory.spec.js:91–94` refuses
cycle-on-cycle geometry/texture asserts (caches fill ~five cycles then
flatten). MEMORY-TOOLING idea #4 (`:73–74`) — “`renderer.info.memory` back to
its menu baseline after each teardown”.

**Proposed change:** Nightly (or `APEX_PERF_MEMORY_STRICT=1`) twin: after ≥5
warm race→menu cycles, menu `geometries`/`textures` ≤ first-warmed menu +
measured margin (not a 3-cycle delta). Log path already writes
`artifacts/logs/race-cycle-memory.json`.

**Size:** M · **Fleet:** D (tests); **A** only if TLX `memState` / dispose
paths must change to pass

---

### 4. `perf-frametime` stays soft and off the Pages gate

**Problem:** Frame-time / heap regressions against the committed baseline cannot
block ship, so the profiling signal stays advisory.

**Evidence:** `docs/TESTING.md:452` — soft by default
(`APEX_PERF_FRAMETIME_STRICT=1`), continue-on-error, off the Pages verdict.
`tests/specs/perf-frametime.spec.js:2–4`, `:212` only fails when `STRICT`.

**Proposed change:** Wire `test:perf-frametime` as a **non-Pages** required
check on `run-ci` / nightly with `APEX_PERF_FRAMETIME_STRICT=1`, or add a CI
job that uploads the artifact and fails only on annotated large deltas. Do not
put it on the Pages train.

**Size:** S · **Fleet:** D (`.github/workflows/`, `tests/`)

---

### 5. `perf-race-entry` has stage tables but no stage-duration baseline

**Problem:** Entry regressions are only a soft wallMs check; stage spans are
for manual diffs, so a slow `loadTrack` / `warmCarAssets` / flyby can ship
unnoticed.

**Evidence:** `tests/specs/perf-race-entry.spec.js:108–114` — wall check only
when `STRICT`; otherwise annotation. Writes `artifacts/perf-race-entry/*.json`
(`docs/TESTING.md:454`). Unit `perf-race-entry.test.mjs` formats tables only.

**Proposed change:** Add `tests/data/<new>-perf-race-entry-baseline.json` and
compare key stages (`loadTrack`, `warmCarAssets`, flyby) like frametime;
extend `perf-race-entry.spec.js` + `.test.mjs`. Soft by default, strict via
env.

**Size:** M · **Fleet:** D (tools/tests); **A** if `game.js` / race-entry
marks must change

---

### 6. Governor 0.1 scale steps can park a phone on a 30 Hz floor with no “could still do 60” regression

**Problem:** Profiling shows futile scale; unit tests pin today’s 0.1 behaviour,
not a vsync-crossing step policy that would leave the 33.3 ms floor.

**Evidence:** `docs/notes/PERF-KNOWN-WINS-2026-10-23.md` row 6;
`js/perf/governor.js:859` and `:1012` — `setRenderScale(cur - 0.1)`.

**Proposed change:** Extend `tests/unit/perf-governor.test.mjs`: synthetic fill
where scale 0.7 would clear a 16.7 ms budget but 0.9 would not; assert the
governor takes a step large enough to leave the 33.3 ms floor (or documents
`scaleFutile` only after a quantum-crossing attempt). Implementation stays A;
this finding is the **test** that unblocks measuring the win.

**Size:** M · **Fleet:** A (`js/perf/governor.js` + its unit test)

---

### 7. TLX CPU geometry release / mirror sweep has no phone memory soak gate

**Problem:** Known ~40+ MiB TLX-vs-GLX gap ships with release triple-gated off
and no CI that fails when re-enabled regresses.

**Evidence:** PERF-KNOWN-WINS row 9 (`tlx.js` mirror sweep / #1647);
`apex26.tlxMirrorSweep` listed in `tests/unit/gfx-backend-canary.test.mjs` /
store registry. `track-switch-release.spec.js` WeakRef pattern exists but not
under the sweep flag on a phone viewport soak.

**Proposed change:** Extend `track-switch-memory` or add
`tests/specs/<new>-tlx-mirror-sweep-memory.spec.js` with
`apex26.tlxMirrorSweep=1`: assert `aliveTracks` + heap median growth still
≤ 10 MiB and sticky geo WeakRefs drop (reuse `track-switch-release`).

**Size:** L · **Fleet:** A (TLX chunk/mirror) + D for the spec harness

---

### 8. Garage→race session heap is not tied to pick-cost / churn counters

**Problem:** `garage-pick-cost` / `garage-livery-churn` gate paint/atlas /
sticky-geo churn, not retained heap after drive-out; plan M-5b (~21 MB garage
retained in race) needs a browser census after release landed in unit form.

**Evidence:** `tests/specs/garage-pick-cost.spec.js:15`, `:90–97` ceilings on
`cardPaints` / builds / atlases / reuploads. `garage-livery-churn` asserts GPU
tex/flap sticky geo. Plan M-5b in `docs/plans/2026-10-03-perf-memory.md:101`.
`GarageScene.release` is unit-covered; no browser post-race `census.three` /
heap delta vs no-garage baseline.

**Proposed change:** Extend the garage segment of `race-cycle-memory.spec.js`
(or add `tests/specs/<new>-garage-race-handoff-memory.spec.js`): after
GARAGE→BACK→race, assert heap / `three` delta vs a no-garage control cycle.

**Size:** M · **Fleet:** D (UI/garage tests)

---

### 9. `race-retain-vm` still omits garage open/close (every-commit twin gap)

**Problem:** The cheap every-commit retain twin cannot catch garage retainers;
comment defers to the slow browser spec.

**Evidence:** `tests/unit/race-retain-vm.test.mjs:96–97` — “A garage visit
between races is covered by … race-cycle-memory … VM harness does not carry.”
MEMORY-TOOLING idea #2 (`:70–71`).

**Proposed change:** Extend `race-retain-vm.test.mjs` with a stubbed garage
open/close that holds a WeakRef to preview meshes / dress canvas and asserts
collect after race start.

**Size:** S · **Fleet:** D

---

### 10. WebKit / iOS proxy samples heap but never asserts growth; soak schema lacks `audioMB`

**Problem:** Jetsam-facing growth is measured by hand ledgers; the WebKit leg
and AUTO SOAK record samples without a growth or audio ceiling.

**Evidence:** `docs/TESTING.md:457` — `webkit` group is `webkit-boot.spec.js`
only. `tests/specs/webkit-boot.spec.js:108`, `:156–172` — two-cycle heap
**sample** for the workflow summary, no slope expect. `soak-run.spec.js` /
phone-recorder schema carry tier/spans without an `audioMB` field gate.
Device Farm ledgers stay manual (W24d proposes job types; this finding is the
**CI proxy** assert).

**Proposed change:** Extend `webkit-boot.spec.js`: two race cycles, assert menu
post-GC heap delta under a soft ceiling (annotation by default, strict via
env). Optionally add `audioMB` to soak JSON schema with a soft ceiling
annotation. No Device Farm spend in this proposal.

**Size:** L · **Fleet:** D (iOS / WebKit / soak tools)

---

## Not proposed (already covered or rejected)

| Item | Why skipped |
|---|---|
| Race-cycle `aliveTracks` identity gate | Landed; MEMORY-TOOLING “The gate, measured” |
| Track-switch heap median ≤ 10 MiB | Landed in `track-switch-memory.spec.js` |
| M-4 stream / M-4a song-change unit pins | `audio-sample-upgrade.test.mjs` |
| Cycle-on-cycle `renderer.info` at 3 cycles | Explicitly flaky — finding 3 uses post-warm ceiling instead |
| fps / SwiftShader frame-rate gates | Forbidden as player evidence |
| Absolute ~300 MB kill threshold alone | Prefer growth gates |

---

## Suggested first three follow-up PRs

1. **D, S/M:** heap-slope soft assert on `race-cycle-memory` + `audioMB` assert
   on one memory spec (findings 1–2).
2. **D, S:** frametime / race-entry baseline wiring as non-Pages CI
   (findings 4–5).
3. **A, M:** governor vsync-crossing unit + (later) TLX mirror-sweep soak
   (findings 6–7).
