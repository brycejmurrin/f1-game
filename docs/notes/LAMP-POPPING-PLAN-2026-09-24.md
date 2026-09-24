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

Measured (real-track harness, `buildRoad` vertices, Monza / Vegas / Singapore):
road samples that lose the bake at the edges went from thousands to 0. Interior
error has a p95 under 2–9 % (worst on Vegas). The gpu-census on macos-latest,
Singapore at night, passed for all four renderers on #246 and again on #247
(run 35955024485: WGX `ok=true gpuErrors=0`, drove 439 m; GLX `gpuErrors=0`).
#246 is live (`apex-sha` 4efe11cd0). #247 merged as de4faf2fc; Pages dispatched.

## Next steps

**Progress (branch `claude/pr-233-fix-deploy-iu9wfs`, after #247):**
- **d done.** Held tier (1.5 s), a slot cap that slides 16/s down and 32/s up, and a
  0.4 s halo fade. Pinned by `frame-lights-shed.test.mjs`.
- **f done.** The decal is pitched to the centreline's rise between the car and
  the decal centre (clamped ±1.5 m), and lifted to 8 cm. The backend-keyed cache is
  not needed: a backend switch reloads the page.
- **g partly done.** GLX frees the light map after 2 s with the bake off. The
  `MAX_TEXELS` comment now says per layer. Mobile halving is not done (needs a
  parity measurement first).
- **h done.**
- **e: supersampling was tried and REJECTED.** Measured.
  - A 3×3 box average per texel within 3 cells of each lamp's foot left Monza
    k1380 at 27.0 vs 6.1 (was 29.7). Vegas k1505 got worse (21.1 vs 7.2, was 16.1),
    and so did Singapore k1189 (44.8 vs 23.5, was 41.2).
  - The overshoot is bilinear filtering spreading a sharp cone edge across
    neighbouring texels, not point sampling inside a texel.
  - The per-lamp "live-only" flag below is the fix that works. It needs one spare
    lane per light record in all three backends.

Order: **d → e → f → g/h**, then **b** as its own investigation. Each of d, e, f is
one small PR. Each removes one visible artefact and has a test that pins it.

### d. Governor steps pop the lamp set (small)

**Symptom.** On a device near its frame budget, lamps and halos vanish and come
back in bursts.

**Cause.**
- `tierShed` (`js/lighting/frame-lights.js:244`) cuts the per-fragment lamp cap
  from 48 to 32 at tier 1, and to `LightBudget.MOBILE` (24) at tier 2, in one frame.
- Every halo disappears at tier ≥ 3 (`js/game.js:7794`, `PerfGov.tier() < 3`).
- The governor (`js/perf/governor.js`, `_pendingVerify`) reverts a step that
  bought nothing. So a device on the edge steps down, pops, steps back up, and pops again.

**Plan.**
1. Smooth the cap instead of the tier. `setFrameLights` keeps a float `_capF` that
   moves toward `tierShed(cap)` at about 16 slots/s (down) and 32 slots/s (up).
   The integer cap is `ceil(_capF)`. The existing guard band then ends the dropped
   lamps at 0 as the set shrinks, and the 0.35 s entry ramp already covers regrowth.
2. Fade the halos rather than cutting them: a `_glowF` that falls to 0 over 0.4 s once
   tier ≥ 3, passed as a multiplier into `gfx.drawGlow`'s strength (the
   `LT.glareStr` argument).
3. Hysteresis for lighting only: the cap target follows the tier only after the tier
   has held for 1.5 s. The governor itself is unchanged, since its verify/revert
   logic is measured and pinned.

**Tests.**
- `all-lights-fill` or a new `frame-lights-cap.test.mjs`: a tier step 0 → 2 drops the
  output count by at most ⌈16·dt⌉ per frame, and a lamp that leaves the set is at
  colour 0 on its last frame.
- A 0 → 2 → 0 flip inside 1.5 s leaves the cap untouched.

**Verify.** Force tiers with `__apex` (`perfTier` / governor hooks in
`docs/DEBUG-HOOKS.md`). Take GLX SwiftShader luma samples across a forced step and
confirm there is no single-frame change above noise.

### e. Over-bright hotspots under very low or tight-cone lamps (small)

**Symptom.** A bright smear about 2 m across directly under a few fixtures:
- the Monza start gantry (k1380, cone 0.92 / 0.78)
- Singapore k1189 and Vegas k1505 (lens at 2.5–2.6 m, aim −0.2)

**Cause.** At a 1.6–2.3 m texel, bilinear filtering spreads a pool whose gradient
changes over less than a texel. The parity harness measured the baked value at up
to 3.9× the true one, locally.

**Plan.**
1. Exclude such fixtures from the bake at build time: lens height < 3 m above the
   baked surface, or a cone narrower than ~25° (`cosOuter > 0.9`). They stay on the
   live loop at full per-pixel accuracy, and there are few of them.
2. Mark excluded records with a flag lane: bit 1 of record [13] `volW`'s fraction, or a
   parallel `Uint8Array` held by `LampBake`. `bake()` skips them.
3. The shaders must NOT scale an excluded lamp by `(1 - bakeW)`. Pass a per-lamp
   "baked" bit:
   - GLX/TLX: the `w` of the colour lane is taken, so use `cone.w` (pad in WGX's
     `Light`, lane 15 is spare in the uniform array).
   - Multiply the step-aside by it: `mix(1, 1 - bakeW, baked)`.

**Tests.**
- `lamp-bake.test.mjs`: an excluded lamp contributes 0 to the bake.
- The parity harness: the worst-case ratio on Monza/Vegas/Singapore falls under 1.3×.

**Verify.** The harness numbers, plus an OFF/ON GLX screenshot at Monza's start
line.

### f. Tail-glow decal is a flat plane (small)

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

### g. Bake memory and freeing (small)

- Two layers at 600 k texels is ~9.6 MB of RGBA16F. The `MAX_TEXELS` comment in
  `lamp-bake.js:34` still says 4.8 MB; it is per layer.
- On the mobile tier (`gfx.isMobile`), halve `MAX_TEXELS`. This costs about 1.4× the
  cell size. Measure the error with the parity harness first.
- GLX keeps `_bakeTex` (`glx.js:111`) after the bake is switched off. Delete it when
  `frame.lampBake` has been null for about 2 s. TLX and WGX free on replacement
  only; do the same there.

### h. Stale comment (trivial)

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
