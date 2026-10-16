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
| M-4 | **Music streams on phones.** `js/audio/soundtrack.js` decodes every track to PCM with `decodeAudioData` (its own comment: ~90 MB per four-minute track at 48 kHz; menu.mp3 is 3.9 MB compressed, ~195 s → 75 MB decoded). A phone keeps the playing track, desktop two. Play through `new Audio(url)` → `createMediaElementSource` → `musicGain` on `isMobile`, keep the decode path on desktop | **~75–90 MB** on every phone that plays music — the largest single item found, and invisible to a JS-heap census (AudioBuffer PCM is external memory) | iOS media-element behaviour (interruptions, silent switch, resume offset moves to `currentTime`); needs a real iPhone check — no CI runner has one |
| M-4a | **Song-change spike, first.** The old buffer is evicted only after the next decode resolves (`soundtrack.js:165-173`), and `musicResumeBuf` (~84-86) also holds it, so a phone peaks at old + new ≈ **150–170 MB** of PCM mid-race. On phones, drop `musicBuffers[old]` and `musicResumeBuf` before the fetch | removes the ~75 MB spike; a few lines | none — the resume offset only applies to the same buffer |
| M-4b | Streaming note for M-4: `sw.js` caches whole 200 responses, and Safari media needs 206 Range responses — add Range support for `assets/music/` or let those requests bypass the service worker. No-SW fallback: decode through an `OfflineAudioContext` at 22.05 kHz mono (~17 MB, −78 %) | — | the service-worker change is the real work |
| M-5 | Voice packs: the whole `.bin` stays fetched and the decoded cache holds 80 clips per voice with no byte cap (`js/audio/voice-pack.js:40,119-157`). Cap by seconds (≈30 s on phones); later Range-fetch clips by the json offsets | fable 6.3 MB retained + up to ~30 MB decoded per voice | low |
| M-5a | Engine sample: 30.3 s decoded (`engine.js:363-368`) = **11.6 MB**, of which only the ~2 s loop window (~0.8 MB) is ever played (`engine.js:627/716/881`). Run the loop detection on the full buffer as now, then copy just the window into a new AudioBuffer | ~10.8 MB, every device | low; debug `loop` offsets shift to 0 |
| M-5b | Garage kept through the race: `dressCanvas` 1024² (4.2 MB CPU + 5.6 MB GPU), `liveCanvas` (~2.5 MB), 6 preview cars (~3.7 MB, double on TLX) have no release (`garage/scene.js:1146-1672`); plus the mobile livery scratch canvas 1024×1280 (5.2 MB, `liverytex.js:1696-1706`). Add `GarageScene.release()` after the drive-out hand-off; zero the scratch canvas at race start | **~21 MB** during every race | a repaint when returning to the garage; must run after the drive-out hand-off (8e2444a20) |
| M-6 | Props build peak: the Float64 accumulators start at 8192 verts and double (`build-props.js:230-232`, `models.js:21-63`); pass a per-circuit vertex estimate to `TrackModels.scratch(est)` | Vegas holds 129.7 MB of buffers for 73.8 MB of data at the build peak (PERF §2w) — the jetsam moment | low: an under-estimate still grows; keep Float64 (graph parity) |
| M-7 | TLX SSR-tag MRT attachment is full-res RGBA16F even when SSR is shed (`tlx-post.js:166-182`); make it RGBA8 (or R8) | phone 5.9 MB + 5.9 MB/frame bandwidth; desktop WebGL2 4× MSAA 66 MB @1080p | pipeline formats change: gfx-probe both TLX legs + census A/B; warm and live MRT must match |
| M-8 | Shadow targets carry an unused RGBA8 colour attachment (`tlx-shadow.js:97-142`); use R8 | phone 3.1 MB, desktop ~17 MB | low; census check |
| M-9 | After two crash strikes the governor floors at tier 4 but TLX's boot sizes never shrink (`tlx.js:922` `DPR_CAP`); read the strike count at create and cap dpr at 1 | scene + ldr + canvas 23.7 → 10.5 MB on a phone that already crashed twice | low: only affects devices that crashed |
| M-10 | Livery and pit-sign atlas sizes key on `mobileTier`, so a phone on ULTRA gets desktop atlases (`car/liverytex.js:19,44-47`; `pit-signs.js:151`); key AI atlases on `isMobile` as the shadows already do | liveries 11 → 44 MB avoided (+33 MB) on a phone set to ULTRA | low |
| M-11 | Smaller TLX items: lazy post blocks never freed after a shed (6.4 MB on a tier-4 phone, `tlx-post.js:199-225`); material `DataArrayTexture` keeps its CPU data (2.2 MB phone / 8.9 MB desktop, `tlx.js:3088-3101`); PCSS blocker built on WebGPU phones (`tlx-shadow.js:156`) | ~9 MB phone | low each |
| M-12 | Instanced-mesh padding to 1025 instances on lit **and** caster meshes (`tlx-shadow.js:18-35,297`; `tlx.js:1591`), ~288 KB per batch | 14–29 MB if 50–100 batches — **measure `propBatches.length` first** (I-1) | the pad was a measured compile win (§2ae); phones may skip only the caster pad |

