# Perf survey — particles, env probes, physics hot paths (2026-10-06)

Report-first, **no code changes**. Ship tip surveyed:
`a0b371e27` (`claude/f1-game-project-26h3ng`, `fix(zolder): clear S/F stand clip cluster`).

Pinned first: `docs/notes/PERF-FINDINGS.md` (stub at `docs/PERF-FINDINGS.md`).
Modules located from `index.html` script tags, then grepped by name.

Instruments (per PERF-FINDINGS §0):

| Question | Tool | This box |
|---|---|---|
| Physics/AI/CPU self-time | `node tools/shot/profile-gameloop.mjs vegas physics` | Yes (JS table after dropping `getError`) |
| Physics wall ms / counts | `apex-eval.mjs --vm` | Yes |
| Probe geometry submitted | `node tools/gfx/chunk-reach.cjs vegas 900,300` | Yes (counts transfer; ms do not) |
| GPU frame ms | `__apex.gpuTimer()` | **No** — returns `-1` under SwiftShader |
| Render JS | `profile-gameloop … render` | **No** — ~99.9% idle under software raster |

**Not run:** Playwright browser groups, `gpu-census.yml`, live Rapier debris
(VM `DebrisWorld.status().enabled === false`). GPU fill claims stay unverified.

---

## Ranked findings (act first)

Impact is relative remaining cost on a live 22-car race at GRAPHICS HIGH/ULTRA
(tier 0, probe on). ms/MB below are measured here unless marked *ledger*.

| # | Impact | Area | Finding | Measured |
|---|---|---|---|---|
| 1 | High | Env probe | One extra `drawWorldMeshes` + `drawSky` every 4th live frame (full cube / 24 frames); 300 m sphere still submits **312 k indices / cube** on vegas | cadence: code; geometry: chunk-reach 2026-10-06; heap: *12.8 MB TLX* ledger |
| 2 | High | Physics JS | `updateCar` is still the JS hotspot (**17.1%** of non-sync profile self-time). Per-AI traffic scan is wrap-aware **O(n) per car = O(n²) field** | profile 2026-10-06; VM **2.03 ms/tick** × 22 cars |
| 3 | High | GC | `(garbage collector)` **12.6%** of the same JS remainder — 3rd row after `update` / `updateCar`. Collision path is mostly allocation-free; leftover churn is elsewhere (tyres, radio/facts, DOM) | profile 2026-10-06 |
| 4 | Medium | Particles / GLX | Dirty-skip is defeated on a live race by **one-frame flares** (`_dirty = hadFlare`). GLX also uses **one shared VBO**, so even a clean skip re-uploads the second blend group | code + `drawParticles` needUpload |
| 5 | Medium | Particles / rain | Rain cell is **2 m**; at race speed the shower rebuilds every frame (~**86 KiB** CPU expand for 360 drops) | code; VM rain `rainActive: true`, emitters not on `step()` |
| 6 | Medium | Debris | Rapier side-world was **~16%** of physics CPU when live (*2026-08-13*). Furniture wake is **O(furn × cars)** every step (vegas `furnCount: 17`) | ledger + VM status |
| 7 | Low | Collide sweep | `sweepContacts` is still nested pairs with an arc pre-reject (**0.7%** JS self-time). Pair resolve is bucketed for n>12 (**1.3%** `resolveCollisions`) | profile 2026-10-06 |
| 8 | Low | Particles pool | SOA pool is **zero steady-state alloc** (ledger negative result still holds). Full-pool `oldest()` is an **O(MAX)** scan per spawn (MAX 256/96) | code; VM `cap: 256`, `pool: 0` on headless step |

---

## 1. Env probe — extra world pass, not the 64 px target

### What ships

Live race/count, governor **tier < 1**, `LT.carEnvCube > 0.001`, not paused /
debug cam / `apex26.envProbeOff`:

- One **64 px** cube face per **4th** frame (`_envMask = 3`); if render scale
  already dropped, every **8th** (`_envMask = 7`). Full cube **24** (or 48)
  frames. `park()` / frozen: one face per frame so tests latch in 6 presents.
