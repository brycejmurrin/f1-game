# W24a survey — logging & telemetry for phone profiling (2026-10-24)

Report-only. **No code fixes in this PR.** Tip surveyed:
`82e4ad4b3` (`claude/f1-game-project-26h3ng`).

fleet: D · orchestrator: D · session: `cursor:bc-211c093f-f359-5893-934f-11026aa7ecea`

Bryce (5:54 PM PT): look for ways to improve logging, tiles, tests and Device Farm
test types to make profiling better. **This slice: logging & telemetry** (perf HUD,
console/debug hooks, structured logs, trace export) — gaps that make **phone**
profiling hard. No AWS Device Farm spend; proposals only.

Instruments: static read of `js/core/log.js`, `js/perf/{phone-recorder,governor,spans,bench-capture,metrics-overlay}.js`,
`js/agent/apex.js` (`renderScale` / `perf` / `stats` / `save`), `tools/perf/devicefarm-*.mjs`,
and notes under `docs/notes/PERF-*` / `AWS-DEVICE-FARM-*`. This box has no real phone GPU;
SwiftShader frame ms are not player evidence.

### Source map (logging surface)

| surface | path | role |
|---|---|---|
| `Log` ring | `js/core/log.js` | Levelled ns strings; 500-entry flatten buffer |
| `__apex` | `js/agent/apex.js` | `logs` / `perf` / `renderScale` / `stats` / `save` |
| Governor | `js/perf/governor.js` | EMA, scale/tier, `frameStats` ring |
| PerfSpans | `js/perf/spans.js` | Phase rings + LoAF + User Timing |
| PhoneRecorder | `js/perf/phone-recorder.js` | SETTINGS › METRICS › PHONE TEST soak JSON |
| BenchCapture | `js/perf/bench-capture.js` | Rich per-BENCHMARK-leg capture |
| Metrics HUD | `js/perf/metrics-overlay.js` | In-game GOV/CAR/PHYS/LOG pages |
| DF host | `tools/perf/devicefarm-host.mjs` | Host body → `$DEVICEFARM_LOG_DIR` |
| DF remote | `tools/perf/devicefarm-iphone.mjs` | Remote access + auto orchestrator |

Fleet path ownership for **follow-up fixes** (this PR owns only the survey + changelog fragment):
Fleet **A** = `governor.js`, TLX chunk/LOD/mirror, race, physics, `game.js`, `index.html`.
Fleet **D** = other perf, iOS, tools, UI, save.

---

## Ranked findings (impact first; top 10)

### 1. Soak samples too coarse for jank causality — **M · A**

**Problem.** PhoneRecorder samples every 2 min (or every 2048 frames) and stores
percentile `frameStats` at that instant. A hitch at T+30s never appears as a timed
event; you cannot align jank with scale/tier moves.

**Evidence.** `js/perf/phone-recorder.js:23-24` (`SAMPLE_MS = 120000`,
`WINDOW_FRAMES = 2048`); `:205-211` `sample()`; `:252-253` timer/window triggers;
`:152-153` stores `p50/p95/p99` only.

**Proposed change.** Add a hitch ring (frames >33/50 ms with `performance.now`,
scale, tier) flushed into each sample/SHARE; optional 5–15 s sample mode for
diagnosis soaks.

### 2. Governor decisions never become timeline events — **S · A**

**Problem.** PhoneRecorder has an `events[]` channel, but the only producer is
`visibilitychange`. PerfGov sheds/restores/scale steps do not emit events or
structured Log lines (only `PerfGov.init`), so FPS dips cannot be attributed to
governor action vs scene load.

**Evidence.** `js/perf/phone-recorder.js:201-203` `event()`; `:476-477` only
visibility; `js/perf/governor.js:452` sole `Log.info` (`PerfGov.init`); no
`PhoneRecorder.event` / shed Log elsewhere in `governor.js`.

**Proposed change.** On verified scale/tier change (and latch flips), call
`PhoneRecorder.event("gov", {…})` and/or rate-limited `Log.info("game", …)` with
before/after + reason.

### 3. Phone soak schema omits phone-critical governor latches — **S · A**

**Problem.** `__apex.renderScale()` reports `lookPostShed`, `phoneSlowLatch`,
`autoTier`, `strikes`, etc., but `liveSample()` does not. Shared soak files
under-explain “stuck soft / never recovered” phone behavior that desktop
snapshots show.

**Evidence.** `js/agent/apex.js:1629` full report fields;
`js/perf/phone-recorder.js:148-177` sample fields (tier/autoShed/futile only —
no latches/strikes/autoTier).

**Proposed change.** Extend `liveSample()` with the same latch/strike/autoTier
fields `renderScale()` already exposes (read-only).

### 4. Two telemetry tiers: BenchCapture rich, PhoneRecorder thin — **M · D**

**Problem.** BENCHMARK’s BenchCapture records Log slice, longtasks, LoAF, rAF
gaps, compile times, errors, timeline ticks. Manual PHONE TEST soak (the
Bryce-facing path) gets none of that in the SHARE JSON, so field soaks are harder
to diagnose than DF bench legs.

**Evidence.** `js/perf/bench-capture.js:1-14`, `:20-21` CAP, longtask/LoAF
elsewhere in the module; PhoneRecorder sample shape `:148-177` (no
logs/longtasks/timeline).

