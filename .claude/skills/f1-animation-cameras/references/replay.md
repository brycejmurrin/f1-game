# Replay camera lifecycle

Load this when
WATCH/HIGHLIGHTS or replay camera motion snaps, keeps an old follow anchor or
reframes after a seek, follow change, exit or re-entry.

Use the offline contract first, then a parent-owned browser probe. This workflow
covers entry → seek → follow → exit → reentry; a fresh race screenshot alone
cannot establish anchor ownership across those transitions. WATCH loading the wrong
driver or race is **data-hub** (one home: this file).

## Workflow

1. `node --test --test-name-pattern "replay fixture plan is offline and bounded" tests/unit/capture-tools-regressions.test.mjs`
   (the bounded offline replay-fixture contract).

**HIGHLIGHTS is not what the probe runs.** `replay-camera-probe.mjs` launches
`RealRace.launch(…, { watch: true })` with no `reel: true`, so `run.reel` is null and a seek
takes the WATCH path. A HIGHLIGHTS seek bug never reproduces there, and `ok: true` proves
nothing about it. For HIGHLIGHTS, launch in the live page with `{ watch: true, reel: true }`
(skill mcp-probe), or pin `seekTo` with a reel in a node test (`reelFor`/`highlightsFor` are
exported pure functions in `js/race/real-replay.js`).

**A seek snap is designed** ([diagnosis](replay-diagnosis.md)). Before changing code, ask which one
the user saw: the snap itself (by design), the wrong subject after it (follow/lock), or a bad
blend after the snap.

2. `node tools/shot/replay-camera-probe.mjs --fixture default --track baku --backend three --viewport 640x360 --frames 1 --seed 42 --timeout-ms 900000 --out artifacts/replay-camera --plan`
3. When a browser is available and no other rendering run is active (AGENTS.md
   rule 4), the parent runs the same probe without `--plan` as ONE
   background Bash task, log in `artifacts/logs/replay-camera.log`. If it fails
   on a missing `ffmpeg-<revision>`, install it first
   ([prerequisites](replay-diagnosis.md)). Review every phase's frame/camera
   anchors and pixels, including exit and reentry. Preserve failure receipts.
   Then a second run at Bryce's phone shape (`--viewport 844x390`): WATCH is
   used on the phone. A motion bug (snap then ease) needs `--frames` ≥ 8: one frame per
   phase cannot show it.

Where the anchor lives, fields to diff, non-Baku fixtures: [diagnosis](replay-diagnosis.md).
See [the fixture and evidence contract](replay-workflow.md). Software captures establish that session's
render behavior; native WebGPU/device behavior needs its own run.
