# Load-time and download weight — plan (2026-09-30)

Status: **PLAN** — docs-only PR first; implementation as one small PR per
slice against `claude/f1-game-project-26h3ng`. Owner claim:
`load-download-weight` on the ship branch. Upscaling stays plan-only unless
slices 1–2 ship.

## Goal

Cut the race-entry main-thread freeze the player feels, and cut the service-
worker optional install pool, without touching physics, circuit geometry, or
the shared files other parallel workstreams own beyond the minimal hooks this
needs.

Measured baseline (real Apple/Metal, vegas, GLX — `docs/notes/PERF-OPTIONS-2026-09-16.md`):

| Window | Contiguous | Total blocking |
|---|---|---|
| Race entry (run 128/129) | **2193 ms** | **4856 ms** |
| Of which track build | ~1114 ms (**23 %**) | — |
| `startRace` wall (run 130) | — | ~1.0–1.3 s, almost all `loadTrack` |

So three quarters of the freeze is **outside** `loadTrack` / `startRace`. Run
130 attributed the gap to renderer **first frames**, not scenery fetch
(11–38 ms) or `makeCars` (2.7–4.7 ms). This workstream instruments that gap,
warms the real first-frame work under the loading handoff without shortening
the flyby before warm completes, then trims the SW optional precache.

## Current state (file / line evidence)

### Race-entry stopwatch — covers only `startRaceBody`

`js/game.js` `startRaceBody` (`~2870–2964`) records wall-time legs into
`_raceProfile`, exposed as `__apex.raceProfile()` (`js/agent/apex.js` →
`G.raceProfile` at `game.js:3643`):

| Lap | Covers |
|---|---|
| `scenery` | Body start → first lap (essentially empty — real `ensureScenery` is outside the body via `SessionEntry.begin`) |
| `resets` | Incident / race-control / debris / announce resets |
| `loadTrack` | Sync `loadTrack(trackIdx)` |
| `makeCars` | `makeCars()` |
| `settings` | `applyRaceSettings()` |
| `gridUp` | Quali gate + `gridUp` |
| `finish` | `wxArc` + `recomputePlayerMods` |

**Not in `raceProfile` today**, but on the same race-entry path:

- `gfx.warm()` at lights (`game.js:3008–3011`) — TLX only; GLX/WGX no-op
- `loadingScreen.handoff()` (`game.js:3017–3019`, `loading-screen.js:769–776`)
- `warmCarAssets()` / `DebrisWorld.prime()` after handoff (`~3045–3046`)
- First `present()` frames gated by `gfx.warming()` (`render` early-out
  `game.js:7081`; handoff lower only when not warming `game.js:8601–8603`)
- Menu-side warm already present: `warmPrograms` / `menuFinish` /
  `garagePrewarm` / `scheduleFlybyTrack` (`game.js:2601–2680`) and
  `introWarm` / `awaitIntroWarm` (`~4060–4084`)

Long-task attribution exists only in probe tools
(`tools/gfx/gpu-game-check.mjs` `PerformanceObserver` →
`out.raceEntry.blockMs` + `out.raceProfile`), **not** in the shipped game or
`__apex`. Soft-blit CI numbers are not evidence for this freeze
(`docs/notes/CI-RENDERING-PERFORMANCE.md`).

### Loading handoff vs flyby length

`LoadingScreen.handoff()` (`js/ui/loading-screen.js:769–776`) re-raises the
card after `startRace` so the HUD does not sit over an unpresented canvas
while TLX compiles. Flyby length is fixed at `run()`:

- Full `FLY_MS = 24000`, short `SHORT_FLY_MS = 12000` after `SKIP_STREAK = 3`
  (`loading-screen.js:30–55`)
- Shorten is skip-streak / reduced-motion / no-world only — **nothing polls
  `gfx.warming()` to hold full length until warm completes**
- Comment at `:571–572` assumes the build behind a skip is already warm;
  post-flyby compile is covered by handoff, not by extending the flyby

Prior related work already merged (do not redo): garage drive-out /
`loadTrackStepped` / build-worker prototype (default OFF) — PRs #473, #520,
#540 on `claude/race-loading-screen-timing-4jhqdd`. This workstream starts
where that left the **first-frame** gap.

### Service-worker optional pool

`sw.js` `precacheAssetLists()` (`:198–383`) builds essential from shell tags
and a large **optional** set stamped by `tools/gen/gen-shell.mjs` from
`tools/manifest.cjs` (`//@gen-shell:sw-optional` … `/@gen-shell:sw-optional`,
`sw.js:247–355`).

Install order today (`sw.js:441–485`):

1. Essential + **all GLX deferred** promoted to required (`isGlx`, `:449–450`)
2. `INSTALL_COMPLETE` marker
3. **Entire** remaining optional pool (concurrency 4), then `INSTALL_SETTLED`
4. `skipWaiting` **last** (deliberate — `:471–477`)

On-disk size of the optional seed (this tree, 2026-09-30):

