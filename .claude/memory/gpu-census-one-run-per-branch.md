---
name: gpu-census-one-run-per-branch
description: "gpu-census.yml runs one dispatch per branch at a time — a second dispatch QUEUES behind the first, a third replaces the queued second, so dispatch A/B arms one at a time"
metadata:
  node_type: memory
  type: project
  originSessionId: 8f70d254-4890-5a54-8f62-17db2ca499da
  modified: 2026-10-14T16:00:00.000Z
---

`gpu-census.yml` has a per-branch concurrency group. Until 2026-10-14 a second
dispatch on the same branch CANCELLED the first (PR #1487: arm A run 463
cancelled seconds after arm B run 464 was queued). Since the gpu-census-trim
change (`cancel-in-progress` only for the nightly, which has its own group) a
second dispatch waits as `pending` — but GitHub keeps ONE pending run per group,
so a THIRD dispatch cancels the queued second. Each macOS run takes ~6 min.

**Why:** an A/B pair (default vs `ls apex26.<knob>=0`) dispatched back to back
used to lose its first arm silently; with three or more arms the middle one
still can.

**How to apply:** dispatch one arm, wait for `completed` (`gh run view <id> --json status`),
then dispatch the next. Read arms with `gh run download <id>` and
`spikeWork.inRest['gpu.passEnd'] / restFrames`, `window.fps`, `hitch`, `gapWork` in
`game-wgx-macos-latest.json`. Expect run-to-run runner variance larger than most
knobs (each arm had one ~35 fps and one ~25 fps run on 2026-10-14), so pair at
least two runs per arm and read counts (passes, bytes, gpuErrors), not fps.
An `ls` that sets `apex26.wgxCapture` to anything but 0 turns the Verdict's
TLX softBlit / WGX softPresent gates into report-only rows for that run.
