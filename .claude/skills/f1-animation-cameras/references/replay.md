# Replay camera lifecycle

Folded from the retired `replay-camera` skill (2026-10-14). Load this when
WATCH/HIGHLIGHTS or replay camera motion snaps, keeps an old follow anchor or
reframes after a seek, follow change, exit or re-entry. WATCH loading the wrong
driver or race is **data-hub**.

Use the offline contract first, then a parent-owned browser probe. This workflow
covers entry → seek → follow → exit → reentry; a fresh race screenshot alone
cannot establish anchor ownership across those transitions.

## Workflow

1. `node --test --test-name-pattern "replay fixture plan is offline and bounded" tests/unit/capture-tools-regressions.test.mjs`
   (the bounded offline replay-fixture contract).
2. `node tools/shot/replay-camera-probe.mjs --fixture default --track baku --backend three --viewport 640x360 --frames 1 --seed 42 --timeout-ms 900000 --out artifacts/replay-camera --plan`
3. When a browser is available and no other rendering run is active (AGENTS.md
   rules 4, 7, 8), the parent runs the same probe without `--plan` as ONE
   background Bash task, log in `artifacts/logs/replay-camera.log`. If it fails
   on a missing `ffmpeg-<revision>`, install it first
   ([prerequisites](replay-diagnosis.md)). Review every phase's frame/camera
   anchors and pixels, including exit and reentry. Preserve failure receipts.

Where the anchor lives, fields to diff, non-Baku fixtures: [diagnosis](replay-diagnosis.md).
See [the fixture and evidence contract](replay-workflow.md). Delegate only
fixture review or artifact analysis. Software captures establish that session's
render behavior; native WebGPU/device behavior needs its own run.
