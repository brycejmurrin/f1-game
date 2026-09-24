# Lamp popping — status and plan (2026-09-24)

The problem: the lit shaders loop a fixed number of lamp slots per fragment
(48 on desktop, 24 on a phone, 16 on a three.js phone). Each frame the game keeps
only the lamps nearest the camera (`js/lighting/frame-lights.js` `setFrameLights`).
On a circuit with ~250 lamps the rest are not drawn, and lamps ahead switch
on as they enter the nearest set. This page tracks what has shipped against that
problem and what is still left.

## Shipped

| PR | What | Where |
|---|---|---|
| #237, #239 | PER-CHUNK LAMPS on three.js: the per-fragment lamp-grid lookup, with colours refreshed when the lamp set changes | `tsl-lit.js`, `tlx.js` |
| #242 | Tail-lights are paint by default (glow plus a road decal, no light slot). Per-chunk lamps shed to 0.3 rather than switching off | `frame-lights.js`, `car-mesh.js` |
| #243 | **BAKED LAMP POOLS**: every lamp's diffuse pool on up-facing ground, baked once per track into an RGBA16F world-XZ map (TLX + GLX) | `js/lighting/lamp-bake.js` |
| #246 | Bug-hunt fixes (four read-only reviewers): <br>• road-height bake with height in alpha and a height fade in the shader <br>• symmetric, verge-wide road splat <br>• steady-colour shadow carve <br>• colour clamp <br>• pre-bake at race start; debounced, time-sliced rebakes <br>• 0.35 s entry ramp for lamps joining the set <br>• steady, distance-faded tail-glow decal | as listed |
| #247 | **a**: LAMP BOUNCE baked as a second texture layer. **c**: baked pools ported to WGX (WebGPU) | `lamp-bake.js`, all three lit shaders, `wgx.js` |
| #250 | **d**: governor steps. The lamp cap slides after a 1.5 s held tier, and halos fade. **f**: the tail-glow decal is pitched to the road. **g** (part): GLX frees the bake when it is off. **h**: comment fix | `frame-lights.js`, `car-mesh.js`, `glx.js`, `game.js` |

Measured (real-track harness, `buildRoad` vertices, Monza / Vegas / Singapore):
road samples that lose the bake at the edges went from thousands to 0. Interior
error has a p95 under 2–9 % (worst on Vegas). The gpu-census on macos-latest,
Singapore at night, passed for all four renderers on #246 and again on #247
(run 35955024485: WGX `ok=true gpuErrors=0`, drove 439 m; GLX `gpuErrors=0`).
#247 is live (`apex-sha` de4faf2fc). #250 merged as 3b2548d4c; its Pages deploy is in flight.

## Next steps

