# D·W24b — profiling tools & DEV tiles survey

Report-only. **No code in this PR.** Tip surveyed (findings) on
`82e4ad4b3`; resumed and synced to deploy tip
`c44627de1` (`claude/f1-game-project-26h3ng`) after #3689/#3691 merged
(`surveys/` index on tip — this PR does not edit `docs/README.md`).

**Ask (Bryce 5:54 PM PT):** ways to improve logging, tiles, tests and Device Farm
test types for better profiling. This lane owns **tools & DEV tiles** (GPU
profiler, perf overlays, agent-world API, capture/evidence). Sister surveys:
W24a logging, W24c tests, W24d Device Farm test types.

**Instruments:** static read of `js/perf/*`, `js/agent/*`, `tools/perf/`,
`tools/shot/`, `tools/gfx/pass-census.mjs`, `docs/DEBUG-HOOKS.md`,
`docs/notes/PROFILER-DESIGN-2026-10-16.md`, `docs/notes/BENCH-CAPTURE-2026-10-23.md`,
`docs/notes/MEASURING-GPU-PERF-2026-09-16.md`. No Device Farm jobs (no spend).
SwiftShader numbers are not player GPU evidence.

**Fleet paths (from brief):** Fleet **A** owns `governor.js`, TLX chunk/LOD/mirror,
race, physics, `game.js`, `index.html`. Fleet **D** owns other perf, iOS, tools,
UI, save. Proposed owners below follow that split.

### Source map (tip line refs)

| surface | path | lines (tip) |
|---|---|---|
| METRICS pages / narrow GOV | `js/perf/metrics-overlay.js` | 22–23, 35, 262–267, 653–676, 773–813, 1190+ |
| `__apex.frametimeBench` / `stats` / `gpuTimer` / `perf` / `gpuCapture` | `js/agent/apex.js` | 933–935, 1476–1489, 1672–1686, 2317–2346 |
| Spector / webgl-lint capture | `js/agent/apex-gpu-capture.js` | 1–4 |
| PerfSpans rings | `js/perf/spans.js` | 95–125 |
| Phone soak (spans in JSON; GPU timer untouched) | `js/perf/phone-recorder.js` | 1–20, 169–171 |
| WGX lit-pass-only timer | `js/render/webgpu/wgx.js` | 5020–5022 |
| GLX timer / iOS caveat | `js/render/glx/glx.js` | 100–108 |
| Phone GPU TEST unsupported | `js/perf/gpu-test-run.js` | 14–16 |
| Shot timings = wall only | `tools/shot/apex-capture.mjs` | 149–166 |
| Evidence manifest = provenance | `tools/shot/publish-evidence.mjs` | 60–65, 106 |
| Opaque `r12` pass IDs | `js/perf/bench-capture.js` | 57–65 |
| Pass-census SwiftShader | `tools/gfx/pass-census.mjs` | 16–17 |
| profile.mjs SwiftShader caveat | `tools/perf/profile.mjs` | 24–25 |
| Agent-world stub | `docs/AGENT-WORLD-API.md` | 1–6 |
| Per-pass GPU still open (I5) | `docs/notes/MEASURING-GPU-PERF-2026-09-16.md` | 143–150 |

---

## Ranked findings (impact first, max 10)

### 1. METRICS has no live frame-budget / PerfSpans page

**Problem:** Player DEV tile pages are only `gov|car|phys|log`
(`js/perf/metrics-overlay.js:35`). `PerfSpans` (input/physics/ai/collide/camera/render/hud)
is already recorded into phone-soak JSON (`js/perf/phone-recorder.js:169–171`) and
exposed via `__apex.perf({on:true})` (`js/agent/apex.js:1672–1686`), but never
painted on the overlay. On-device hitch diagnosis still needs SHARE → file → laptop.

**Evidence:** `js/perf/metrics-overlay.js:35`; `js/perf/phone-recorder.js:169–171`;
`js/agent/apex.js:1672–1686`; `js/perf/spans.js:95–125`.

**Proposed change:** Add `PAGE=spans` (or a GOV subsection) showing p50/p95 per
span + LoAF count; optional `?metricsPage=spans`. Keep PhoneRecorder’s GPU-timer
off default.

**Size:** M · **Fleet D** (`js/perf/metrics-overlay.js`; UI)

---

### 2. `GameMetrics` is not scriptable via `__apex`

**Problem:** Agents get `__apex.frametimeBench` and a separate `__apex.stats()`
DOM HUD (`js/agent/apex.js:933–935`, `:2317–2346`). There is no
`__apex.metrics({on,page,snapshot})` wrapping the player METRICS panel, so
automation cannot drive the same tile a human screenshots, and `GameMetrics.snapshot()`
stays console-only.

**Evidence:** `js/agent/apex.js:933–935`, `:2317–2346`;
`js/perf/metrics-overlay.js:192` (`snapshot`), `:1190+` (exports);
`docs/DEBUG-HOOKS.md` documents `stats` / `frametimeBench`, not a metrics driver.

