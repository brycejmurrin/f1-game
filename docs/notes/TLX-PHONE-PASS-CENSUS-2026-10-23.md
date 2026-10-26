# TLX phone-shaped pass census: triangles, draws, culled chunks (2026-10-23)

Step 1 of [#2657](https://github.com/brycejmurrin/f1-game/issues/2657) and the measurement half of
[#2631](https://github.com/brycejmurrin/f1-game/issues/2631), re-done for the phone (Fleet A "Phone perf" lane,
A·W41). Question: on Bryce's path (TLX, THREE PATH: WEBGPU, iPhone), is the per-frame cost in triangles, in draws,
or in neither, and does index-only LOD for distant chunks and the mirror pay?

**Decision: do not build index-only LOD now.** The counts are below, then the reasons.

## Method

```sh
node tools/perf/mesh-census.mjs --tracks monza,jeddah,vegas --backend tlx --mobile \
  --viewport 844x390 --preset medium --frames 40 --warm 30 \
  --json artifacts/mesh-census/phone-c.json --md artifacts/mesh-census/phone-c.md
```

- Deploy tip `95f836e9` plus this branch's tool changes (no `js/` change). SwiftShader, three's WebGL2 path
  (`tlxForceGL=1`), program links stubbed. **Counts transfer to a phone; times do not.** The WebGPU leg submits the
  same scene graph, so its triangle and draw counts match these.
- Phone shape: `forceMobileTier=1` (mirror on the `lite` rung, 168×48 target), GRAPHICS MEDIUM, 844×390 viewport,
  chase camera parked at frac 0.1 then driven for 30 warm-up and 40 measured frames, governor held at scale 1.
- Each render target is tabled on its own (main, mirror, sun shadow, post), so no pass is folded into the main
  scene. A shadow map that renders nested inside the main render is subtracted from the outer pass.
- Distance is the NEAREST point of each draw's bounding sphere to the player camera. **Erratum for
  [MESH-CENSUS-2026-10-19](MESH-CENSUS-2026-10-19.md):** that run measured `getWorldPosition()`, which for a
  world-baked chunk (identity transform) is the world origin, so its near/far bands said how far the camera was
  from (0,0,0), not from the chunk. Its pass totals and call counts stand; its bands and its "LOD pays" calls do not.
- One boot per circuit. Two earlier runs this session (phone-a, phone-b) gave the same pass totals within 1 %.

## Per pass, per frame

| circuit | main draws / tris | mirror draws / tris | mirror ÷ main tris | sun shadow (amortised) | chunks drawn / total (culled) |
|---|---:|---:|---:|---:|---:|
| monza | 69.9 / 103 106 | 14.0 / 30 115 | 29 % | 0.05 renders, 1.3 draws, 4 065 tris | 11.1 / 32.4 (66 % culled) |
| jeddah | 71.5 / 153 232 | 13.0 / 21 025 | 14 % | 0.05 renders, 0.8 draws, 3 827 tris | 17.1 / 33.8 (49 % culled) |
| vegas | 95.5 / 178 616 | 16.0 / 75 446 | 42 % | 0.05 renders, 0.9 draws, 7 478 tris | 21.0 / 45.2 (54 % culled) |

Post targets (bloom mips, LDR) add 6–9 single-triangle draws. Whole frame: about 92–122 draws and 137–262 k
triangles.

The sun shadow re-renders about once every 20 frames (`TLXSunShadow` 1024², 0.05 renders a frame), so one rebuild
is about 20–25 draws and 80–150 k triangles in a single frame. Amortised it is 3–4 % of the triangles; as a
one-frame spike it is a hitch question, not a throughput one.

## Where the triangles are (main pass, nearest-point distance)

Groups are meshes sharing one vertex buffer (`v<count>`); the big `v2…3xx k` groups are the chunked world (city and
props), `tlxLgRoad` is the road, `tlxBatch` are instanced props, `v16366` is the player car.

| circuit | road (`tlxLgRoad`) | chunked world < 300 m | chunked world ≥ 300 m | instanced props ≥ 600 m | car |
|---|---:|---:|---:|---:|---:|
| monza | 12 928 (4 draws) | 31 064 | 10 130 | 4 116 | 13 508 |
| jeddah | 26 032 (4 draws) | 18 693 | 53 034 | 24 791 | 13 508 |
| vegas | 26 882 (4 draws) | 20 866 | 29 840 | 71 402 | 13 508 |

(Chunked world = the `v332701`/`v37544` groups on monza, `v314413`/`v24640`/`v53376` on jeddah,
`v239749`/`v114528`/`v21602` on vegas. Sums are over the tool's top 8 groups per pass, so the instanced column is a
floor. Full per-group histograms in the `--md` output.)

The mirror is already distance-capped: the `lite` rung culls at 120 m (`js/render/shared/mirror-pass.js:78-85`), so
all its triangles read as "< 150 m". Vegas's 75 k mirror triangles are 62 k from five merged world chunks whose
boxes cross the 120 m cap; at 168×48 that is about 9 triangles a pixel.

## Why not LOD

1. **The mirror target is gone.** On 2026-10-17/19 the TLX mirror was 70–97 % of the main pass because the road was
   one whole-lap mesh in every pass. The road split (#3396, PERF-KNOWN-WINS "already landed" item 7) culls it into
   4 runs; the phone mirror is now 14–42 % of main and its road share is 6–8 k triangles.
2. **What index LOD could reach is small.** Index-only LOD works on the shared-vertex chunked meshes. Their ≥ 300 m
   triangles are 10 k (monza), 53 k (jeddah), 30 k (vegas) a frame. They are city and prop quad-soup, which
   simplifies poorly (#2657 body; vertex-cache reorder already refuted, ATVR ≈ 1.0). A realistic 50 % cut saves
   5–26 k of 103–179 k main triangles, 5–17 %.
3. **The largest far mass is not reachable by index LOD.** On the street circuits the heaviest distant group is
   instanced props (`tlxBatch`, 24-vertex boxes): at least 25 k (jeddah) and 71 k (vegas) triangles beyond 600 m. A box has
   no coarser index list; that mass needs an instance draw-distance cap, not LOD.
4. **No device evidence that geometry limits the frame.** Device Farm, iPhone 14, WebGPU leg
   ([AWS-DEVICE-FARM-IPHONE-2026-10-23](AWS-DEVICE-FARM-IPHONE-2026-10-23.md) §6): 59.4–59.7 fps at render scale
   0.5, 0.75 and 1.0, and 59.5 with the mirror off. The WebGL2 leg is fill-bound (8.07 ms per full frame of fill
   slope) and the mirror is worth about 1.7 fps there (57.4 off vs 55.7 on). The GPU timer moves with pixels
   (14.9 → 21.3 → 45.6 relative ms from scale 0.5 to 1.0), not with geometry. That run was Monza; jeddah and vegas
   carry 1.5–1.7× Monza's main triangles and have no device run yet.
5. **Draws are not the bottleneck either.** About 92–122 draws a frame, with the WebGPU leg holding 60 fps on
   iPhone 14. FRESH-HUNT #14 (collapse chunk index ranges, −60 % draws) stays parked as in PERF-KNOWN-WINS.

## What would reopen it

- A Device Farm run on **vegas or jeddah** (WebGPU, iPhone 14, MEDIUM) that drops below 60 fps with fill slope near
  0, or whose mirror-off phase gains fps on the WebGPU leg. Params for A·D1: same BENCHMARK "paths" legs as §6 of
  the Device Farm note, track `vegas`, then `jeddah`.
- If it reopens, the cheaper cuts first, both counted with this tool: (a) an instance draw-distance cap for
  `tlxBatch` props beyond ~600 m (25–71 k triangles on the street circuits), (b) clipping merged world chunks to the
  mirror's 120 m cap per cell rather than per merged block (vegas mirror 62 k → expected well under half; verify
  with `--mobile` before claiming it). Index LOD is third.

## Refs

- Tool: `tools/perf/mesh-census.mjs` (`--viewport`, `--preset`, per-target and per-group tables added here),
  helpers `tools/perf/mesh-census-lib.mjs`, tests `tests/unit/mesh-census.test.mjs`.
- Earlier counts: [MESH-CENSUS-2026-10-19](MESH-CENSUS-2026-10-19.md), [PASS-CENSUS-2026-10-17](../../docs/archive/notes/PASS-CENSUS-2026-10-17.md),
  #2657 comment of 2026-10-17 (monaco phone tier, before the road split).
- Phone evidence: [AWS-DEVICE-FARM-IPHONE-2026-10-23](AWS-DEVICE-FARM-IPHONE-2026-10-23.md),
  [PERF-KNOWN-WINS-2026-10-23](PERF-KNOWN-WINS-2026-10-23.md).
