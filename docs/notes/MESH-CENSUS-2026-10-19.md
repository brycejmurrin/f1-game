# Mesh census — main vs mirror × distance × source (2026-10-19)

Counting step of [#2657](https://github.com/brycejmurrin/f1-game/issues/2657) and the measurement contract of [#2631](https://github.com/brycejmurrin/f1-game/issues/2631).

Tool: `tools/perf/mesh-census.mjs` (aggregation: `tools/perf/mesh-census-lib.mjs`). **No `js/render/**` edits** — wraps `renderer.render` / `renderObject` (TLX) or WebGL `draw*` + `bindFramebuffer` (GLX) from Playwright/__apex, same shape as `tools/gfx/pass-census.mjs` (2026-10-17).

## Method

- Chase camera, parked at frac 0.1, `govHold` + `renderScale(1)`, mirror forced ON.
- Distance band: **&lt;150 m** vs **≥150 m** (world-position to camera on TLX draws).
- Source: **ribbon** (`tlxLgRoad` / road·terrain·kerb stack sites) vs **props** (`tlxBatch` / instanced / scenery) vs **other**.
- Passes: **main** and **mirror** only in the band tables. Shadow / env / post are recorded separately and never presented as the main scene (#2631 caveat).
- TLX: also `renderer.info` deltas, draw calls, and culled/total chunk split (chunk-flagged meshes drawn vs scene.traverse total).
- GLX: FBO + stack attribution; distance bands often `unknown` at the GL wrap — a labelled **build-oracle** (72 m centroid bins of props) may accompany the row.
- TLX runs stub program links under SwiftShader unless `--real-link` (method: `docs/notes/TLX-PERF-HUNT-5-2026-10-16.md`). Counts transfer; frame times do not.

```sh
node tools/perf/mesh-census.mjs --tracks monaco,monza,spa --backend both \
  --frames 40 --warm 30 --json artifacts/mesh-census/run.json --md artifacts/mesh-census/run.md
```

## Tables

_Pending the chase-camera run on this branch — replace this section with the tool's markdown output._

## Recommendation

_Pending measured tables._ Decision criteria (encoded in `recommend()`):

- **#2657 step 2 pays** when mirror ribbon ≳ 80 k tris/frame, or mirror/main ≳ 70 % with mirror mostly ribbon, or main far-ribbon share ≳ 35 % with ≳ 40 k far ribbon tris.
- **Pass first:** mirror when its ribbon mass dominates; else main-far; else none (phone-timeline only).
- **#2631 experiments:** road-chunking when culled/total is low; chunk-merge A/B when main calls ≳ 60; skip lossy prop LOD when far props dominate (quad-soup).

## Refs left

- Full-fleet `--all` sweep (52 circuits × GLX+TLX) not required for the first recommendation if monaco / monza / spa agree.
- Phone Rendering Frames timeline still decides whether the triangle cut moves the needle (Apple TBDR caveat in `docs/notes/PERF-RESEARCH-2026-10-17.md` §2.10).
