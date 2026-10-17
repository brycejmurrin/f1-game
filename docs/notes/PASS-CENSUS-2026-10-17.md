# Per-pass draw and triangle census (2026-10-17)

Tool: `tools/gfx/pass-census.mjs` (new). Counting step of #2657. Exact counts from three's `renderer.info.render`
around each top-level `render()`; never a frame time. TLX forced onto three's WebGL2 path (the iPhone's path),
program links stubbed so the scene reaches steady state under SwiftShader (method: `docs/notes/TLX-PERF-HUNT-5-2026-10-16.md`).

`node tools/gfx/pass-census.mjs monaco --frames 60 --warm 40` — monaco, chase camera, 22 cars, 640x360 viewport
(the governor sat at 0.9, so the main target reads 576x324), one run, steady state:

| pass (target) | ran per game frame | draw calls per render | triangles per render |
|---|---|---|---|
| main scene (`output 576x324`) | 0.95 | 75.9 | 177,614 |
| rear-view mirror (`rt 207x59`) | 0.95 | 31.0 | 172,617 |
| car shadow (`TLXCarShadow 256x256`) | 1.0 | 1.0 | 14,760 |
| sun shadow (`TLXSunShadow 512x512`) | 0.13 | 24.6 | 97,291 |
| post chain (14 quads, mips and blurs) | 0.05–6.65 each | 1 each | 1 each |
| **total per game frame** | | **127.3** | **377,590** |

## Reading

- **On the desktop "full" rung, the mirror pass submits 97 % of the main pass's triangles into a target of ~12,200 pixels** (207x59, against 186,624 for
  the main target): 172,617 triangles for 6.5 % of the pixels. Its draws are 31 against 76, so the cost is vertex work, not
  draw calls. This is the premise of #2657 (index LOD for the mirror first) measured: the triangle count is real and nearly
  unculled in the mirror. Whether it matters on an Apple GPU is a different question: Apple's tiled-vertex-buffer guidance says
  vertex count is not the thing to worry about (WWDC20 10602, see `docs/notes/PERF-RESEARCH-2026-10-17.md` §2.10 on PR #2658), so
  this is the count, not a verdict; the phone's Rendering Frames timeline decides.
- **Phone tier (`--mobile`, forceMobileTier, mirror "lite" rung): the mirror is still 73 % of the main pass.** Monaco, 120 frames, stubbed
  links: main 78.8 calls / 182,709 triangles at 640x360; mirror (`rt 138x39`, ~5,400 pixels) 11.8 calls / 133,282 triangles; sun shadow
  0.06 a frame; 102 calls and 322,098 triangles per game frame. The lite rung cuts mirror calls 31 → 12 (no instanced props, 180 m
  range) but only triangles 172k → 133k, so the remaining mass is road/kerb/barrier chunks drawn at full index density into a target
  of ~5,400 pixels: the case for index LOD on the mirror pass (#2657) holds on the phone tier too. Count only; the phone's timeline decides.
- Main plus mirror is 350k of the 378k triangles per game frame (93 %); the sun shadow is a rebuild-on-demand pass (0.13 a frame).
- The post chain is 14 one-draw quads (the earlier hunt's "~15 quads"): nothing to cut by count.
- Cross-check: the dust-merge census (`docs/notes/PERF-HUNT-TLX-2026-10-17.md`, monaco chase, after #2634) gave main 87–90 calls and mirror
  37 / ~148k triangles at its own viewport; this run is a different viewport and a later tree, same shape.

## Not run

Other circuits, other cameras (`--camera`), `--real-link`, the mobile tier at a phone viewport (844x390; this run kept 640x360); one run only, so no spread is claimed for the counts (they are deterministic per
frame up to the AI field's motion). No GPU or phone number.