**Proposed change.** Reuse a capped BenchCapture-style hitch+log+gap block inside
PhoneRecorder samples (or `attach("capture", …)` on STOP), behind the same CAP
budget.

### 5. Chrome-shaped phase tracing is a dead end on iOS Safari — **M · D**

**Problem.** PerfSpans `measure:true` targets Chrome/Perfetto User Timing; LoAF
is Chrome 123+. On real phones the richest phase-attribution path does not exist,
yet hooks still push `__apex.perf({measure:true})` as the deep tool.

**Evidence.** `js/perf/spans.js:12`, `:20` LoAF feature-detect;
`js/agent/apex.js:1675` `measure:true`;
`docs/notes/PERF-IPHONE-AUDIT-2026-10-21.md` (no iOS web profiler on BrowserStack).

**Proposed change.** Treat PhoneRecorder `spans` p50/p95 as the phone truth path;
document LoAF/measure as desktop-only; optionally dump top-N slow span *frames*
(not just window stats) into soak JSON.

### 6. Memory correlation weak on WebKit — **S · D**

**Problem.** `heapMB` uses Chromium `performance.memory` (null on Safari).
Renderer `mem` is flattened with `numericLeaves` that only recurses one level
(`depth < 1`), so nested TLX counters useful for phone RAM pressure are dropped.

**Evidence.** `js/perf/phone-recorder.js:67-76` depth gate; `:160-161` mem/heapMB;
`js/perf/bench-capture.js:101-104` (“Chromium only; WebKit has none”,
`"unsupported"`).

**Proposed change.** Drop reliance on heapMB for iOS; deepen/select known
`memState()` keys (geo/tex/draws/warm/presentMs); mark heap `"unsupported"`
explicitly like BenchCapture.

### 7. Log module cannot carry a perf timeline — **M · D**

**Problem.** Log is a 500-entry string ring with no `perf`/`gov` namespace; metrics
LOG page filters omit them. Governor/stall noise lands in `"game"` as free text,
so you cannot filter or correlate with FPS/scale after the fact.

**Evidence.** `js/core/log.js:14-31` NAMESPACES; `:34` `RING = 500`;
`js/perf/metrics-overlay.js:22` “Pages stay on the canvas (no clipboard)”;
`:38` LOG_NS list (no perf).

**Proposed change.** Add optional structured buffer records `{t, kind, fields}`
for gov/hitch (or a dedicated ring), exportable via SHARE / `__apex.save`; keep
console strings as today.

### 8. Perf HUD is display-only; no join into SHARE — **S · D**

**Problem.** GameMetrics GOV page and `__apex.stats()` show fps/scale/tier live,
but neither exports a time series. PhoneRecorder SHARE does not embed the Log
tail or metrics snapshots, so a player’s screenshot + soak file stay unjoined.

**Evidence.** `js/perf/metrics-overlay.js:1-24`, GOV paint later in the module;
PhoneRecorder serialize persists only `rec` (samples/events/facts).

**Proposed change.** On STOP, attach `{logs: Log.records({limit:N}), lastGov:
renderScale()}` into the soak record; optional “SHARE METRICS” that dumps GOV
page text + last N samples.

### 9. Device Farm Instruments path is effectively off — **M · D**

**Problem.** Native CPU/GPU traces (the desktop-class correlation tool) do not
work on DF: xctrace disconnects in ~3 s; host defaults `APEX_PERF=none`.
Automated runs get huge syslog/video without a join key to in-game scale/tier
samples. (Propose only — no DF spend this session.)

**Evidence.** `tools/perf/devicefarm-host.mjs:16-18` default none + disconnect
note; `:81-84` `startPerfRecord`;
`docs/notes/AWS-DEVICE-FARM-IPHONE-2026-10-23.md` artifacts / Instruments failure.

**Proposed change.** Until Instruments works: write a 1 Hz
`__apex.renderScale()` + hitch JSONL into `$DEVICEFARM_LOG_DIR` during legs;
stamp ISO + `performance.now` for post-hoc align with video/syslog.

### 10. DF scripts don’t pull PhoneRecorder / continuous governor series — **M · D**

**Problem.** Remote/auto paths poll BenchRun STATE or short `sampleWin` rAF
windows; they never start/stop PhoneRecorder or dump `apex26.phoneRec`. Field
SHARE protocol and DF automation remain two disconnected evidence pipelines.

**Evidence.** `tools/perf/devicefarm-host.mjs:40-46` STATE (bench +
RaceEntryProfile); `:90-105` poll loop; `tools/perf/devicefarm-iphone.mjs:459`
`sampleWin`; no `PhoneRecorder` references under `tools/perf/` (scoped search
empty).

**Proposed change.** In DF execute scripts, `PhoneRecorder.start()` around
soak/bench windows and `serialize()` into Customer Artifacts beside
`report.json`.

---

## Highest-leverage trio

1. Hitch + governor events in PhoneRecorder (findings 1–3) — Fleet A.
2. Join DF Customer Artifacts to that schema (9–10) — Fleet D tools.
3. Stop treating Chrome LoAF / `measure:true` as phone evidence (5) — Fleet D docs/hooks.

## Out of scope (sibling W24 briefs)

Tiles / tools packaging → W24b. Test types → W24c. Device Farm *test-type*
matrix → W24d. This file does not open issues or schedule DF runs.