**Proposed change:** Expose `__apex.metrics(on|{page,pos,size,snapshot})` over
`GameMetrics`; keep `stats` as a thin alias or deprecate toward the same panel.

**Size:** M · **Fleet D** (`js/agent/apex.js` + `js/perf/metrics-overlay.js`)

---

### 3. Narrow (phone) GOV drops the profiling rows

**Problem:** At `size===s` or short aspect, GOV paints fps/ms/tier/gfx only and
omits `gpuMs`, `budget`, `scale`, `strikes`, `tierFloor` that the wide layout
shows (`js/perf/metrics-overlay.js:653–661` vs `:663–676`). Default phone size
is S, so screenshots and live phone play lose the columns that answer
“GPU vs shed vs strike.”

**Evidence:** `js/perf/metrics-overlay.js:653–676`.

**Proposed change:** Keep a 2-line core on narrow: `fps/ms · gpu · scale/tier`;
move session/build to page 2 or a scroll line.

**Size:** S · **Fleet D** (UI / phone)

---

### 4. GPU timer is the wrong default oracle on iPhone

**Problem:** GLX documents the extension as missing/unreliable on iOS Safari
(`js/render/glx/glx.js:100–108`). GPU TEST notes most phones report unsupported
(`js/perf/gpu-test-run.js:14–16`). DEBUG-HOOKS still leads deeper recipes with
`gpuTimer(true)` “Chrome/Android only” (`docs/DEBUG-HOOKS.md:5420`). Agents that
start phone profiles with `gpuTimer` get `supported:false` and stop, instead of
fill-slope / rAF phases / soak spans.

**Evidence:** `js/render/glx/glx.js:100–108`; `js/perf/gpu-test-run.js:14–16`;
`docs/DEBUG-HOOKS.md:1046–1057`, `:5420`; PhoneRecorder never arms the timer
(`js/perf/phone-recorder.js:14–16`).

**Proposed change:** Phone recipes: treat `unsupported` as success signal; default
oracle = soak spans + rAF p95 + governor tier/scale; document fill-slope / GPU TEST
phases before `gpuTimer` in DEBUG-HOOKS (and CONSOLE-RECIPES stub).

**Size:** S · **Fleet D** (docs + iOS tooling; no Device Farm spend in this lane)

---

### 5. Shot / evidence packs omit live perf counters

**Problem:** `captureShot` records wall `presentMs`/`totalMs` only
(`tools/shot/apex-capture.mjs:149–166`). `publish-evidence` manifests are
provenance + file hashes (`tools/shot/publish-evidence.mjs:60–65`, `:106`) with
no fps/spans/gpu/frametime fields even when producers already emit them. Profile
regressions and visual captures stay disconnected.

**Evidence:** `tools/shot/apex-capture.mjs:149–166`;
`tools/shot/publish-evidence.mjs:60–65`, `:106`;
`docs/notes/BENCH-CAPTURE-2026-10-23.md:10–24` (phone signal gaps).

**Proposed change:** Optional `--perf` / capture-contract field: snapshot
`frametimeBench("snapshot")` + `perf({on:true})` spans + `gpuTimer()` beside each
shot JSON; evidence schema v2 optional `metrics` ingest of producer `*.json`.

**Size:** M · **Fleet D** (`tools/shot/*`; hooks stay on A/D perf surfaces)

---

### 6. Per-pass GPU timing is still unbuilt (I5); WGX is lit-pass only

**Problem:** Frame-total `gpuTimer` exists; per-pass GPU ms does not.
MEASURING-GPU-PERF I5 still open: GLX one `TIME_ELAPSED` at a time; WGX needs
`timestampWrites` across passes (`docs/notes/MEASURING-GPU-PERF-2026-09-16.md:143–150`).
On tip, WGX returns `scope: "lit-pass"` excluding shadows/post
(`js/render/webgpu/wgx.js:5020–5022`). Open PR #3647 adds CPU wall-time pass
spans (not on this tip) — useful for hitches, not GPU fill. Agents confuse
the two.

**Evidence:** `docs/notes/MEASURING-GPU-PERF-2026-09-16.md:143–150`;
`docs/notes/PROFILER-DESIGN-2026-10-16.md:42–60`;
`js/render/webgpu/wgx.js:5020–5022`. Tip has no GpuProfile module and
`__apex` exposes no `gpuProfile` (open PR #3647 adds wall-time pass spans;
not merged at survey tip).

**Proposed change:** (a) Document wall-time vs GPU ms in `__apex` / DEBUG-HOOKS.
(b) Land real per-pass queries (GLX sequential ring; WGX `timestampWrites`);
gate on `gpu-census.yml` macos — software probes are not evidence. (c) After
#3647 merges, wire `__apex.gpuProfile()`.

