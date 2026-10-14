---
name: gpu-census-one-run-per-branch
description: "gpu-census.yml runs one dispatch per branch at a time — a second dispatch cancels the first, so A/B arms must be dispatched sequentially"
metadata:
  node_type: memory
  type: project
  originSessionId: 8f70d254-4890-5a54-8f62-17db2ca499da
  modified: 2026-10-14T07:06:01.559Z
---

`gpu-census.yml` has a per-branch concurrency group: dispatching a second run on the
same branch while the first is still `pending`/`in_progress` CANCELS the first
(2026-10-14, PR #1487: arm A run 463 cancelled seconds after arm B run 464 was
queued). Each macOS run takes ~6 min.

**Why:** an A/B pair (default vs `ls apex26.<knob>=0`) dispatched back to back
silently loses its first arm; the cancelled run shows up only in the Actions list.

**How to apply:** dispatch one arm, wait for `completed` (`gh run view <id> --json status`),
then dispatch the next. Read arms with `gh run download <id>` and
`spikeWork.inRest['gpu.passEnd'] / restFrames`, `window.fps`, `hitch`, `gapWork` in
`game-wgx-macos-latest.json`. Expect run-to-run runner variance larger than most
knobs (each arm had one ~35 fps and one ~25 fps run on 2026-10-14), so pair at
least two runs per arm and read counts (passes, bytes, gpuErrors), not fps.
