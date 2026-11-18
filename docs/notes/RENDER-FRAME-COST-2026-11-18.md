# Render frame cost on the phone path: a ranked, measured list (2026-11-18)

Summary: TLX WebGPU phone-tier render cost ranked from one throttled driven-race profile and two exact censuses; what is left is per-draw work inside three, the mirror pass and two forced layouts.

Kind: measurement · Re-measure-by: 2026-12-20

Perf lane A (rendering), branch `claude/perf-render-frame-cost`. Path measured: TLX on three's WebGPU backend,
phone tier (`apex26.forceMobileTier=1`), the path Bryce's iPhone takes (D-013). Continues
[PHONE-PERF-MEASURE-2026-11-10](PHONE-PERF-MEASURE-2026-11-10.md); nothing there is re-quoted as true.

**Evidence class of every number here: `software`** (this container, Dawn over SwiftShader/Lavapipe, no GPU).
A time is main-thread JavaScript under CDP CPU throttle ×4, never GPU time. A count (draws, passes, triangles,
uploads) is exact and carries to a phone. No real-device number was taken.

## Method

| run | command | what it gives |
|---|---|---|
| A | `node tools/gfx/pass-census.mjs monaco --park --mobile --webgpu` | exact draws and triangles per pass, parked chase camera |
| B | `node tools/gfx/live-frame-census.mjs --tracks monaco --backends tlx-gpu --warm 8 --win 20 --prof 12 --trace 0 --cpu-throttle 4 --ls "apex26.forceMobileTier=1" --prof-out f.cpuprofile` | driven race, helmet camera, 844×390: PerfSpans, per-frame WebGPU call counts, V8 CPU profile (`--prof-out` is new here: the raw profile, for callers) |
| C | `node tools/perf/cpuprofile-summary.mjs f.cpuprofile 70` | inclusive time by function from run B |
| D | scratch probe hooking `renderer.backend.updateBinding` (not committed) | which uniform changed in each uniform-buffer upload, per rendered frame |

One run each: read times ±20%. Run B's window was 285 rAF frames, 13.1 s profiled, 10.1 s of it inside the game's
rAF callback.

## Where the frame goes (run B/C, ×4 throttle, inclusive ms of 10,107 in the callback)

| # | owner | ms | share | note |
|---|---|---:|---:|---|
| 1 | `render` (game.js) total | 6,757 | 67% | span p50 31.9 ms of a 47.7 ms frame |
| 2 | three `_renderObjectDirect` (every draw of every pass) | 3,671 | 36% | 209 draws and 15 passes per rAF frame |
| 3 | of which per-draw revalidation: `updateForRender` 2,045 (`_updateBindings` 1,199, `getForRender` 770, `getNodeBuilderState` 465) | — | 20% | three re-derives keys and bindings for every render object on every frame |
| 4 | mirror pass (`mirror-pass.js render` → `tlx.js mirrorEnd`) | 1,474 | 15% | helmet camera, `lite` rung, every frame |
| 5 | post chain (`tlx-post.js present`) | 792 | 8% | 10 full-screen passes on this tier: SSAO + 2 blurs, bright, 2 down, 2 up, composite, FXAA |
| 6 | HUD (`updateHud`) | 672 | 7% | includes `querySelectorAll` 267 and `getBoundingClientRect` 130: layout reads in the frame (`hud-layout.js clearReadouts`, `hud.js fitPass`, `hud-radio-lane.js laneRect`) |
| 7 | WebGPU calls on the main thread: `writeBuffer` 298, `submit` 296, `setVertexBuffer` 239 | 833 | 8% | blocking on a CPU rasteriser: the COUNT carries, the ms do not |
| 8 | visor overlay `visor-optics.js _size` → `documentElement.clientWidth` | 150 | 1.5% | a forced layout on every helmet-camera frame, before the visor-OFF early return |
| 9 | `tlx.js acquireMesh` | 228 | 2.3% | draw record → pooled mesh; already allocation-free |

Sim (`update` 2,305 ms, 23%) is Perf lane B's and is not ranked here.

## Exact counts (run A, Monaco, parked chase camera, software `skipBatches` on)