| Group | Size | Files |
|---|---|---|
| All three deferred backends + three.js | ~2.75 MB | GLX 509 KB + WGX 563 KB + TLX 584 KB + three 1098 KB |
| 52 scenery closures | ~1.79 MB | avg ~34 KB |
| Optional minus Rapier | **~5.81 MB** | matches the historical ~5.4–5.8 MB install-pool note |
| Full optional set on disk | ~7.94 MB | includes Rapier 2.2 MB |

Tests that pin this contract:

- `tests/unit/service-worker.test.mjs` — optional miss soft; settled before
  `skipWaiting`; essential miss fails install
- `tests/unit/load-order.test.mjs` — every `DEFERRED` / stamped lazy path in
  the optional seed
- `tools/check/offline-precache-check.cjs` — live offline cold race with all
  52 scenery + `presets.js` expected in cache

Mid-session renderer switch (`loadBackendScripts` with `?v=<build>`) needs the
non-active backends cached eventually; offline boot without GLX is
"graphics unavailable" — GLX stays essential.

### Spatial upscaler (plan-only unless slices 1–2 done)

`docs/research/UPSCALING-2026-09.md` §6–7: SGSR1 already spiked across GLX /
WGX / TLX, flag OFF (`apex26.spatialUpscale`, Settings UPSCALE row in
`js/ui/scale.js`, `__apex.spatialUpscale`). Insertion is after FXAA at reduced
size; canvas stays present-size so the DOM HUD stays sharp. Remaining work is
real-GPU A/B and whether to default ON — **not** a greenfield port. This
workstream leaves that as a follow-up plan appendix unless 1–2 finish early.

## Design

### A. Attribute the freeze (instrumentation first)

Extend `__apex.raceProfile()` (or a sibling `__apex.raceEntryProfile()`) so a
real-device `gpu-game-check` / agent session can name every long task in the
race-entry window, not only `startRaceBody` legs:

1. **In-app longtask buffer** (opt-in or always-on ring, small):
   `PerformanceObserver({ type: "longtask", buffered: true })` from menu→race
   arm to N frames after handoff lowers — same shape as
   `tools/gfx/gpu-game-check.mjs:456–484`, but readable from `__apex` without
   the probe script.
2. **Named marks** around: `scheduleFlybyTrack` prepare, `loadTrack` /
   `loadTrackStepped`, `menuFinish` / `warmPrograms`, `garagePrewarm`,
   `startRaceBody` existing `rlap`s, `gfx.warm` request, first
   `present` while `warming()`, handoff raise/lower, `warmCarAssets`,
   `DebrisWorld.prime`.
3. **GLX / WGX attribution**: since they lack `warm()`/`warming()`, mark
   first N presents after handoff and any `KHR_parallel_shader_compile`
   completion path that already exists in GLX — do not invent a fake warm
   API until measurement says what to warm.

Measurement gate: macos-latest (or a real phone) via `gpu-game-check` /
census — **not** SwiftShader soft-blit. Soft numbers may be recorded for
regression only and must be labelled as such.

### B. Warm real first-frame work under handoff (after A names it)

Once A says what dominates (likely first present / mesh upload / TLX
`compileAsync` stages already in `tlx.js:2006–2075`):

1. Drive that work during `handoff` / late flyby frames **without**
   shortening `FLY_MS` before warm completes. Practical rule:
   - Habitual-skip short flyby only arms after `!gfx.warming()` (or the
     GLX/WGX equivalent readiness latch from A).
   - Skip still works; it must not drop into an unpresented grid — handoff
     already covers that; extend the readiness check so a skip mid-warm
     stays on the card until present is ready.
