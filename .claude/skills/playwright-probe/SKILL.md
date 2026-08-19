---
name: playwright-probe
description: Use when the user asks for batch headless screenshots or evals of a track or car (shot.mjs, apex-capture.mjs, apex-eval.mjs), before/after frames, or Playwright headless probes. For hook catalogs use agent-view; for camera semantics use debug-cameras; for a live canvas use mcp-probe. WGX on SwiftShader: use gfx-probe.mjs for visible #game (soft-present blit), not raw canvas screenshots. Live version.json is deploy-research or mcp-probe deploy-check.
---

# Headless Playwright probing (parallel)

## Prerequisites (always)

Before any shot/eval, ensure the environment is ready:

```bash
bash .claude/skills/apex-env-setup/scripts/ensure-apex-env.sh
# or: bash tools/cloud-agent-install.sh
# or follow the apex-env-setup skill
```

If browsers or `node_modules/playwright` are missing, probes will fail. See **apex-env-setup**.

Interactive resize / DOM / CSS survey is **Playwright MCP**
(`tools/playwright-mcp.sh`, skill `survey-ui-matrix`), not this batch harness.
One-screen CSS edit + hot-swap + structured DOM dump is **css-play**
(`tools/css-play.mjs` / `playwright-mcp.sh play|dom`).

The renderer runs deterministically headless under SwiftShader, so you can drive
the real game and the `__apex` API from Node to validate cameras, modes, tracks,
and physics — and capture screenshots to prove it visually. Two committed tools
cover most needs; drop to a custom harness for bespoke sweeps.

## Committed tools (use these first)

```sh
# Same CLIs via MCP (takes scratch/apex-browser.lock; apex_status first):
#   ./tools/apex-tools-mcp.sh call apex_eval '{"track":"monza","expr":"a.info()"}'
#   ./tools/apex-tools-mcp.sh call apex_shot '{"track":"monza","frac":0.1}'
#   ./tools/apex-tools-mcp.sh call apex_carshot '{"tod":"day"}'
#   ./tools/apex-tools-mcp.sh call apex_quick_validate '{}'
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

See `references/recipes.md` for UI/DOM shots, camera fanout, and harness skeletons.