**Done:** a, c (#247); d, f, h and GLX freeing for g (#250). **Remaining, in order:**

1. **e: per-lamp "live-only" flag** (below). Supersampling was measured and rejected.
   - Tried a 3×3 box average near each lamp's foot. Monza k1380 went 29.7 → 27.0
     against a true 6.1. Vegas and Singapore got worse (16.1 → 21.1, 41.2 → 44.8).
   - The overshoot is the bilinear tap spreading a sharp cone edge across
     neighbouring texels, not point sampling inside a texel.
2. **g: mobile bake size.** Measure the parity error at `MAX_TEXELS` 300 k
   (cell ×1.41) with the harness. Ship it on `gfx.isMobile` only if the interior
   p95 stays under 10 %. TLX and WGX should also free the bake when it is off, as
   GLX now does.
3. **b: wet nights.** Measure first (see below).
4. **Verify #250 on hardware.** gpu-census `macos-latest` on the live tip, with a
   forced governor tier:
   - `ls: apex26.perfTier=2`, or the `__apex` governor hook
   - confirm lamps and halos step smoothly
   - confirm the decal sits on the road through Singapore's elevation changes

### Execution (2026-09-24, after #250)

Three subagents work in parallel, each in its own git worktree based on 8a1d988dc.
Each one commits locally and does not push. The lead session merges their commits
onto `claude/pr-233-fix-deploy-iu9wfs`, runs the browser checks and the
gpu-census (subagents cannot launch browsers), and opens one PR.

| Agent | Item | Files it owns | Deliverable |
|---|---|---|---|
| A | **e**: live-only flag | `lamp-bake.js`; the light packing in `glx.js` / `wgx.js` / `tlx.js`; `glsl-lit.js`, `tsl-lit.js`, `wgsl-chunks.js` (the step-aside and carve only); tests | Commit, plus parity-harness numbers before and after |
| B | **g**: mobile size and TLX/WGX freeing | `lamp-bake.js` (`MAX_TEXELS` per call), `game.js` bake call site (the mobile argument), `tsl-lit.js` `setLampBake` off-path, `wgx.js` `_syncLampBake` off-path | Commit, plus the parity error at 300 k vs 600 k texels |
| C | **b**: wet-night measurement | a new `scratch/` harness only (no shipped code) | Table: share of each lamp's on-road luminance that is diffuse, bounce and specular, dry vs wet, at 5 Singapore spots, from the shader formulas on the CPU |

Lead:
1. Merge A and B.
2. Run the unit tests and a GLX boot.
3. Run gpu-census with a forced tier (also covers the #250 hardware check).
4. Open the PR.
5. Use C's numbers to decide **b**.

### e. Over-bright hotspots: the live-only flag (small–medium)

**Symptom.** A bright smear about 2 m across under a few fixtures:
- Monza k1380: baked 29.7 vs true 6.1 at the verge
- Vegas k1505: 16.1 vs 7.2
- Singapore k1189: 41.2 vs 23.5

**Cause.** At a 1.5–2.3 m texel, bilinear filtering spreads a pool whose cone
edge or near-field falloff changes within one texel.

**Plan.**
1. **Classify at bake time** (`lamp-bake.js`). A lamp is *live-only* when either:
   - its lens is < 3 m above the baked surface under it (read `hgt` at the lamp's
     texel), or
   - `cosOuter > 0.9` (a cone narrower than ~25°).

   `bake()` skips live-only lamps and returns `b.liveOnly`, a `Uint8Array(n)`.
2. **Carry the flag per record.** Every backend has spare lanes, so nothing
   changes size:
   - **GLX:** `uLight[li+3].y` (lanes 13–15 are written 0 today, `glx.js:1944`).
   - **WGX:** `Light.cone.w` (pad), in both `lights` and `trackLights`.
   - **TLX:** the same lane in its packed light uniform and the per-chunk lamp texture.

   The flag must follow the record through `setFrameLights`'s copy and the
   per-chunk `_fillAllLights`. The cleanest home is a 16th field known only to the
   packers, looked up from `LampBake`'s `liveOnly` by source index. The frame
   copy keeps stride 15.
3. **Shaders.** A live-only lamp ignores the bake:
   - the step-aside becomes `mix(1 - bakeW, 1, liveOnly)` for diffuse and bounce
   - the shadow carve becomes `* (1 - liveOnly)`
4. **Tests.**
   - `lamp-bake.test.mjs`: a low lamp contributes 0 to the bake and is listed live-only.
   - The parity harness: worst ratio under 1.3× on Monza, Vegas and Singapore.
   - `webgpu-lifecycle`: the lane is packed.

**Verify.** The harness numbers, a GLX screenshot of Monza's start line with the
bake OFF and ON, and a gpu-census.

### f. Tail-glow decal is a flat plane (small): SHIPPED #250

**Symptom.** The red road glow behind a car clips into the road on dips, and floats
over crests.

**Cause.** `CarMesh.drawTailGlow` (`js/car/car-mesh.js:794`) lays a flat quad in the
car's `_groundMat`, 3–9 m behind it.

**Plan.**
1. Pitch the quad to the road between the car and the decal centre: sample
   `Tracks.sample` at `s − 6 m` and use the height delta over the run.
2. Lift it 6 cm → 10 cm to clear banking noise.
3. `_tgTried` caches the mesh per backend: key the cache on the backend so a
   backend switch rebuilds it.

**Verify.** GLX screenshots on Spa (Eau Rouge dip) and Zandvoort (banking) with a
rival ahead.

### g. Bake memory and freeing (small): GLX freeing shipped #250; mobile size and TLX/WGX freeing open

- Two layers at 600 k texels is ~9.6 MB of RGBA16F. The `MAX_TEXELS` comment in
  `lamp-bake.js:34` still says 4.8 MB; it is per layer.
- On the mobile tier (`gfx.isMobile`), halve `MAX_TEXELS`. This costs about 1.4× the
  cell size. Measure the error with the parity harness first.
- GLX keeps `_bakeTex` (`glx.js:111`) after the bake is switched off. Delete it when
  `frame.lampBake` has been null for about 2 s. TLX and WGX free on replacement
  only; do the same there.

### h. Stale comment (trivial): SHIPPED #250

- `js/game.js:7072` says "night flood set only". Day floods bake too.

### b. Wet nights (investigation first; large)

**Symptom.** On a wet night, lamps ahead still visibly switch on.

**Why.** Wet diffuse is × 0.15, so most of a lamp's on-road brightness is the live
GGX reflection (plus spill and bounce), and the bake does not hold it.

**Step 1: measure.** Instrument the lit shader behind a debug uniform to write, per
lamp term, the share of final luminance: diffuse, bounce, specular. Do this at 5
spots on Singapore, dry and wet. If specular is under 30 % of lamp light when
wet, **stop**: the 0.35 s ramp is enough.

**Step 2: options, if measurement says it matters.**
1. **Raise the cap when wet.** Per-chunk lamps at 1.0 give 24 lamps per chunk. That
   is cheap and already built; measure its frame cost on the macOS census.
2. **Bake a rough-reflection term.** Store an irradiance-weighted dominant light
   direction per texel (a third layer: rgb = colour, a = packed direction). The
   shader then evaluates one GGX lobe against it. This is view-dependent-correct for
   one lobe, wrong for overlapping pools, and a third texture layer.
3. **Screen-space.** Let SSR carry the pools' reflection. It already reflects lit
   geometry, and it needs the baked pools to be in the reflected colour, which they are.

Option 1 first. Take option 2 only with a measured, visible win.

## How to verify a lamp change

1. `node --test tests/unit/lamp-bake.test.mjs` pins the bake to the shader term.
2. The real-track parity harness (the bake-maths reviewer's `scratch/lampbake-parity.cjs` pattern):
   `buildContext` → `buildTrackLights` → `LampBake.forTrack`, sampled on `TrackMesh.buildRoad` vertices.
3. Local screenshots, bake OFF/ON: GLX on SwiftShader (fast, reliable here); TLX and WGX on lavapipe (slow, can time out under load).
4. **gpu-census, `macos-latest`, `track=singapore tod=night clock=22`**: the only real-GPU evidence. Read the Verdict step.
