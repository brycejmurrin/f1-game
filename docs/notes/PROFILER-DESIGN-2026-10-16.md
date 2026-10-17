# Profiler design — spans, one CLI, A/B diff (2026-10-16)

Goal: answer "where does the frame go, and did my change move it?" without reading a flame chart.

## What already existed (reused, not rebuilt)

| Tool | Answers |
|---|---|
| `tools/shot/profile-gameloop.mjs` | V8 sampling profile, top self time |
| `tools/gfx/frame-hitch.mjs` | per-rAF callback cost, spike period, heap sampling |
| `tools/gfx/mem-census.mjs` | memory census |
| `js/perf/race-entry-profile.js` | marks + longtask ring at race entry |
| `PerfGov.frameStats()` / `__apex.perf()` | frame-time ring (p50/p95/p99), governor view |
| `__apex.gpuTimer()` | GLX `EXT_disjoint_timer_query` frame total; TLX `resolveTimestampsAsync("render")` |

Gaps: no per-subsystem budget, no A/B, nothing over MCP, GPU timing is frame-level only.

## Built

1. **`js/perf/spans.js` (`PerfSpans`)** — `begin(name)/end(name)`; fixed 512-sample `Float64Array` ring per span; OFF by
   default (one boolean test per call); a span's ring is allocated once on first sight. `measure(true)` also emits
   `performance.measure("apex:<name>")` so phases appear as User Timing in Chrome/Perfetto (allocates; opt-in).
   Long Animation Frames observer (`long-animation-frame`, Chrome 123+, feature-detected) keeps the last 32 entries with
   their top 4 scripts. Spans wrapped in `game.js` `tick`/`tickBody`/`update`: `frame input physics ai collide camera render hud`
   (`ai` is the whole per-car `updateCar` loop — AI and player; `physics` contains `ai` and `collide`). The game.js change adds
   no lines: each pair sits on the line it brackets.
   `__apex.perf({on,reset,measure})` extends the existing hook: the old `renderScale()` shape is unchanged; `spans`, `loaf`, `gpu`
   are added while recording or when options are passed.
2. **`tools/perf/profile.mjs`** — `--mode spans|cpu|hitch|trace`. Scenario: `race(track)`, `go()`, `jump(0.1,55,0)`,
   throttle + frame-indexed steer sine, 20 warm-up frames, N measured rAF frames. `--repeat N` = N fresh pages; reports the median
   of each stat and the spread (max−min). `--base <ref>` runs the identical scenario on an ephemeral `git worktree` at `<ref>` and
   prints a delta table. **Noise rule** (`tools/perf/lib.mjs`): a delta no larger than the larger spread is `noise`; with
   `--repeat 1` every verdict is `unproven`. A base predating `PerfSpans` only has the `raf` cadence row (recorded in-page on every ref).


## Caveats

- This container is SwiftShader: CPU JS cost is meaningful, GPU/fill numbers are not. `render` span here is mostly command
  encoding plus software-raster sync; do not quote it as a player's GPU cost.
- rAF cadence headless is compositor-driven; the span durations (not the intervals) are the signal.

## Step 4 — GPU per pass (research)

Sources: three.js forum "WebGPU r181: stats-gl no longer compatible with WebGPU"
(https://discourse.threejs.org/t/webgpu-r181-fyi-stats-gl-no-longer-compatible-with-webgpu/87944), three docs
`WebGPUTimestampQueryPool` (https://threejs.org/docs/pages/WebGPUTimestampQueryPool.html), MDN `GPUQuerySet`
(https://developer.mozilla.org/en-US/docs/Web/API/GPUQuerySet).

Measured on the tree:
- `vendor/three-0.186.1/three.webgpu.min.js` contains `Inspector`, `TimestampQueryPool`, `trackTimestamp`, `resolveTimestampsAsync`,
  `timestampWrites` — the timestamp plumbing is in the core bundle. The Inspector **UI addon is not vendored** (`addons/` has only
  `tsl`, `webxr`), so a drop-in Inspector panel would need a vendor addition plus a licence/`MANIFEST.json` entry.
- TLX already sets `renderer.backend.trackTimestamp` and awaits `resolveTimestampsAsync("render")` (`tlx.js` ~1074/4152): frame-level
  `render` total, with `compute` available the same way. On the WebGL2 fallback three disables timestamp tracking (forum + r181 example).
- WGX already requests `timestamp-query` when the adapter offers it (`wgx.js` ~576–608) but uses no `timestampWrites`.

Not done (needs real hardware, software probes are no evidence): per-pass `timestampWrites` in WGX
(`querySet` → `resolveQuerySet` → buffer → `mapAsync`), and per-pass GLX queries (GLX exposes one `TIME_ELAPSED_EXT` per frame;
nested elapsed queries are not allowed in WebGL2, so per-pass there means sequential non-overlapping queries per pass).
Verdict path: dispatch `gpu-census.yml` on `macos-latest` and read its Verdict step.

## MCP surface (as shipped)

- `apex_job_start {kind:"profile", track, mode, frames, repeat, base}` — the browser run, a background job behind the already-guarded
  `apex_job_start` door (poll `apex_job_status`). It reuses the browser lock the other job kinds take.
- `apex_profile_query {file, compare?, top?, fn?, fileFilter?}` — tree kind: summarise a saved spans JSON or `.cpuprofile`, or
  compare two spans JSONs. Artifacts under `artifacts/` or `scratch/` only; never a raw profile.
- A standalone `apex_profile` browser tool was built and dropped: `bash-guard-hardening.test.mjs` requires every browser-kind
  MCP tool in the `.claude/settings.json` matcher, `mcp-browser-guard.sh` and `shellparse.py` `APEX_BROWSER`, which this lane may not edit.
  Follow-up (needs a `.claude` owner): add `profile` to those three lists, then promote `apex_profile` to a direct tool.

## Measured on this container (SwiftShader), 2026-10-16

- Rendered frames cost 3–9 s of wall time (the GPU process rasterises; main-thread `tickBody` is a few ms), so the scenario runs at
  320x180 (`profile.mjs` VIEWPORT) with the headless soft-blit readback off (`apex26.wgxCapture=0`, as `frame-hitch.mjs` does;
  `--capture` restores it) and a 40-frame default: ~3 s a frame, ~2.5 min per repeat plus a ~1 min boot.
- vegas, 40 frames x 2 repeats, TLX default backend (ms): physics p50 6.25 / p95 14.4; ai p50 0.95 / p95 3.3 (per `updateCar` loop);
  hud p50 0.65 / p95 14; input 0.1; collide 0.05. `render` (p50 8, p95 2968) is dominated by the synchronous software-raster wait
  in the slow frames: do not read it as a CPU cost. `raf` cadence is the compositor and is reported but never judged.
- Two repeats are not a noise floor: a first A/B printed a "WIN" on `raf` inside its own spread. The verdict rule now needs
  3+ repeats on both sides (`MIN_REPEATS`), and `raf` is `info`.
- The deploy branch predates `PerfSpans`, so `--base origin/claude/f1-game-project-26h3ng` only carries the `raf` row; per-span deltas
  need a base that includes this PR.

## Overlap

Another session (`cursor/three-inspector-*`) is vendoring the three.js Inspector addon as an opt-in TLX dev panel and will add a
`gpuTimer` interlock in `tlx.js` (both use `backend.trackTimestamp`). This PR does not touch `tlx.js`; see `docs/notes/THREE-INSPECTOR-2026-10-16.md` (landed on the deploy branch).