Boot cost for reference (GPU/load audit): ~8.1 MB raw / 2.8 MB gzip of script
parsed at boot on the default backend (301 deferred scripts, `game.js` 564 KB,
three.js 1.1 MB); ~430 KB of it (`js/career`, `audio/spotify.js`, `js/xr`,
debris) could move to a lazy roster. Phones already skip scene MSAA, context
antialias, car and lamp shadow maps, and use a 1024² sun map and a 128 material
pack.

Lever recorded, not proposed: defaulting phones to GLX (`apex26.tlxMobile=0`)
measured 97 → 48 MB of JS heap (PERF §2r), because TLX keeps a CPU copy of
every geometry buffer and its release paths are shut on phones after four
failed attempts. That is a product decision (look, features), so it is listed
for the user, not scheduled.

## 4b. Phase II, CPU — per-frame garbage and repeated work (22-car race)

From the hot-path audit, excluding everything #779, #810 and PERF §2/§3
already cover. Counts are from operation counts, not measured (PERF §1): each
slice proves itself with an allocations-per-frame count from
`tools/shot/profile-gameloop.mjs <track> physics` (valid here) or the CDP
allocation sampler in I-1, never a frame time. The live-race reading above
(~0.4 MB/s of garbage, GC 1.6 %) is the baseline to beat. Note: tyre wear is
ON by default (`game.js:197`), so its step runs in every normal Grand Prix.

