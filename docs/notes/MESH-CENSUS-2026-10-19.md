# Mesh census — main vs mirror × distance × source (2026-10-19)

> **Erratum (2026-10-23):** the TLX near/far bands below measured each draw's `getWorldPosition()`, which for a world-baked chunk is the world origin, so they do not say how far the chunks were from the camera; the "LOD pays … main-far" calls built on them do not stand. Pass totals and call counts do. Corrected phone-shaped counts and the LOD decision: [TLX-PHONE-PASS-CENSUS-2026-10-23](TLX-PHONE-PASS-CENSUS-2026-10-23.md).

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

Run 2026-10-19 on branch tip `05df604b` (+ the summary/label fix in this commit), SwiftShader, chase camera, 40 measured frames after 30 warm-up, mirror ON, `errors: 0`, no page errors. Raw: `artifacts/mesh-census/run.{json,md}` (regenerable with the command above).

| backend · circuit | main calls / tris | mirror calls / tris | mirror/main tris | TLX chunks visible / total |
|---|---:|---:|---:|---:|
| TLX · monaco | 74.5 / 200 322 | 32.1 / 163 553 | 82 % | 10 / 35.4 |
| TLX · monza | 70.9 / 143 518 | 36.5 / 101 150 | 70 % | 9.4 / 32.5 |
| TLX · spa | 92.9 / 211 060 | 38.9 / 157 007 | 74 % | 15.8 / 45 |
| GLX · monaco | 117.4 / 195 458 | 35.6 / 59 035 | 30 % | — |
| GLX · monza | 64.3 / 103 342 | 49.4 / 82 588 | 80 % | — |
| GLX · spa | 95.9 / 157 502 | 46.2 / 77 170 | 49 % | — |

#### TLX — monaco

| pass | source | band (<150 m = near) | calls/frame | tris/frame |
|---|---|---|---:|---:|
| main | ribbon | near | 11.07 | 84094 |
| main | ribbon | far | 9 | 65660 |
| main | props | near | 11.55 | 23424 |
| main | props | far | 9.45 | 19767 |
| main | other | near | 20.65 | 4172 |
| main | other | far | 12.72 | 3205 |
| mirror | ribbon | near | 9.75 | 104274 |
| mirror | ribbon | far | 5.2 | 55199 |
| mirror | other | near | 11.22 | 2727 |
| mirror | other | far | 5.92 | 1354 |

- Pass totals: main **74.5** calls / **200322** tris; mirror **32.1** / **163553**.
- Chunks (main, TLX): visible **10** / total **35.4** (culled **25.4**).
- #2657 step 2 (index-only LOD) PAYS on counts: start with the mirror pass (mirror ribbon ≈ 159473 tris/frame into a tiny target).
  - chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable

#### TLX — monza

| pass | source | band (<150 m = near) | calls/frame | tris/frame |
|---|---|---|---:|---:|
| main | ribbon | near | 1 | 13128 |
| main | ribbon | far | 17.9 | 105222 |
| main | props | far | 20 | 20378 |
| main | other | near | 5.9 | 457 |
| main | other | far | 26.07 | 4333 |
| mirror | ribbon | far | 23.55 | 99402 |
| mirror | other | far | 13 | 1748 |

- Pass totals: main **70.9** calls / **143518** tris; mirror **36.5** / **101150**.
- Chunks (main, TLX): visible **9.4** / total **32.5** (culled **23.1**).
- #2657 step 2 (index-only LOD) PAYS on counts: start with the main-far pass (main far ribbon share 89% / 105222 tris).
  - chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable

#### TLX — spa

| pass | source | band (<150 m = near) | calls/frame | tris/frame |
|---|---|---|---:|---:|
| main | ribbon | near | 1 | 13128 |
| main | ribbon | far | 30.65 | 119703 |
| main | props | far | 26.75 | 71804 |
| main | other | near | 6 | 467 |
| main | other | far | 28.5 | 5958 |
| mirror | ribbon | far | 23.8 | 154977 |
| mirror | other | far | 15.1 | 2030 |

- Pass totals: main **92.9** calls / **211060** tris; mirror **38.9** / **157007**.
- Chunks (main, TLX): visible **15.8** / total **45** (culled **29.2**).
- #2657 step 2 (index-only LOD) PAYS on counts: start with the mirror pass (mirror ribbon ≈ 154977 tris/frame into a tiny target).
  - chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable
  - skip meshopt/lossy prop LOD — far props are large but #2657 notes quad-soup simplifies poorly; prefer instance/batch diet

