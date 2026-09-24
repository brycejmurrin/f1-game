# TLX performance plan — the next backlog steps (2026-09-24)

The working plan for the three.js (TLX) backend's remaining per-frame costs after the
compile-hitch work (PERF-FINDINGS §2ad-§2ak, all live). Evidence and results land in
[PERF-FINDINGS.md](PERF-FINDINGS.md); this file is the plan and its status only.

Source: three read-only investigations (2026-09-24) of the §2aj backlog, their
decisive file:line claims spot-checked before planning. Each step is its own commit,
verified before it merges onto the session branch, and deployed on the user's word.

## Status

| # | step | status |
|---|---|---|
| L0 | player gated by the lamp radius (key + cast) | planned |
| L1 | static-props lamp map, cars drawn on top | planned |
| L1b | keep lamp instanced casters when the lamp is unchanged (fallback for L1) | only if L1's depth copy is not portable |
| G1 | godray chain: night lamp beams use one blur pair, not two | planned |
| R1 | pooled fixed-shape draw records | planned |
| P2 | fixed per-pair post materials (no texture swaps) | low priority |
| — | SSR MRT loop skip / attachment skip | dropped (below) |

## Findings that shape the plan

**Night lamp shadow rebuilds ~every frame while driving (confirmed).**
`js/render/shared/shadow-pass.js`: the lamp key is the lamp position plus `_carKey`,
and the PLAYER is hashed into `_carKey` and cast unconditionally — AI cars get the
`_lsR2` (lamp radius + 8 m) gate, the player does not. Every 0.25 m of player movement
rebuilds: 60/s at tier 0, ~30/s at tier ≥ 1 (the odd-frame car-only defer). A lamp
change is rare; nearly every rebuild is car-only. Each rebuild still re-culls every prop
chunk (`chunkedSys.cull`), re-packs every instanced batch (`cullInstances(upload:false)`,
which also copies colours the depth pass never reads), copies n×16 floats again into the
caster (`castInstanced`) and uploads it, and redraws all static props. `iByBatch` casters
are shared by the sun and lamp passes, so neither keeps its matrices. GLX has the same
shape (one `shadowIbo` per batch, no static/dynamic split).

**Godray chain runs on almost every frame (confirmed).** `tlx-post.js` `present()`: one
16-step half-res march (`tsl-post.js`: shadow compare + cloud FBM by day, a 6-lamp loop
at night) plus FOUR half-res 5-tap blurs (two H+V pairs), gated by `sunGR = S.enabled &&
grStr > 0` or `lampVol > 0`. `grStr > 0` whenever the sun is up and the key light > 0.35
(`game.js`); `lampVol > 0` at night with floodlights, haze and a non-mobile tier. Only
`PerfGov.autoTier() >= 4` drops them. GLX (`glx/post.js`) is identical.

**Post ping-pong texture swaps are CPU-only on WebGPU.** 13 swaps a frame (blurAO 2,
blurGR 4, bloom down 4, upAdd 3). In the vendored r186 the swap resets the sampled
texture's generation and `updateBindings` runs, but the WebGPU bind group comes from a
per-key cache after the first frame — no `createBindGroup` per swap (read, not measured).
On WebGL2 each swap re-uploads the group's UBOs (`bufferData`). Low priority.

**SSR MRT on/off per frame is required — dropped.** The scene pass sets the ssrTag MRT
and restores it; the env faces and the soft-blit render with it off, and an fx material
(no `output` node) under a set MRT loses its colour. A skip-when-equal flag would never
fire; the loops are ~150-200 trivial assignments with zero allocation. Skipping the
second attachment when reflections are off would change the render-context key and
every program key (a full recompile on toggle) and break the tag readers in tsl-post.

**Draw records are safe to pool.** No consumer keeps a record past the frame
(`_mirrorRelease` keeps the chunked MESH); four `drawList.length = 0` sites (`begin`,
env-soft early exit, env face end, present tail). ~150-400 objects and ~10-25 KB of
young-gen garbage per frame, in 4-5 shapes (polymorphic).

## Steps

### L0 — gate the player by the lamp radius
- **What:** in `shadow-pass.js`, apply the AI cars' `_lsR2` test to the player in BOTH
  the `_carKey` hash and the cast (the key must cover exactly the set the pass draws —
  the existing comment's rule). The existing argument applies unchanged: shadow rays
  leave the lamp, and both readers (lit lamp loop, godray march) reject beyond `rad`,
  so a caster beyond rad + 8 m occludes only fragments this lamp does not light.
- **Expect:** no lamp rebuilds while the player is outside the chosen lamp's reach (the
  lamp is picked by distance²/luminance to the camera, so between widely spaced lamps
  or under a bright distant one). Partial — the player is often inside the radius.
- **Verify:** lamp pass count and time, `scratch/shadow-pass-count.mjs` (night, driving)
  before/after; frozen night pixel A/B (`scratch/ab-frames.mjs` + `png-diff.mjs`) within
  the same-tree floor (~0.02-0.04 %).
- **Risk:** none visual by the argument above. No switch (a logic fix).