| # | Site | Per frame / step | Fix | Risk |
|---|---|---|---|---|
| C-1 | Cosmetic cache keys rebuilt per car per frame: `car-mesh.js:313-350` `getCarDecalMesh` (aeroStyleOf + map/join key), `:595` `getAeroFlap` (toFixed + joins per flap), `:441` `getCompoundRing` (per wheel), `car3d.js:498` one-entry cache missing every car, `car-draw.js:204` | ~600–900 allocations, ~25–40 KB per frame in a pack | memoise the key/hit on objects that do not change (`teamDecalState`, `WeakMap` colour → key); keep the string caches as backing store | `car-presentation-canary`, `parts-mesh-cache.spec` pin the counts |
| C-2 | Tyre step: `tyre-model.js:768-810` returns fresh arrays/objects per car per step; `pit-lane.js:1697` runs `RaceControl.flagOut(G.cars)` per AI (O(n²), ~460 iterations/step); `:1725` 16-field literal | 22 × 60 Hz, ~7k objects/s | out-params / scratch; `flagOut` once per `update()` after `checkRetirements` | out-param aliasing in `stepTemp` |
| C-3 | Cockpit rig keys on the default camera: `car-mesh.js:925-934, 1297-1299, 1545-1567`, `car-draw.js:478` (~90 allocations/frame; the fresh opts literal also defeats TLX's `matKeyFor` memo) | every frame | early return on `liv`/style identity; hoist the opts literal | keep the free-and-rebuild branch on a real key change |
| C-4 | HUD: `hud.js:873` writes the rev-bar width every frame inside a flex parent (layout + gradient repaint); `hud.js:887,122` build ~13-part key strings above the 10 Hz gate | every frame, main-thread layout | `contain: strict` on `#hud-tach`; skip while the cockpit cam hides it; move the vis/cam sync under the 10 Hz gate | `hud-layout.spec` |
| C-5 | `game.js:4517-4520` AiBand builds a literal and return object per AI per step; `factor()` returns 0 in the default "scripted" mode | ~2.5k objects/s for nothing | guard on `AiBand.mode() === "catchup"` | none (exact) |
| C-6 | `car-draw.js:36-44` `putBoundedMesh`: indexOf + splice + push on cache hits (~40–90/frame) | linear scans + small arrays | frame stamps or `Map` delete+set | canary pins "a hit promotes" |
| C-7 | `collide.js:146-161` `sweepContacts`: all 231 pairs do WeakMap gets + owns() + hypot before the arc reject | 60 Hz, O(n²) | eligible list once per step; cheap arc check first (pure filters, same result) | none |
| C-8 | `engineer.js:183-300` `senseOf` (30-field object, O(n), pits.estimate) and `race-facts.js:127,336-351` `observe` allocate per step | 60 Hz, ~100 KB/s | 4–10 Hz clock for `senseOf`; reuse `f`/`ev` | edges are latched, check unit tests |
| C-9 | `mirror-pass.js:56,222-241,444`: re-measure every 30 FRAMES (against the clock rule, PERF §2n); unconditional body style + class writes | 2–4×/s, page-wide style invalidation | 500 ms clock; compare before writing | low |
| C-10 | Smaller: cull order in `game.js:7414-7456` (behind-camera test after 3 track samples; check `c.xVis` readers first), `feel.js:256-283`, `director.js:147`, `marshal-panels.js:78-93`, `extra-rigs.js:34-45`, `tlx.js:4017,4124-4202`, `glx.js:2349` | tens of allocations/frame | hoist, cache, compare-before-write | low each |

## 5. Phase III — needs the real GPU before it can ship

- Turning any default-off release path on for players (the TLX static mirror
  sweep, M-2 beyond car casters) ships only after an I-3 census A/B shows
  `gpuErrors=0`, an unchanged `meanLuma`, and the memory delta on macos-latest.
- Tier knobs that change GPU allocations (shadow map sizes, post targets, dpr)
  are judged by census counts and `gms`, never by fps (§2w).

## 6. Order of work

1. I-1 and I-2 together (one PR): the harness and the gate that keeps #773's
   win. I-1 also reports external memory it can see (decoded AudioBuffer
   seconds × rate × channels × 4), so M-4/M-5 have a number in CI.
2. M-4a first (a few lines, removes the ~75 MB song-change spike), then M-4
   (music streaming on phones) — the biggest win; ships behind
   `isMobile` with the decode path kept for desktop, and needs one real-iPhone
   check before it is called done.
3. M-5a, M-5b, M-1, M-3a, M-5, M-6, M-9, M-10 (small, local, each measurable
   with I-1).
4. I-3 + I-5 (one PR): memory visible on real hardware and on players' devices.
5. M-7, M-8, M-11, M-12 (TLX render-target formats and padding), each with a
   gfx-probe run on both TLX legs and a census A/B — they change GPU formats.
6. M-2, M-3b one at a time, each with an I-1 table and, for M-2, a census A/B.
7. C-5, C-7 (exact, zero-risk) together; then C-1, C-2, C-3 one PR each with
   an allocations-per-frame count; C-4, C-6, C-8, C-9, C-10 as one batch PR
   (merge pacing).
8. Phase III items only on census evidence.

## Not in scope

Frame-rate tuning from this container; anything #773, #779 or #810 already
changed; the `ui-resize` flake (owned elsewhere, see who-is-on-it).