- Each captured face calls `drawWorldMeshes` then `drawSky` (early-Z,
  world-then-sky). Main camera then draws the world **again**.
- Radial cull **300 m** (`ENV_CULL_M`) on GLX / TLX / WGX.

```7338:7382:js/game.js
  // ── Live env probe: render ONE 64px cubemap face of the world around the
  // player car every fourth frame on a live race (full refresh every 24 frames).
  const _envMask = (!frozen && gfx.getRenderScale && gfx.getRenderScale() < 0.98) ? 7 : 3;
  if (player && (state === "race" || state === "count") && !_envProbeOff && PerfGov.tier() < 1 && !paused && !dbgCam && (frozen || (_frameNo & _envMask) === 0) && gfx.envFaceBegin && LT.carEnvCube > 0.001 && !hideMeshes.cars) {
    // ...
        drawWorldMeshes(frame, night, wet, _floodEmit, false);
        gfx.drawSky(frameSky);
      } finally {
        gfx.envFaceEnd(_envFace);
      }
  } else if (PerfGov.tier() >= 1 && gfx.envProbeReady && gfx.envProbeReady()) gfx.envProbeReset();
```

`drawWorldMeshes` is documented as running **up to 2×/frame** (main + probe);
hoisted material option objects exist specifically for that (`js/game.js`
6417–6418).

GLX capture: RGBA16F cube when `hdrOk`, FBO + depth RB, **`generateMipmap` once
per full mask 63** (`js/render/glx/glx.js` 1485–1610, `ENV_SIZE = 64`,
`ENV_CULL_M = 300` at 143–147). TLX: `THREE.CubeRenderTarget(64)` plus a **1 px
dummy cube** (`js/render/three/tlx.js` 1085–1142). WGX: 64×64×6 `SCENE_FORMAT`
texture + mips every completed cube (`js/render/webgpu/wgx.js` 3884–3901,
3994–4000).

GRAPHICS **MEDIUM** pins governor floor **tier 2**; **LOW** is tier 4. Tier **1**
is “env probe off” (`js/perf/quality-preset.js` 5–6, 15–19;
`js/perf/governor.js` documents the ladder). Phones default the live cube **off**
(`js/lighting/knobs.js` `carEnvCube` help). `__apex.envProbe()` is the latch
clear path (`js/agent/apex.js` 1604–1627). `__apex.lightState().envProbe` is the
ready bit.

Software TLX **skips** the world capture (`softContent("env")` clear-and-count,
`js/render/three/tlx.js` 3300–3324) — this box cannot time a real probe face.

### Measured

`node tools/gfx/chunk-reach.cjs vegas 900,300` on this tip:

| far (m) | chunks / cube | indices / cube | vs 900 m |
|---|---|---|---|
| 900 | 236.4 | 1 041 208 | 0% |
| 300 | 41.0 | 312 678 | **−70%** |

Shipped 300 m cull already took the 2026-08-14 win (ledger: 238.3 / 1.26 M →
45.3 / 377 k; scenery has moved slightly). **312 k indices still go out on
every face**, times six faces per cube, times the CPU cull inside
`drawWorldMeshes`. A 20 m building at 300 m on a 64 px 90° face is ~1.4 px;
city/chunked fill is mostly noise in the blurred reflection.

**Heap (ledger, not re-run):** TLX mobile JS heap **−12.8 MB** with
`apex26.envProbeOff=1` after shadows already off (`docs/notes/PERF-FINDINGS.md`
~2374). Raw cube storage is small (64² × 6 × 8 B × ~4/3 mips ≈ **0.26 MB**
RGBA16F); the 12.8 MB is three.js RT/camera/object overhead, not texels.

Cadence math (code, 60 Hz assumed — **not** a GPU ms): 15 probe faces/s, cube
refresh 2.5 Hz, mip rebuild 2.5 Hz. At 25% of frames the CPU walks the world
draw list twice.