2. Prefer extracting any new orchestration into a small NEW module under
   `js/ui/` (proposed name `race-entry-warm`, not yet on disk — same
   convention as other plans' `js/<new>/…` paths) — `js/game.js` is at the
   ratchet with zero slack; equal extract if any lines must land there.
3. Do not convert the freeze into a longer spinner without A proving the
   warm actually moves work off the first visible race frame.

### C. Trim SW optional precache

Install-time pool becomes **chosen backend + current-circuit scenery (+
GLX always essential)**; the rest backgrounds after `skipWaiting`.

Proposed install shape:

1. Essential + GLX deferred (unchanged — already required).
2. **Also required at install** (small): the backend the shell/prefs will
   actually load this session (TLX default today, else WGX/GLX), plus the
   scenery closure for the last / default circuit if known — else defer
   scenery to first `ensureScenery` (fetch-miss already `cache.put`).
3. `INSTALL_COMPLETE` → **`skipWaiting` earlier** than today for the heavy
   optional tail (other backends, other 51 scenery files, vendor three/jsQR/
   trystero, data/net lazy bundles) — run that pool under `activate` /
   idle `fetch` / `clients.claim` aftermath, with `INSTALL_SETTLED` when
   done.
4. Preserve:
   - Offline boot on GLX when TLX/WGX missing
   - Mid-session renderer switch (background seed must still stamp
     `?v=<build>` keys `loadBackendScripts` requests)
   - `gen-shell` stamps from `manifest.cjs` (edit source, `npm run gen`)
   - Soft optional misses (never fail install)

Risk to design around: today's comment (`sw.js:471–477`) says early
`skipWaiting` can delete the previous generation's cache while optionals
are in flight. Mitigations: (a) keep prior generation until
`INSTALL_SETTLED`, or (b) only early-activate on first install / when the
new cache already holds the chosen-backend + GLX set, or (c) copy critical
keys from the old cache before deleting. Pick one with a unit test before
shipping.

Size win (order of magnitude, this tree): dropping the two unused backends
+ three.js until backgrounded saves ~2.2 MB at install wait; dropping 51
scenery files saves ~1.75 MB at install wait; combined with vendor lazy
bundles the install-critical optional drops from ~5.8 MB toward ~0.5–1 MB
depending on chosen backend.

## Ordered slices (independently shippable)

| # | Slice | Size | Ships |
|---|---|---|---|
| 0 | This plan doc | S | Docs-only PR |
| 1 | Race-entry attribution: longtask ring + marks + `__apex` read + unit/probe test; extend `raceProfile` (or sibling) past `finish` | S | Instrumentation only — no behaviour change except optional observer |
| 2 | Warm-under-handoff: hold full flyby / handoff card until readiness; warm the named first-frame work; behaviour test that fails before | M | UX: no early short-flyby into cold first frame |
| 3 | SW trim: chosen backend + current scenery at install; background rest after safe `skipWaiting`; update offline / load-order / SW unit tests | M | Smaller install wait; offline + switch preserved |
| 4 | Upscaler — **plan appendix only** unless 1–2 done: document remaining real-GPU A/B / default-ON decision against landed SGSR1 spike | S | Docs |

Each slice = its own draft PR → watch CI on exact head → undraft when full
tier green → **do not merge** (Bryce's merge worker).

## Tests and measurements per slice

### Slice 1 — attribution

- Unit: observer arms/disarms; marks appear in order for a scripted
  `startRace` on the game-vm / mini harness where `PerformanceObserver` is
  stubbed to emit synthetic longtasks.
- Probe: `tools/gfx/gpu-game-check.mjs` (or a thin sibling) prints
  `raceEntry.blockMs` **and** named mark deltas on macos-latest; paste
  before/after table into the PR.
- Must **not** assert soft-blit timings as the freeze budget.

### Slice 2 — warm under handoff

- Unit / browser: with a forced slow `gfx.warming()` (or stub), short-flyby
  path does not lower handoff / start countdown present until readiness;
  with warm already complete, duration unchanged.
- Regression: habitual skip still skips; reduced-motion card path unchanged.
- Measurement: same macos race-entry longtask total and contiguous max vs
  slice-1 baseline on vegas + one open circuit (spa).

### Slice 3 — SW trim

- Update `tests/unit/service-worker.test.mjs`: early `skipWaiting` only
  after the new "install-critical" set; background pool still settles;
  prior-generation safety chosen in Design C.
- Update `tests/unit/load-order.test.mjs` / gen stamps if the optional seed
  splits into install-critical vs background lists (source in
  `manifest.cjs`, then `npm run gen`).
- `tools/check/offline-precache-check.cjs`: offline cold race still boots;
  scenery for the raced circuit present (may be on-demand cached rather
  than install-seeded — assert the behaviour we choose, do not loosen).
- Measure: install-wait bytes / count before vs after (log from SW install
  or a check script); mid-session backend switch still resolves stamped URL
  from cache after background settle.

### Slice 4 — upscaler plan-only

- Docs appendix only; no flag default change without real-GPU A/B evidence.

## Risks

| Risk | Mitigation |
|---|---|
| Parallel agents on `js/game.js` / `sw.js` / loading-screen | Small PRs; extract new modules; claim paths; sync-pr only on conflict or tip red |
| `js/game.js` ratchet at zero slack | New code in new files; extract ≥ added lines if game.js must change |
| Early `skipWaiting` deletes prior cache mid-download | Design C safety + unit test before behaviour change |
| Warming that lengthens perceived load | Sell as "card until ready" only when A shows first-frame dominates; never widen timeouts/assertions |
| Soft-blit false confidence | Label CI numbers; gate claims on real-GPU / longtask |
| Overlap with merged loading-screen work (#540 etc.) | Do not re-split `Tracks.build`; target first-frame + SW only |

## What this workstream is NOT doing

- Physics, assists, AI, career, scenery geometry, or circuit accuracy
- Re-opening the build-worker / `buildSteps` yielding track (already
  prototyped OFF in #540) as a race-entry fix — PERF-OPTIONS §5 says it can
  only reach ~25 %
- Bottom-face cull (measured 0.27 %, reverted)
- Occlusion culling default-ON / batched rewrite (separate PERF-OPTIONS
  track)
- Defaulting SGSR1 ON or porting FSR2/temporal / frame gen
- Raising ratchets, quarantines, tolerances, or skipping tests
- Merging PRs (Bryce's worker)

## Final report checklist (fill as slices land)

- Plan PR + head SHA
- Slice PRs + head SHAs + draft/ready
- Shipped vs deferred
- Before/after: race-entry contiguous / total longtask ms (device, backend,
  circuit); SW install-critical MB and file count