### L1 — static-props lamp map, cars on top
- **What:** `tlx-shadow.js` adds `lampStaticRT` (`makeDepthTarget(LAMP_SIZE)`). On a LAMP
  change, render the static props (prop chunks + instanced batches) into it. On every
  rebuild, `renderer.copyTextureToTexture(lampStaticRT.depthTexture, lampRT.depthTexture)`,
  then draw only the cars into `lampRT` with depth clear off. `lampRT` stays the sampled
  texture, so `tsl-lit` / `tsl-post` / `tlx-post` samplers and GLX/WGX parity are
  untouched. `shadow-pass.js` splits the pass: static on lamp change, cars on `_carOnly`.
- **Expect:** car-only rebuilds (nearly all night rebuilds) skip all prop cull, pack,
  upload and draw; cost becomes one depth copy + 1-3 cars.
- **Risk:** WebGPU cannot copy a `depth24plus` texture — both targets may need a
  copyable depth format (depth32float, `depthTexture.type = FloatType`); WebGL copies
  depth via `blitFramebuffer(DEPTH_BUFFER_BIT)`. +1 MB (256 KB on software GL).
- **Switch:** `apex26.tlxLampStatic=0`.
- **Verify:** frozen night A/B within the floor; lamp static-map rebuild count ≈ lamp
  changes (add a counter to `lampShadowState()`); census night leg `gpuErrors` 0 and
  `gpuMs`/frame time. Caveats: the car pass never runs on a software adapter, and
  Lavapipe skips batches (`skipBatches`) — batch savings show only with
  `apex26.tlxForceGL=1` (SwiftShader) or `apex26.tlxForceHw=batches`.

### L1b — keep the lamp's instanced casters (only if L1 fails)
- **What:** key instanced casters per target (`Map<rt, Map<batch, InstancedMesh>>`); on
  `_carOnly` with an unchanged lamp VP, re-show the kept casters instead of re-culling,
  re-packing and re-uploading. Saves both copies and the upload, not the draw.
- **Risk:** new casters mint on the first night pass → add the lamp target to
  `shadowSys.warm()`; ~64 KB padding per batch on WebGPU (UBO-limit sizing).
- **Switch:** `apex26.tlxLampKeep=0`.

### G1 — godray: night lamp beams take one blur pair
- **What:** in `tlx-post.js`, when `!sunGR` (lamp beams only), run the first H+V blur
  pair and skip the second. Same material, same targets — nothing new to warm, no MRT
  change. Port to `glx/post.js` for parity.
- **Expect:** −2 half-res full-screen passes per night frame with floodlights and haze.
- **Risk:** a visual change — the IGN dither is blurred less, beams may read grainier.
  Needs a look A/B, not just a diff.
- **Switch:** `apex26.tlxGrLite=0`.
- **Verify:** frozen night floodlit frame with mist, tree-vs-tree diff (expect a small
  NON-zero diff) plus a side-by-side look; census `gpuMs` on a night leg ≈ −2 blurs, and
  no new programs. Rejected alternatives: quarter-res march (the double blur exists to
  remove stripes), re-march every other frame (shafts lag and ghost at speed).

### R1 — pooled draw records
- **What:** `tlx.js` — one fixed-shape record `{geo, m, mat, em, al, lg, chunked,
  instanced}` from a pool; every producer writes every field (`em`/`al` stay
  `undefined` for fx — `acquireMesh` tests `!== undefined`; `lg` 0; `chunked`/`instanced`
  null); the cursor resets at the four `drawList.length = 0` sites; stale `geo`/`mat`
  nulled at reset so evicted materials and geometry are not pinned.
- **Expect:** ~150-400 fewer allocations per frame; a monomorphic record shape.
- **Risk:** low.
- **Verify:** canary — no `drawList.push({` left, every reset site resets the cursor; a
  sandbox test that a reused slot carries `em === undefined`; a 30 s heap-sawtooth probe
  (`performance.memory`) before/after.

### P2 — fixed per-pair post materials (low priority)
- **What:** `tsl-post.js` — one material per fixed source→target pair (AO H/V, GR H/V,
  `down[1..4]`, `upAdd[1..3]`: 7 more), each `tex.value` set once in `ensureAO` /
  `ensureGR` / `ensureBloom`. Each needs its OWN `customProgramCacheKey` — a shared key
  makes three clone the first material's bindings and sample the wrong texture.
- **Risk:** up to 7 more programs to warm; the post warm's 3 s deadline could cut them.
- **Switch:** `apex26.tlxPostFixedMats=0`.
- **Verify:** frozen A/B byte-identical to the floor; post `createBindGroup` per frame 0
  before and after (confirms the finding); new programs warm-tagged only.

## Order and checks

L0 → L1 (L1b only if needed) → G1 → R1 → P2. Every step: `npm run test:tooling-fast`,
the braking compile probe (`scratch/compile-attrib-probe.mjs`: lap sync compiles stay 0),
frozen A/B, then a census. The census driven window is DAY montreal; L0, L1 and G1 need a
night leg (`"tod": "night"` in `.github/gpu-census-request.json`).
