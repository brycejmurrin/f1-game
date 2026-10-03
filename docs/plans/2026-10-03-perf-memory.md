# Memory and performance — how we find the next wins, and the wins we already see

Status: **PLAN** (docs-only). Follows the track-switch leak fix (#773,
[`../notes/TRACK-SWITCH-LEAKS-2026-10-02.md`](../notes/TRACK-SWITCH-LEAKS-2026-10-02.md)),
field LOD (#810) and the race hot-path pass (#779). Ship branch:
`claude/f1-game-project-26h3ng`; one PR per slice, drafts until the gate
(AGENTS.md §The loop), at most two PRs on auto-merge at a time (AGENTS.md
§Concurrent PRs, merge pacing). A path written with `<new>` is a PROPOSED
file, as in the models plan.

The crash this protects against is the phone one: iOS Safari kills a tab that
crosses its memory ceiling with no error and no `webglcontextlost`, and the
only trace is `apex26.crashStrikes` (`js/perf/governor.js`) on the next boot.
So the plan weighs **resident memory on the low tier** above desktop frame
time, and it never trusts a frame-rate number from this container (§0 of
[`../notes/PERF-FINDINGS.md`](../notes/PERF-FINDINGS.md)).

## 1. What we measured on 2026-10-03 (tip 549d8d9f3, TLX, Monza, 22 cars)

Harness: a scratch Playwright script (to be committed as slice I-1) with
`--js-flags=--expose-gc`, heap read after three forced GCs, CDP CPU and
allocation sampling, heap snapshots diffed with the DevTools MCP tools.

| Reading | Value | What it says |
|---|---|---|
| JS heap after GC, race +25 s … +115 s | 159 → 161 MB, flat | **No in-race leak.** The earlier +8 MB was warm-up settling. |
| Garbage rate, no forced GC, 20 s window | ~0.4 MB/s at ~60 presents/s | ~7 KB per frame; GC is 1.6 % of sampled CPU. Not the bottleneck. |
| JS CPU self time (20 s) | `update` 1.9 %, `updateCar` 1.7 %, `render` 0.6 % | Render-path JS is invisible here (§0 lie 1); physics JS is small. |
| Track object retained | 17.3 MB | `roadGeo` 4.8, `terrainGeo` 2.1, `track.graph` 3.2 (agent surface only — players do not retain it), water 0.8, glass 0.8, `_terrGrid` 0.8 |
| Car shadow-caster CPU copies (`car-draw.js` `teamMeshes`) | 9.1 MB | three keeps every attribute array after upload |
| `BAY_CACHE` (`js/track/scenery/pits.js`) | 8.0 MB | 12 garage-bay meshes as plain-JS number arrays, kept for the session |
| three render objects | 136–415 live | pruned by the 20 s pool sweep since #773 — not growing |

Track switching (the reported crash) is fixed and measured flat after the first
round: see the leak note. GLX race-to-race switching showed identical live GL
object counts per circuit.

## 2. Instruments — which question, which tool, valid where

| Question | Instrument | Valid here? | Gap this plan closes |
|---|---|---|---|
| Does memory grow across track loads? | scratch leak harness (picker path, `WeakRef` census of built tracks) | **Yes** — heap counts are exact | **I-1**: commit it as `tools/<new>/mem-census.mjs`; **I-2**: a spec that fails on growth |
| What holds the heap? | CDP heap snapshot + DevTools MCP `compare_heapsnapshots` / `get_heapsnapshot_retaining_paths` | **Yes** | I-1 writes the snapshots to `artifacts/perf/` |
| Physics/AI CPU | `tools/shot/profile-gameloop.mjs <track> physics` | **Yes** | — |
| Render-path JS CPU | profile-gameloop `render` | **No** (99.9 % idle) | **I-4**: real-GPU census CPU profile |
| Does the renderer keep building after warm-up? | `tools/gfx/frame-hitch.mjs` | **Yes** (exact counts) | — |
| GPU frame time / fill | `__apex.gpuTimer()`, census `gms` | **Only on real hardware** (`gpu-census.yml`, macos-latest) | — |
| Frame rate moved? | census `fps` | **No — ±54 % run to run** (§2w) | read `gms` and counts, never fps |
| Look changed? | census `meanLuma` | **Yes** (stable) | — |
| Memory on the player's GPU/browser | nothing today | — | **I-3**: census reports heap + three memory; **I-5**: `?gfxdebug=1` overlay prints a memory line players can paste |

## 3. Phase I — build the missing instruments first (small PRs, tools/tests only)

Each is a tooling PR: `test:tooling-fast` plus one browser spec, no `js/`
change except I-5.

- **I-1 `tools/<new>/mem-census.mjs`.** The scratch harness, made a CLI:
  `--backend three|webgl2`, `--mode picker|race|menu-cycle`, `--tracks a,b,c`,
  `--cycles N`, `--snapshot`. Prints one JSON row per step (heap after GC,
  three `info.memory`, live render objects, `WeakRef` count of built tracks,
  typed-array totals) and writes heap snapshots. Uses `--expose-gc`; never a
  frame-rate number. Proof: reproduces the before/after table of the leak note
  when pointed at `5ed4c66d9` and at the tip.
- **I-2 `tests/specs/<new>-track-switch-memory.spec.js`** (group `gfx`). Picker path
  on TLX, monza → monaco → monza → monaco; asserts (a) exactly one built track
  is reachable (`WeakRef` census) after each pick, and (b) cycle-2 heap ≤
  cycle-1 heap + a margin measured from five runs (do not guess it; record the
  five numbers in the spec comment). The `WeakRef` assertion is exact and is the
  primary gate; the heap one catches CPU-side caches that outlive a track.
- **I-3 census memory beats.** `tools/gfx/gpu-game-check.mjs` adds, per leg:
  `performance.memory.usedJSHeapSize` (Chrome), three `info.memory`
  (geometries, textures, uniform buffers), `memState().rObj`, and a
  track-switch leg (build A, build B, build A; report heap and counts after
  each). Read on macos-latest (Metal) where TLX takes the WebGPU path that a
  phone also takes — the software legs cannot exercise it.
- **I-4 census CPU profile.** One leg records a 10 s CDP CPU profile during the
  race on the real GPU and reports the top self-time functions. This is the
  only honest view of render-path JS (submission cost), which this container
  cannot show.
- **I-5 `?gfxdebug=1` memory line** (`js/perf/gfx-debug-overlay.js`): heap (where
  the browser exposes it), render objects, geometries, textures, tier,
  `crashStrikes`. A player who hits the crash can paste the line before the
  kill; today the overlay carries no memory numbers at all.

## 4. Phase II — code changes we can already see (one PR each, measured with I-1)

Ranked by resident memory on a phone, then by risk. Every row's proof is an
I-1 before/after on the same command, and the slice's own unit test.

| # | Change | Expected win | Risk / gate |
|---|---|---|---|
| M-1 | `BAY_CACHE`: store each bay as typed arrays (f32 pos/nrm, u8 col/mat, u16/u32 idx) instead of plain-JS number arrays, and clear it in `dropTrackWorld` on the low tier | ~8 MB → ~2 MB resident; 0 on a phone between builds | the bay merges into `propsGeo`; check the emitter accepts typed input (sweeps) |
| M-2 | Car shadow-caster meshes: release the CPU attribute arrays after first upload (three `onUploadCallback` / the TLX mirror-release path for `:sh` keys only) | up to ~9 MB | the mirror sweep is OFF for players after a handset lost its road (`tlx.js` ~4330); scope to car casters, verify on census before default-on |
| M-3a | `track.propsGeo` / `glassGeo` / `waterGeo`: only `__apex.trackGeometry()` (`js/agent/apex.js:863-866`) reads them after upload. Null them when `retainGraph` is false, exactly as `track.graph` already is (`tracks.js`, players' builds) | ~2 MB on Monza (props 0.3 + glass 0.75 + water 0.76), more on dense circuits | none on players; the dev surface keeps them |
| M-3b | `track.roadGeo` / `terrainGeo` (6.9 MB on Monza): readers are the lazy quality-recovery chunked rebuild (`game.js` ~6387/6433), the shadow pass (`shadow-pass.js:297-298`) and the debris trimesh (`debris-world.js:366`). Keep positions+indices; drop `nrm`/`col`/`mat` once both chunked copies exist or the tier rules them out | ~3 MB | three readers — each needs a unit test that it works from positions only |
| M-4 | *(audit results — filled in below when the three audits report)* | | |

## 5. Phase III — needs the real GPU before it can ship

- Turning any default-off release path on for players (the TLX static mirror
  sweep, M-2 beyond car casters) ships only after an I-3 census A/B shows
  `gpuErrors=0`, an unchanged `meanLuma`, and the memory delta on macos-latest.
- Tier knobs that change GPU allocations (shadow map sizes, post targets, dpr)
  are judged by census counts and `gms`, never by fps (§2w).

## 6. Order of work

1. I-1 and I-2 together (one PR): the harness and the gate that keeps #773's
   win.
2. M-1 (smallest, local, measurable with I-1).
3. I-3 + I-5 (one PR): memory visible on real hardware and on players' devices.
4. M-2, M-3 one at a time, each with an I-1 table and, for M-2, a census A/B.
5. Phase III items only on census evidence.

## Not in scope

Frame-rate tuning from this container; anything #773, #779 or #810 already
changed; the `ui-resize` flake (owned elsewhere, see who-is-on-it).
