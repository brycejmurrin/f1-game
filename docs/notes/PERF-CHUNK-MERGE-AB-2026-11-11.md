# apex26.tlxChunkMerge 1 / 2 / 3 / 4 on TLX: parked counts, Monza and Spa

Kind: measurement · Re-measure-by: 2027-02-11
Summary: Chunk-merge A/B by exact parked counts (SwiftShader WebGL2): triangles rise with the factor, three's draw-call counter does not move; keep 3, timing not measured.

Issue #4680 (batch #5400). The default is 3 (`js/render/three/tlx-chunked.js` `chunkPrepareConfig`). The earlier
comparison is `docs/notes/PERF-HUNT-TLX-2026-10-17.md` (2 against 3 on monaco and spa, driven).

## What was run, and on what

`node tools/gfx/pass-census.mjs <track> --park --park-at <0.1|0.45|0.8> --ls tlxChunkMerge=<n> --frames 60 --warm 60`,
one fresh browser per arm, 24 arms, on the deploy tree at d6986f11 plus this branch's tool changes.

**Device: this container, SwiftShader, three's WebGL2 path with program links stubbed.** No GPU, so there is no timing
here at all. The numbers are counts from three's `renderer.info.render` around each top-level `render()` on a frozen,
parked frame: each pass drew the same count on every one of its 60 renders (min equals max in every cell), and the
two cells that were repeated in a second browser gave the same counts (spa 0.1, merge 2 and 3).

Helmet camera (the game's default), desktop tier. "main" is `output 640x360`, "mirror" is `output 230x66`.

| circuit | lap fraction | merge | main calls | main triangles | vs 3 | mirror calls | mirror triangles | vs 3 |
|---|---|---|---|---|---|---|---|---|
| monza | 0.1 | 1 | 60 | 123160 | -13.9 % | 23 | 18400 | -37.8 % |
| monza | 0.1 | 2 | 60 | 134991 | -5.6 % | 23 | 23441 | -20.8 % |
| monza | 0.1 | 3 | 60 | 143067 | baseline | 23 | 29595 | baseline |
| monza | 0.1 | 4 | 60 | 161729 | +13.0 % | 23 | 35030 | +18.4 % |
| monza | 0.45 | 1 | 54 | 118931 | -16.6 % | 24 | 20188 | -33.2 % |
| monza | 0.45 | 2 | 54 | 129724 | -9.0 % | 24 | 25362 | -16.1 % |
| monza | 0.45 | 3 | 54 | 142623 | baseline | 24 | 30229 | baseline |
| monza | 0.45 | 4 | 54 | 138212 | -3.1 % | 24 | 30866 | +2.1 % |
| monza | 0.8 | 1 | 38 | 53691 | -10.6 % | 22 | 27803 | -11.4 % |
| monza | 0.8 | 2 | 38 | 55981 | -6.8 % | 22 | 30433 | -3.0 % |
| monza | 0.8 | 3 | 38 | 60041 | baseline | 22 | 31367 | baseline |
| monza | 0.8 | 4 | 38 | 60876 | +1.4 % | 22 | 40399 | +28.8 % |
| spa | 0.1 | 1 | 65 | 140836 | -12.5 % | 32 | 28148 | -51.8 % |
| spa | 0.1 | 2 | 65 | 155174 | -3.6 % | 32 | 70564 | +20.7 % |
| spa | 0.1 | 3 | 65 | 160937 | baseline | 32 | 58450 | baseline |
| spa | 0.1 | 4 | 65 | 209301 | +30.1 % | 32 | 79408 | +35.9 % |
| spa | 0.45 | 1 | 60 | 187017 | -4.5 % | 34 | 35724 | -9.6 % |
| spa | 0.45 | 2 | 60 | 193584 | -1.1 % | 34 | 38276 | -3.1 % |
| spa | 0.45 | 3 | 60 | 195781 | baseline | 34 | 39509 | baseline |
| spa | 0.45 | 4 | 60 | 200955 | +2.6 % | 34 | 44320 | +12.2 % |
| spa | 0.8 | 1 | 65 | 239392 | -4.5 % | 30 | 33118 | -10.0 % |
| spa | 0.8 | 2 | 65 | 247461 | -1.3 % | 30 | 36353 | -1.2 % |
| spa | 0.8 | 3 | 65 | 250674 | baseline | 30 | 36804 | baseline |
| spa | 0.8 | 4 | 65 | 260513 | +3.9 % | 30 | 42269 | +14.8 % |

The sun shadow pass (`rt 256x256` on a software adapter) is 1 call and 15496 triangles in all 24 arms: the factor does
not reach it.

## What it shows

- **Triangles go up with the factor**, as expected (a bigger merged chunk is culled as one). Main pass, 3 over 2:
  monza +6.0 %, +9.9 %, +7.3 % at the three viewpoints, spa +3.7 %, +1.1 %, +1.3 %. 4 over 3 is another +13 % and
  +30 % at the dense viewpoints (monza 0.1, spa 0.1) and falls 3 % at one (monza 0.45), so it is not monotonic per view.
- **three's draw-call counter did not move at all**: the main pass is the same number of calls at 1, 2, 3 and 4 in
  every cell. The 2026-10-17 note measured 144 against 123 draw calls a frame for 2 against 3 with its own probe.
  The two counters are not the same thing and this note does not reconcile them; what is certain is that
  `renderer.info.render.drawCalls` cannot be used to see the benefit side of this knob.
- The mirror pass is not monotonic either (spa 0.1: 28148, 70564, 58450, 79408 triangles for 1 to 4).
- Renderer bytes (three's attribute plus index bytes): monza 27.4, 28.2, 28.6, 28.9 MB and spa 23.8, 24.8, 24.6,
  25.1 MB for 1 to 4, read at lap fraction 0.1. `geometries` is not comparable between boots (one spa arm read 148
  where its repeat read 205).

## Keep or change

**Keep 3. Inconclusive on anything stronger.** These counts price the cost side only (triangles and bytes, both small
between 2 and 3), and the benefit side (fewer draws, less render JS) is not visible in the counter this tool reads and
is a timing question in any case. A change smaller than the repeat spread counts as inconclusive, and there is no
timing spread here to compare against.

## Not measured

- **Timing on any GPU.** Would settle it: three alternating boots per arm on the phone bridge (Bryce's iPhone, TLX
  WebGPU), or `gpu-census.yml` on macos-latest with `ls=apex26.tlxChunkMerge=<n>`, one dispatch per arm.
- **The WebGPU path.** `pass-census --webgpu --park --ls tlxChunkMerge=<n>` runs these same arms on Lavapipe;
  `perf-census-webgpu.yml` does not run them.
- Largest chunk and submitted indices per chunk: `pass-census` does not read them.