### Suggested fix (do not implement here)

1. On hardware, skip **chunked/city** on probe faces the way software TLX
   already does for budget (`tlx.js` ~3334–3339). 64 px cannot resolve them.
2. Or drop `ENV_CULL_M` further (150 m) and re-run `chunk-reach` — 2026-08-14
   table already had 150 m as a column.
3. Keep cadence; do not slow below 8 frames when scale is already the first
   governor lever (comment at `game.js` 7350–7353).
4. Re-measure heap with the existing `scratch/cockpit3/heap-mobile2.mjs`
   recipe, not fps.

---

## 2. Physics — `updateCar` O(n²) traffic, collide already bucketed

### Profile (vegas, 600 `_apex.step(1/60)`, 68 821 samples, interval 200 µs)

`getError` ate **96.4%** of samples (SwiftShader drain). Of the remaining
**3.6%** JS:

| self | name | file |
|---|---|---|
| 21.5% | `update` | `js/game.js` |
| **17.1%** | `updateCar` | `js/game.js` |
| **12.6%** | `(garbage collector)` | — |
| 1.4% | `getBoundingClientRect` | DOM (not physics) |
| 1.3% | `resolveCollisions` | `js/physics/collide.js` |
| 1.1% | `update` | `js/physics/tyre-model.js` |
| 1.0% | `curvature` | spline |
| 0.9% | `brakeTarget` | `js/physics/ai-drive.js` |
| 0.7% | `sweepContacts` | `js/physics/collide.js` |
| 0.6% | `step` | `js/physics/player-forces.js` |
| 0.6% | `_colForBucketPairs` | `js/physics/collide.js` |

2026-08-13 ledger had `updateCar` 12.4%, `pairContact` 5.1%, GC 2.8% **of all
samples** (no flush split). Direct % comparison is invalid; the **order**
still matches: `update` / `updateCar` first, Rapier absent this run (debris
off in the harness).

### VM wall (same 22-car vegas, debris off)

`g.step(600)` = **1220.7 ms** → **2.03 ms / tick** (10 s of sim).
`g.step(180)` after `a.weather("rain")` = **401.6 ms** → **2.23 ms / tick**.
Particle **pool count stayed 0**: emitters live on the **render** car loop
(`js/game.js` ~7622–7710), not on `update()` / `__apex.step()`.

### Traffic scan (the remaining O(n²))

Each AI car walks **the full `ranked` list** with a wrap pre-reject
(window ~mirrorReach behind … 34 m ahead). Comment states this must not be a
rank-neighbour walk because lapped cars are beside you on the road:

```4694:4735:js/game.js
    // FULL FIELD, and it has to be: `ranked` sorts by CUMULATIVE prog while the
    // window below is on the WRAPPED delta — a lapped car is a whole lap away in
    // rank yet right beside us on the road, so any rank-neighbour walk breaks
    // long before reaching it (the same miss resolveCollisions calls out).
    // The O(n) pass is the price of seeing lapped traffic.
    for (let i = 0; i < ranked.length; i++) {
      const o = ranked[i];
      // Cheap reject before wrap — same pattern as pairContact
      if (ad > REJ && ad < L - REJ) continue;
      // roomL/R, nearbyN, sep, blocker, towCar, chaser
    }
```

22 cars → 22×21 ≈ 462 pair tests / tick **before** reject, plus:

- Player slipstream: a **second** full walk (`js/game.js` 4878–4892).
- OT “car ahead” walk, gated on `otNeedAhead` (comment: was ~17% of
  `updateCar` positionTicks when ungated; now skipped most ticks) 4807–4817.
- `ranked.sort` every tick (hoisted array, no new comparator) 4395–4397.

PERF-FINDINGS §3: Δprog pre-reject **taken** 2026-08-18; merging the two
windows was **declined** (~0.05% of a core). That decline is about merging
windows, **not** about replacing the scan with wrap-aware **arc buckets**.
`resolveCollisions` already buckets on wrapped `prog` with width `LCAR_MAX`
for `ranked.length > 12` (`js/physics/collide.js` 252–272, 553–567). That is
the same topology the traffic window needs.

