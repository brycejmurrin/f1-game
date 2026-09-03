---
name: playwright-probe
description: Use when the user asks for batch headless screenshots or evals of a track or car (shot.mjs, apex-capture.mjs, apex-eval.mjs), before/after frames, Playwright headless probes, flicker/shimmer/z-fighting while driving (a recorded driven clip via motion-capture.mjs), or a game-loop CPU profile / flame chart / GC spikes (profile-gameloop.mjs). For hook catalogs use agent-view; for camera semantics use debug-cameras; for a live canvas use mcp-probe. WGX on SwiftShader: use gfx-probe.mjs for visible #game (soft-present blit), not raw canvas screenshots. Live version.json is deploy-research.
---

# Headless Playwright probing (parallel)

## Prerequisites (always)

A fresh container needs the browser before any shot/eval — AGENTS.md
§Verification 1:

```bash
bash tools/env/cloud-agent-install.sh
# or: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install && npx playwright install chromium-headless-shell
```

`browserType.launch: Executable doesn't exist` means the browser is missing;
"Cannot find module" means `npm install` is.

Interactive resize / DOM / CSS survey is the **playwright-official** MCP
(`browser_*`, skill `survey-ui-matrix`), not this batch harness.
One-screen CSS edit + hot-swap + structured DOM dump is **css-play**
(`tools/ui/css-play.mjs` / `playwright-mcp.sh play|dom`).

The renderer runs deterministically headless under SwiftShader, so you can drive
the real game and the `__apex` API from Node to validate cameras, modes, tracks,
and physics — and capture screenshots to prove it visually. Two committed tools
cover most needs; drop to a custom harness for bespoke sweeps.

## Committed tools (use these first)

```sh
# Same CLIs via MCP (takes scratch/apex-browser.lock; apex_status first):
#   ./tools/apex-tools-mcp.sh call apex_eval '{"track":"monza","expr":"a.info()"}'
#   ./tools/apex-tools-mcp.sh call apex_shot '{"track":"monza","frac":0.1}'
# Plain CLIs (no wrap since 2026-09): tools/car/carshot.mjs, tools/check/quick-validate.mjs
# One-off: boot the game, evaluate an __apex expression, print JSON.
node tools/apex-eval.mjs <track> "<expr>"        # `a` = __apex; async ok; --raw for full JSON
node tools/apex-eval.mjs monaco "a.camera()"
node tools/apex-eval.mjs spa    "({c:a.corners().length, w:a.wallStats()})"

# Parallel screenshot validation (writes PNGs + a blank/fail manifest):
node tools/capture/apex-capture.mjs cameras [track] [outdir]
node tools/capture/apex-capture.mjs modes   [outdir]
node tools/capture/apex-capture.mjs tracks  [outdir] [id ...]
```

## Single framed screenshot (`shot.mjs`)

```sh
node tools/capture/shot.mjs <trackId> <frac> [cam] [out.png] \
  [--az N] [--el N] [--dist N] [--side -1|1] [--tod day|dusk|dawn|night] [--hud]
```

## Motion and profiling (still this harness)

```sh
node tools/capture/motion-capture.mjs monaco 4 50      # driven clip → per-frame flicker score (trust p90)
node tools/profile-gameloop.mjs singapore render        # .cpuprofile → Chrome DevTools → Performance
```

A still frame cannot show shimmer and a CPU chart cannot see fill-bound work —
both references say what the numbers mean before you A/B on them.

## Load on demand

- UI/DOM shots, camera fanout, env gotchas, harness skeletons →
  [references/recipes.md](references/recipes.md).
- Flicker / z-fighting / shadow shimmer while driving — why headless rAF
  freezes, the `recordVideo` fix, reading `p90` →
  [references/motion-capture.md](references/motion-capture.md).
- Frame-budget hog, GC jitter, slow track build, flame-chart symbols →
  [references/perf-profile.md](references/perf-profile.md).