| pass | draws | triangles |
|---|---:|---:|
| main 640×360 | 31 | 142,205 |
| mirror 138×39 | 10 | 96,079 |
| post (10 passes, one triangle each) | 10 | 10 |
| frame | 51 | 238,294 |

The mirror submits 68% of the main pass's triangles into a 138×39 target (about 18 triangles a pixel). Monaco was
not in [TLX-PHONE-PASS-CENSUS-2026-10-23](TLX-PHONE-PASS-CENSUS-2026-10-23.md), whose worst case was Vegas at 42%;
that note's reopen condition (b), clipping merged world chunks to the mirror's 120 m cap per cell, is the cut that
applies. It removes geometry the mirror draws today, so it changes mirror pixels: Bryce's call.

## Leads checked and closed

- **Per-draw uniform uploads are not waste** (run D, chase camera, 90 draws per rendered frame): 55.7 uploads per
  frame. 21 are object buffers whose world matrix moved (cars and their parts); about 15 are the 128-byte render
  group, re-sent because the main, mirror and shadow cameras alternate on one buffer per program. A static world
  mesh uploads nothing.
- **Lens-flare depth gate (survey lead 5):** TLX already gates on the sun being on screen (`tlx-post.js`, the
  `PostCommon.flareTapsDepth` terms). Only WGX still keeps depth for an off-screen sun.
- **Shadow redraw (lead 3):** the sun map is snap-cached and the car and lamp maps already take cadence keeps
  (`js/render/shared/shadow-pass.js`); run A's parked window rendered no shadow pass at all.
- **Menus (lead 8):** paused SETTINGS draws at 20 Hz (`RenderRate.settle`), the title world has its own credit
  (`js/ui/home-world.js`). The results screen draws every frame, and its ceremony and orbit camera animate.

## What could land, and what stops each

| cut | expected | blocker |
|---|---|---|
| `visor-optics.js`: do not read `clientWidth` on a frame that returns at visor OFF; cache the size behind a ResizeObserver | −1.5% of the helmet frame's JS, no pixel change | the file is in open PR #5296's diff |
| HUD layout reads once per fit, not per frame | up to −4% | not rendering: HUD owner |
| mirror: per-cell clip to the cap | **landed, see below** | — |
| mirror every 2nd frame on the phone rung | about −7% of the helmet frame's JS | visible mirror cadence: needs Bryce |
| skip three's per-draw revalidation for unchanged render objects | the largest single lever (row 3) | tried as vendor patches 7 and 8 and reverted for a black screen (PERF-FINDINGS §2af); needs a device arm |
| fewer post passes (fold bright into the first down-sample) | −1 pass and submit of 15 | not bit-identical: needs a pixel A/B and Bryce |

## Landed: the mirror culls cells, not merged blocks

Bryce delegated the choice in the session ("You make decisions for me", 2026-11-18); the pick was the clip.
`tlx-chunked.js fineCells` gives a chunked record as its cells (each index a view of its block's index: no copy, no
GPU buffer of its own) and `tlx.js _drawChunked` culls that list for the mirror (merge slot 1) whenever the pass has
a draw-distance cap. The main and shadow passes keep the merged blocks. There is no separate switch (a new hand-set
key trips the writer-less key ratchet): `apex26.tlxChunkMerge=0`, a draw per chunk, turns it off with the merge.

| Monaco, parked, phone tier, TLX WebGPU (`pass-census --park --mobile --webgpu`) | mirror draws | mirror triangles | main triangles |
|---|---:|---:|---:|
| before (deploy tip, and the change with a since-removed off pin) | 10 | 96,079 | 142,205 |
| after | 10 | 25,243 | 142,205 |

What changes on screen: world scenery in the mirror now ends at the mirror's own cap (120 m on a phone, 280 m on
desktop) instead of at the edge of the 3×3-cell block that crossed it. Cars, the road and instanced props are
untouched. Not measured: GPU time, the JS time of the mirror pass after the change, and no before/after picture was
taken (software adapter). Gate: `gfx-probe --backend three --tlx-webgpu --lavapipe montreal`, plain and with
`apex26.tlxForceHw=chunked`: PASS, `gpuErrors` 0.