**Size:** L · **Fleet A** (TLX/GLX/WGX pass sites, `game.js` sequencing) +
**Fleet D** (profiler API / docs / phone export)

---

### 7. GOV never arms `gpuTimer`; CPU vs GPU stays opt-in

**Problem:** Overlay reads `gpuTimer()` only if already on
(`js/perf/metrics-overlay.js:262–267`). Without a prior `__apex.gpuTimer(true)`
or GPU TEST, fps/ms alone cannot separate fill-bound from JS-bound. Wide GOV
appends `gpu … ms` only when `gpuMs` is present (`:663–667`).

**Evidence:** `js/perf/metrics-overlay.js:262–267`, `:663–667`;
`docs/DEBUG-HOOKS.md:1046–1057`.

**Proposed change:** On GOV (desktop/Chrome), offer a one-shot “GPU ms” arm that
calls `gpuTimer(true)` once and shows `off|n/a|ms` beside CPU frame ms; keep
PhoneRecorder’s no-timer default for iOS cost.

**Size:** S · **Fleet D** (`js/perf/metrics-overlay.js`)

---

### 8. `gpuCapture` is WebGL/Spector only — no WGX agent capture

**Problem:** `ApexGpuCapture` is GLX/TLX WebGL Spector + webgl-lint
(`js/agent/apex-gpu-capture.js:1–4`; wired at `js/agent/apex.js:1489`). WGX has
debug labels but no equivalent agent capture path, so WebGPU nights/regresses
lack a one-command capture summary.

**Evidence:** `js/agent/apex-gpu-capture.js:1–4`; `js/agent/apex.js:1489`;
`docs/notes/GPU-CAPTURE-2026-10-19.md` (WGX labels vs Spector).

**Proposed change:** WGX capture mode (label dump / encoder snapshot) behind
`__apex.gpuCapture`, or DEBUG-HOOKS recipe that points agents at labels +
`wgx-validate` explicitly when `backend=wgx`.

**Size:** M · **Fleet D**

---

### 9. Pass-census counts do not transfer as times; CLI is SwiftShader

**Problem:** `tools/gfx/pass-census.mjs` is a Chromium/SwiftShader draw/tri
census (`:16–17`). Phone notes already say counts transfer, times do not.
`tools/perf/profile.mjs` warns GPU/fill rows are not meaningful under software
(`:24–25`). Agents still quote local “render” span ms as player GPU cost.

**Evidence:** `tools/gfx/pass-census.mjs:16–17`; `tools/perf/profile.mjs:24–25`;
`docs/notes/TLX-PHONE-PASS-CENSUS-2026-10-23.md` (times ≠ phone).

**Proposed change:** Tag every profile/capture artifact with
`{software,softPresent}`; refuse GPU verdicts when `software`; optional WebKit /
Device Farm driver for pass-census (propose only — no spend here). Pair count
diffs with `gpu-test-run` / soak fps on device.

**Size:** M · **Fleet D** (tools)

---

### 10. BenchCapture pass IDs are opaque (`r12`); METRICS has no clipboard

**Problem:** Three’s `timestampQueryPool` rows become `{ call: "r12", ms }` with
no scene/shadow/mirror names (`js/perf/bench-capture.js:57–65`). METRICS header
states pages stay on canvas with no clipboard (`js/perf/metrics-overlay.js:22–23`),
so mid-race tile state is not copyable — phone must pause → PHONE TEST SHARE.
`docs/AGENT-WORLD-API.md` is a stub redirect, so the “world API” entry agents
open first has no profiler surface.

**Evidence:** `js/perf/bench-capture.js:57–65`;
`js/perf/metrics-overlay.js:22–23`; `docs/AGENT-WORLD-API.md:1–6`.

**Proposed change:** Map render-call UIDs → named passes (same keys as
pass-census / future GpuProfile); METRICS bar action COPY SNAPSHOT =
`JSON.stringify(GameMetrics.snapshot())`; stub `AGENT-WORLD-API.md` with a
one-line pointer to `perf` / `gpuTimer` / `frametimeBench` (not only world/field).

**Size:** S–M · **Fleet D**

---

## Out of scope / already covered elsewhere

| Topic | Where |
|---|---|
| Logging volume / namespaces | W24a |
| Spec / group coverage for perf | W24c |
| Device Farm job shapes / device matrix | W24d (propose only; this lane spent $0) |
| Governor shed / vsync / crash strikes | Fleet A (`governor.js`) — cite, do not redesign here |
| Open GPU wall-time PR #3647 | Track; do not duplicate in this docs PR |

## Suggested first builds (after this survey merges)

1. **D · S:** narrow GOV core rows + GOV one-shot GPU arm (#3, #7).
2. **D · M:** `__apex.metrics` + `PAGE=spans` (#1, #2).
3. **D · M:** shot `--perf` + evidence `metrics` (#5).
4. **A+D · L:** real per-pass GPU timer + `__apex.gpuProfile` after #3647 (#6).