#### GLX — monaco

| pass | source | band (<150 m = near) | calls/frame | tris/frame |
|---|---|---|---:|---:|
| main | ribbon | unknown | 70.33 | 120110 |
| main | props | unknown | 19.15 | 32646 |
| main | other | unknown | 27.93 | 42701 |
| mirror | ribbon | unknown | 20.45 | 34923 |
| mirror | props | unknown | 11.13 | 18990 |
| mirror | other | unknown | 4 | 5122 |

- Pass totals: main **117.4** calls / **195458** tris; mirror **35.6** / **59035**.
- #2657 step 2 does NOT clearly pay on these counts (far ribbon share unmeasured on this backend, mirror/main 30%); keep as a phone-timeline experiment only.
  - chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable

#### GLX — monza

| pass | source | band (<150 m = near) | calls/frame | tris/frame |
|---|---|---|---:|---:|
| main | ribbon | unknown | 17 | 29032 |
| main | props | unknown | 19.6 | 31786 |
| main | other | unknown | 27.73 | 42524 |
| mirror | ribbon | unknown | 25.43 | 43410 |
| mirror | props | unknown | 19.95 | 34057 |
| mirror | other | unknown | 4 | 5122 |

- Pass totals: main **64.3** calls / **103342** tris; mirror **49.4** / **82588**.
- #2657 step 2 does NOT clearly pay on these counts (far ribbon share unmeasured on this backend, mirror/main 80%); keep as a phone-timeline experiment only.
  - chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable

#### GLX — spa

| pass | source | band (<150 m = near) | calls/frame | tris/frame |
|---|---|---|---:|---:|
| main | ribbon | unknown | 44.9 | 76680 |
| main | props | unknown | 21.88 | 36410 |
| main | other | unknown | 29.13 | 44411 |
| mirror | ribbon | unknown | 21.55 | 36798 |
| mirror | props | unknown | 20.65 | 35251 |
| mirror | other | unknown | 4 | 5122 |

- Pass totals: main **95.9** calls / **157502** tris; mirror **46.2** / **77170**.
- #2657 step 2 does NOT clearly pay on these counts (far ribbon share unmeasured on this backend, mirror/main 49%); keep as a phone-timeline experiment only.
  - chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable

## Recommendation

- **#2657 step 2 (index-only LOD) pays on TLX counts, mirror pass first.** On all three circuits the TLX mirror submits 101–164 k ribbon-dominated tris/frame (monaco 159 k, spa 155 k of mirror ribbon) into a small target — 70–82 % of the main pass. Monza alone ranks main-far first (89 % of main ribbon is ≥ 150 m, 105 k tris), with its mirror ribbon (99 k) close behind; a mirror-first cut still helps it.
- **GLX is not a counter-example.** GLX distance bands are `unknown` at the GL wrap, so its far share is unmeasured, not 0 %; its mirror ribbon (35–43 k) is below the 80 k threshold because GLX's mirror already submits less (30–80 % of main). Index LOD on GLX stays a phone-timeline experiment.
- **#2631:** main-pass calls are ≥ 60 on every TLX run (71–93) → the chunk-merge factor A/B is measurable. TLX already culls 65–72 % of road chunks, so road chunking (§2) is not the next experiment. Spa's far props (72 k tris) suggest an instance/batch diet over lossy prop LOD.
- Counts only: whether the mirror cut moves frame time on a phone still needs the Rendering Frames timeline (TBDR caveat below).

Decision criteria (encoded in `recommend()`):

- **#2657 step 2 pays** when mirror ribbon ≳ 80 k tris/frame, or mirror/main ≳ 70 % with mirror mostly ribbon, or main far-ribbon share ≳ 35 % with ≳ 40 k far ribbon tris.
- **Pass first:** mirror when its ribbon mass dominates; else main-far; else none (phone-timeline only).
- **#2631 experiments:** road-chunking when culled/total is low; chunk-merge A/B when main calls ≳ 60; skip lossy prop LOD when far props dominate (quad-soup).

## Refs left

- Full-fleet `--all` sweep (52 circuits × GLX+TLX) not required for the first recommendation if monaco / monza / spa agree.
- Phone Rendering Frames timeline still decides whether the triangle cut moves the needle (Apple TBDR caveat in `docs/notes/PERF-RESEARCH-2026-10-17.md` §2.10).
