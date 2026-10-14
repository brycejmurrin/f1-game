---
name: replay-camera
description: "Use when WATCH/HIGHLIGHTS or replay camera motion snaps, keeps an old follow anchor or reframes after a seek, follow change, exit or re-entry (serialized probe). New camera motion → f1-animation-cameras; wrong driver → data-hub."
---

# Replay camera lifecycle

Use the offline contract first, then a parent-owned browser probe. This workflow
covers entry → seek → follow → exit → reentry; a fresh race screenshot alone
cannot establish anchor ownership across those transitions.

## Workflow

1. `node tools/check/skill-smoke.mjs --skill replay-camera --plan`
2. `node tools/check/skill-smoke.mjs --skill replay-camera --check`
3. `node tools/shot/replay-camera-probe.mjs --fixture default --track baku --backend three --viewport 640x360 --frames 1 --seed 42 --timeout-ms 900000 --out artifacts/replay-camera --plan`
4. When a browser is available and no other rendering run is active (AGENTS.md
   rules 4, 7, 8), the parent runs the same probe without `--plan` as ONE
   background Bash task, log in `artifacts/logs/replay-camera.log`. If it fails
   on a missing `ffmpeg-<revision>`, install it first
   ([prerequisites](references/diagnosis.md)). Review every phase's frame/camera
   anchors and pixels, including exit and reentry. Preserve failure receipts.

Where the anchor lives, fields to diff, non-Baku fixtures: [diagnosis](references/diagnosis.md).
See [the fixture and evidence contract](references/workflow.md). Delegate only
fixture review or artifact analysis. Software captures establish that session's
render behavior; native WebGPU/device behavior needs its own run.
