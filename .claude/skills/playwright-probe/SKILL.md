---
name: playwright-probe
description: Use when the user asks for batch headless screenshots or evals of a track or car (shot.mjs, apex-capture.mjs, apex-eval.mjs), before/after frames, or Playwright headless probes. For hook catalogs use agent-view; for camera semantics use debug-cameras; for a live canvas use mcp-probe. A blank WGX canvas in-container is expected (webgpu-debug); live version.json is deploy-research or mcp-probe deploy-check.
---

# Headless Playwright probing (parallel)

The renderer runs deterministically headless under SwiftShader, so you can drive
the real game and the `__apex` API from Node to validate cameras, modes, tracks,
and physics — and capture screenshots to prove it visually. Two committed tools
cover most needs; drop to a custom harness for bespoke sweeps.

## Committed tools (use these first)

```sh
# One-off: boot the game, evaluate an __apex expression, print JSON.
node tools/apex-eval.mjs <track> "<expr>"        # `a` = __apex; async ok; --raw for full JSON
node tools/apex-eval.mjs monaco "a.camera()"
node tools/apex-eval.mjs spa    "({c:a.corners().length, w:a.wallStats()})"

# Parallel screenshot validation (writes PNGs + a blank/fail manifest):
node tools/capture/apex-capture.mjs cameras [track] [outdir]   # 12 camera modes (see below; omits drift)
node tools/capture/apex-capture.mjs modes   [outdir]           # menu / race day,wet,night / results / time-trial
node tools/capture/apex-capture.mjs tracks  [outdir] [id ...]  # one orbit shot per circuit
```

## Single framed screenshot (`shot.mjs`)

For ONE deterministic shot, use the helper in this skill folder — it boots a
server, waits for `__apex`, freezes the scene, frames the camera, writes a PNG:

```sh
node .claude/skills/playwright-probe/shot.mjs <trackId> <frac> [cam] [out.png] \
  [--az N] [--el N] [--dist N] [--side -1|1] [--tod day|dusk|dawn|night] [--hud]
# cam = orbit | eye | cinematic | trackside | park
node .claude/skills/playwright-probe/shot.mjs monaco 0.18 orbit  scratch/captures/playwright-probe/monaco-chicane.png
node .claude/skills/playwright-probe/shot.mjs spa    0.07 eye    scratch/captures/playwright-probe/eau-rouge.png
# Paddock / baked-model framing (az/el/dist; never snapCam after free-cam):
node .claude/skills/playwright-probe/shot.mjs monza 0.97 orbit out.png --az -105 --el 26 --dist 110
# Full Monza/Spa bakedModel gallery:
node tools/capture/baked-scenery.mjs --out /opt/cursor/artifacts/baked-models
```

`shot.mjs` prefetches `Assets.loadModels()` before `race()` so `bakedModel()`
placements are in the mesh, and only calls `snapCam()` for `cam=park` (free-cam
modes set `G.dbgCam` instantly — `snapCam` would clear them back to chase).

**Viewport gotcha:** `shot.mjs` uses **1280×720** (wide survey frame). In-race
Playwright **specs** use landscape **844×390** to avoid the `#rotate-device`
overlay — don't copy the spec viewport into `shot.mjs` or vice versa.

**Corner fractions:** don't hardcode folklore chicane numbers — probe first:
`__apex.trackInfo({what:"corners"})`, `__apex.corners()`, or `js/track/markings.js`
(`CircuitMarkings` curated apexes). Official FIA turns ≠ curvature peaks (see
**debug-tracks**).

A blank/dark canvas comes out < ~5 KB; a real 3D frame is tens of KB (the
suite's non-blank heuristic). For the full camera-hook reference
(park/freeze/eyeAt/orbit/view/cinematic/carOrbit/previewCam) see
**debug-cameras**; add `setTimeOfDay`/`weather` calls for lighting variants.
For before/after: capture with the same `(track, frac, cam)` args on each side
of the change so only the pixels you care about differ. Output goes under `scratch/captures/playwright-probe/` by default (and `apex-capture` defaults to `scratch/captures/apex-capture/<purpose>/`) — don't commit throwaway screenshots; visual-regression baselines
under `tests/` are updated only via `npx playwright test --update-snapshots`.


---

## Load on demand

- UI/DOM shots, 12-mode camera fanout, environment gotchas, custom-harness skeleton, shared fixtures → [references/recipes.md](references/recipes.md).