`pairContact` itself reuses `_ct` / `_sep` (no per-pair alloc) 229–346.
`ContactGeometry.overlap` / `sweep` take `out = {}` default but collide passes
`geom` / `swept` scratches (`js/physics/contact-geometry.js` 11–25).

### Suggested fix

Reuse collide’s wrap-aware bucket fill (or a slightly wider `REJ` bucket) for
the AI traffic / tow / chaser scan so each car only sees adjacent buckets.
Keep the cheap-reject. Do **not** walk rank neighbours. Guard with
`tests/specs/physics-hotpath.spec.js` + characterization; this is behaviour-
sensitive.

---

## 3. GC churn — elevated in the JS remainder

`(garbage collector)` is **12.6%** of non-sync self-time on the 2026-10-06
physics profile. Hot-path **object literals in `updateCar` → AiDrive** were
**taken** 2026-08-18/19 (reused `_ai*` scratches; `physics-hotpath.spec.js`
freezes identity). Collide’s relaxation loop is allocation-free by contract
(`collide.js` 231).

Still allocating on or beside the tick:

| Site | When | Notes |
|---|---|---|
| `motion.set(c, p = {})` | first collide per car | `collide.js` 623 |
| `snapOf` / `new Map` | incident start only | `incident-sim.js` 205–215 |
| `tyre-model.update` | every car every tick when wear **on** | wear **off** in VM/profile (game-vm seed); still **1.1%** `update` |
| `race-radio` / `race-facts` / `engineer` | every tick | 1.1% + 1.0% + 0.5% profile rows |
| `getBoundingClientRect` | 1.4% | layout, not physics |
| `DebrisWorld.buildWorld` | track/field change | `_carForce = new Array(cars.length).fill(0)` `debris-world.js` 384–385 |

### Suggested fix

Attribution pass: Chrome Allocation sampling on the same
`profile-gameloop … physics` recipe (or `runtime.HeapProfiler` in that
script). Do not “fix GC” by widening collide. Likely wins: radio/facts
object literals, tyre debug records, incident snapshots only if they fire
in the sample window.

---

## 4. Particles — pool is fine; flares and GLX VBO are not

### Pool (negative result still true)

`js/fx/particles.js`: SOA `Float32Array`s, `MAX = 96` mobile / **256** desktop
(`init` 55–77). VM confirmed **`cap: 256`**. Spawn recycles `oldest()` when
full (linear scan 118–125, 127–129). Swap-remove in `update` (255–280).
`nOf` burst cap 24 (106–113). Spray refuses past 75% of pool; scrape past 60%.
Governor `shedDiv()` thins emission. PERF-FINDINGS §4 still lists this file as
**zero steady-state allocation**.

CPU buffer budget (desktop, 360-drop rain after `rainSeed`):

- 16× `Float32Array(256)` + `Uint8Array(256)` ≈ 16.6 KiB
- Flares `FLARE_MAX = 72` × 8 floats ≈ 2.3 KiB
- `_vertA` / `_vertB` expand streams ≈ 60 floats × (256 + rain or flares)
- Rain 360 × 60 × 4 B ≈ **86 KiB** alpha payload

Total ~0.25 MB CPU. Not a memory problem.

Emitters (`js/game.js` 7622–7710, `js/fx/car-fx.js` `SPARK_RATE = 110`):
camera-culled, `rate·dt`, visual-only. Headless `step()` never fills the pool
(`pool: 0` after 600 ticks).

### Dirty latch vs one-frame flares

2026-10-05 latch: skip CPU expand + GPU upload when pool/rain-cell unchanged
(`particles.js` 44–51, 294–300, 342–343). **Flares reset `_dirty` every frame
they exist:**

```334:343:js/fx/particles.js
    _flN = 0;                    // one frame: drawn once, then gone
    if (rainLive) pa = rainFill(_vertA, pa);
    // ...
    _dirty = hadFlare;
```

