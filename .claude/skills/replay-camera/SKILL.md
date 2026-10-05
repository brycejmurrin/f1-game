---
name: replay-camera
description: "Use when WATCH/HIGHLIGHTS or replay camera motion snaps, keeps an old follow anchor or reframes after a seek, follow change, exit or re-entry (serialized probe). New camera motion → f1-animation-cameras; wrong driver → data-hub."
---

# Replay camera lifecycle

Use the offline contract first, then a parent-owned browser probe. This workflow
covers entry → seek → follow → exit → reentry; a fresh race screenshot alone
cannot establish anchor ownership across those transitions.

## Prerequisites

The live probe uses compositor video recording to keep headless render frames
advancing. It requires Playwright's ffmpeg alongside Chromium; a missing
`ffmpeg-<revision>` executable fails before page creation. Install it in the
writable cache selected by the shared discovery helper, and use that same
`PLAYWRIGHT_BROWSERS_PATH` for the live run:

```sh
apex_browser_cache="$(node tools/lib/chromium-path.mjs --cache-path)" &&
  PLAYWRIGHT_BROWSERS_PATH="$apex_browser_cache" npx playwright install ffmpeg
```

## Workflow

1. `node tools/check/skill-smoke.mjs --skill replay-camera --plan`
2. `node tools/check/skill-smoke.mjs --skill replay-camera --check`
3. `node tools/shot/replay-camera-probe.mjs --fixture default --track baku --backend three --viewport 640x360 --frames 1 --seed 42 --timeout-ms 900000 --out artifacts/replay-camera --plan`
4. When a browser is available and no other rendering run is active, the parent
   runs the same probe without `--plan`. Review every phase's frame/camera
   anchors and pixels, including exit and reentry. Preserve failure receipts.

See [the fixture and evidence contract](references/workflow.md). Delegate only
fixture review or artifact analysis. Software captures establish that session's
render behavior; native WebGPU/device behavior needs its own run.
