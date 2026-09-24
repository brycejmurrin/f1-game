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
| #247 (open) | **a**: LAMP BOUNCE baked as a second texture layer. **c**: baked pools ported to WGX (WebGPU) | `lamp-bake.js`, all three lit shaders, `wgx.js` |

Measured (real-track harness, `buildRoad` vertices, Monza / Vegas / Singapore):
road samples that lose the bake at the edges went from thousands to 0. Interior
error has a p95 under 2–9 % (worst on Vegas). The gpu-census on macos-latest,
Singapore at night, passed for all four renderers on #246.

## Open: #247 gate

- [ ] gpu-census on #247's head shows WGX with **0 gpuErrors** (Verdict step).
  Local lavapipe WGX (singapore night, bake on): booted and bound, **gpuErrors 0, no console errors**
  (so the WGSL validates), but no frame reached the soft-present capture within 90 s. That is the
  known lavapipe present path, not a validation fault; the census is the real-GPU check.
- [ ] CI green, then merge, `pages.yml`, and confirm the live `apex-sha` includes the merge.

## Next, in order of how glitchy they read

| # | Item | Plan | Size |
|---|---|---|---|
| d | **Governor steps.** `tierShed` cuts the lamp cap 48 → 32 → 24 with no fade. Halos all go at tier ≥ 3. A device near its frame budget can oscillate between tiers (`governor.js` step-then-revert) | Fade cap changes over ~0.5 s through the entry ramp's machinery. Add hysteresis (a minimum hold time) before a tier step touches lighting | Small |
| b | **Wet nights.** Diffuse is × 0.15 when wet, so most of a lamp's on-road brightness is the live GGX reflection, which the bake does not cover | Option 1: bake a rough "wet sheen" irradiance term at a fixed roughness and view-independent approximation, blended by `wetSheen`. Option 2: raise the cap (per-chunk lamps) when wet. Measure the fraction first | Large; decide first |
| e | **Local over-brightness** within ~2 m of very low or tight-cone fixtures (Monza start gantry k1380, Singapore k1189, Vegas k1505). The ~2 m texel is too coarse at the hotspot | Leave those fixtures out of the bake (they stay live, flagged at build time: lens < 3 m or cone < 25°), or bake them at a finer local tile | Small |
| f | **Tail-glow decal is a flat plane.** It clips on dips and floats on crests | Tilt it to the road's local pitch (`Tracks.sample` tangent at the decal's centre) | Small |
| g | Bake memory: two layers at 600 k texels is ~9.6 MB. The GLX texture is not freed when the bake is switched off | Free on off. Consider lowering MAX_TEXELS on the mobile tier | Small |
| h | Stale comment at game.js "night flood set only" (day floods bake too) | Fix the text | Trivial |

Recommended next: **d**, then **e**, then **f** (each is small and removes a visible artefact). Take **b** as its
own measured investigation.

## How to verify a lamp change

1. `node --test tests/unit/lamp-bake.test.mjs` pins the bake to the shader term.
2. The real-track parity harness (the bake-maths reviewer's `scratch/lampbake-parity.cjs` pattern):
   `buildContext` → `buildTrackLights` → `LampBake.forTrack`, sampled on `TrackMesh.buildRoad` vertices.
3. Local screenshots, bake OFF/ON: GLX on SwiftShader (fast, reliable here); TLX and WGX on lavapipe (slow, can time out under load).
4. **gpu-census, `macos-latest`, `track=singapore tod=night clock=22`**: the only real-GPU evidence. Read the Verdict step.