Live race **always** issues flares when lamps are on:

- Start gantry: **5** discs (`js/race/start-lights.js` 7–8, `LAMPS = 5`)
- Marshal panels: **16** nearest (`js/race/marshal-panels.js` 12–14, `NEAREST_N = 16`)
- Far brake glow: cars, capped so they cannot eat `LAMP_RESERVE = 24`

So the skip path does not run for a typical race frame. Expand walks every
live pool particle + every flare + rainFill.

### GLX shared VBO (WGX/TLX already split)

```2619:2644:js/render/glx/glx.js
  function drawParticles(data, floatCount, additive, dirty) {
    const needUpload = dirty !== false || _partLastAdd !== addBit || _partLastN !== floatCount;
```

One VBO. Alpha then additive in the same frame → second draw **always**
`needUpload` because `_partLastAdd` flipped — even when `dirty === false`.
TLX has `partStreams[0|1]` (`js/render/three/tlx.js` 3996–4007). WGX has
`particleVBO = [null, null]` ping-pong (`js/render/webgpu/wgx.js` 1185,
5067–5083) but **`drawParticles(data, floatCount, additive)` ignores
`dirty`** and `writeBuffer`s every call.

### Suggested fix

1. Dual GLX particle VBOs (parity with TLX/WGX) so skip can hold both groups.
2. Keep flares in their own small stream; do not set pool `_dirty` from
   `hadFlare`.
3. Honor `dirty` on WGX (skip `writeBuffer` when the ping-pong slot already
   holds that group).

---

## 5. Rain — 2 m cell rebuilds at speed

`RAIN_CELL_M = 2` (`particles.js` 50). `_rainDirtyFromEye` also buckets camera
speed at 4 m/s (`395–410`). At ~80 m/s the eye crosses a cell **every 25 ms**,
so `rainFill` runs every frame: 360 (desktop default) × 6 verts × hypot/cross
in JS, then ~86 KiB `bufferSubData` / `writeBuffer`.

Mobile seed cap **140**, desktop **1000** (`rainSeed` 429). Governor
`_rainShown` thins after seed.

VM: `a.weather("rain")` → `rainActive: true`; no expand stats because
`draw()` is a no-op without `gfx.drawParticles` in the VM stub.

### Suggested fix

Larger cell (4–8 m) plus a cheap per-drop wrap in the existing buffer, or
upload only the rain slice. Do not rebuild pool smoke to move rain.

---

## 6. Debris / Rapier — still the large optional tax

Ledger (2026-08-13, debris **on**): summing wasm + `debrisworld.js:step` ≈
**16%** of physics CPU. This run: debris **disabled** (`enabled: false`,
`loadState: 0`), so that cost is **not** in the 2.03 ms/tick VM figure.

Caps (`js/physics/debris-world.js` 93–113, 368–374): debris 48/16, marbles
16/6, furniture 24/12. Vegas registered **`furnCount: 17`**.

Every `step` with an empty queue still does `_carNearFurn` when `_furn.length`
(`794–807`):

```712:724:js/physics/debris-world.js
function _carNearFurn(track, cars) {
  if (!_furn.length) return false;
  const L = (track && track.total) || 0;
  for (let k = 0; k < _furn.length; k++) {
    const fs = _furn[k].s;
    for (let i = 0; i < cars.length; i++) {
      // wrap-aware |Δs| < FURN_WAKE_M (14 m)
```

17 × 22 = 374 arc tests / tick when furniture exists, **before** the
asleep-skip. Live debris vs cars is already “positions once, then bodies”
(`_carNearLiveDebris` 753–769) — furniture is the leftover Cartesian product.

`translation()` on Rapier bodies in `_ageAndCullPool` / `_poolNearCars` is
per live body (engine objects, not JS literals).

### Suggested fix

Bucket furniture on arc (same `FURN_WAKE_M`) so a car only tests nearby
cones. Re-profile with debris **enabled** (`profile-gameloop` after
`DebrisWorld.setEnabled(true)` + `prime`) before touching WASM.

---

## 7. `sweepContacts` — nested pairs, already cheap-rejected

```151:198:js/physics/collide.js
    function sweepContacts(ranked, dt) {
      for (let i = 0; i < ranked.length; i++) {
        // ...
        for (let k = i + 1; k < ranked.length; k++) {
          // FAR APART on the arc ... 231 pairs a step
```

**0.7%** JS self-time. Broadphase for the **impulse** solver is buckets
(`_colForBucketPairs` 0.6%). Leave unless a 24+ car MP field shows up in a
new profile.

`player-forces.js` / `tyre-model.js` / `grip-steer.js` / `ai-band.js`: no
per-tick `new`; band is O(1). `worldFromTrack` writes reused `_wf`
(`js/game.js` 488–495).

---

## 8. Particle `oldest()` — only when full

Linear `age/life` scan over `_n` (`particles.js` 118–125). Paid only at
capacity. Prefer dropping the **oldest in a ring cursor** or a small heap if
wet-race spray + smoke saturates 256 (check `Particles.count()` vs `capacity()`
on a wet browser probe, not VM `step()`).

WGX particle UBO overwrite **before submit** (2026-08-17 survey critical) is
**fixed** (dual VBO, `js/render/webgpu/wgx.js` 5067–5083).

---

## Methods appendix

```
# ship SHA
git rev-parse HEAD   # a0b371e27f2b6058369459b50045aaa0a75547d9

node tools/gfx/chunk-reach.cjs vegas 900,300
# vegas — 911 chunks, 744652 tris, 13 stations
#   900 m  236.4 chunks  1041208 indices
#   300 m   41.0 chunks   312678 indices  (−70%)

node tools/shot/apex-eval.mjs vegas --vm --raw '(a.setInput({throttle:true}), a.jump(0.1,55,0), (()=>{ const P=g.sandbox.Particles; const t0=performance.now(); g.step(600); return {ms:performance.now()-t0, cars:g.G.cars.length, pool:P.count(), cap:P.capacity(), debris:g.sandbox.DebrisWorld.status()}; })())'
# 1220.7 ms / 600 ticks / 22 cars / cap 256 / debris enabled false / furnCount 17

node tools/shot/profile-gameloop.mjs vegas physics
# 68821 samples; GPU sync 96.4% getError; JS remainder: update 21.5, updateCar 17.1, GC 12.6
# scratch/profiles/vegas-physics.cpuprofile
```

Logs: `artifacts/logs/chunk-reach-vegas.log`, `vm-step-particles.log`,
`vm-rain.log`, `profile-vegas-physics.log`.

---

## Explicit non-findings (do not re-open)

From `docs/notes/PERF-FINDINGS.md` §4 / §3, still true on this tip:

- Particle SOA pool: no per-frame object alloc in spawn/update.
- AiDrive ctx scratches reused (`physics-hotpath.spec.js`).
- `pairContact` / collide relaxation: shared `_ct`, buckets for n>12.
- Env-probe 300 m cull and world-then-sky **already shipped**.
- Instancing is live (superseded “tests only” line).

---

## Suggested next (max 3)

1. **GLX dual particle VBO + flare stream** so the 2026-10-05 dirty skip can
   actually fire on a live race; honor `dirty` on WGX.
2. **Probe: drop chunked/city from hardware cube faces** (or 150 m cull) and
   re-count with `chunk-reach`; heap via the mobile `envProbeOff` recipe.
3. **Bucket the AI traffic scan** the way collide already buckets contact —
   largest remaining physics JS (`updateCar` 17.1%).

## Blockers

- No real GPU: `__apex.gpuTimer()` ms are not evidence; do not A/B probe fps
  here.
- Debris/Rapier not loaded in VM or this physics profile — 16% figure is
  ledger-only until a debris-on profile.
- `profile-gameloop` JS % is of a **3.6%** remainder after `getError`; treat
  **ratios**, not absolute ms, as the signal (PERF-FINDINGS §0).
