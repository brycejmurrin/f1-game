# perf(gameplay): periodic in-race hitches + Monza→Spa switch — attribution

**Date:** 2026-10-14  
**Tip measured:** `b5f2f18de` (deploy at session start); branch `cursor/perf-gameplay-hitches-a752`  
**Shape:** Attribute first. No OWNED code fix — the biggest mid-race hitch cause sits in a FORBIDDEN path.

## Skills / instruments

- `modern-web-guidance` → LoAF script attribution (`identify-heavy-scripts`).
- Chrome DevTools for Agents skill: **not present** in this environment; used `mcp-probe` / `chrome-devtools` MCP + `scratch/perf-hitches-*.mjs` (Playwright harness, LoAF + CDP Profiler).
- Soft GL / SwiftShader box — GPU fill costs under-read; CPU throttle ×4 reproduces Grok's ~133 ms signature.

## (A) Periodic in-race hitches

### Reproduce

| condition | cb p50 | cb p95 | cb p99 | cb max | over50/min | longest LoAF | gov frameTimes p50 / p99 / max | open maxMs |
|---|---:|---:|---:|---:|---:|---:|---|---:|
| unthrottled median (3×60 s Monza) | 0.7 | 3.1 | 5.8 | 52.3 | 1 | 75.2 | 16.7 / 33.3 / 50 | 250 |
| **4× CPU median (3×60 s Monza)** | **1.6** | **28.9** | **50.7** | **132.5** | **28** | **181.7** | **33.4 / 149.9 / 716.7** | **716.7** |

Unthrottled: fps EMA ~60, gov p50 16.7 — healthy average, rare >50 ms callback.  
4× CPU: **max ≈ 133 ms** matches Grok Bot evidence (A); gap median ~0.5–1.65 s (periodic).

Artifacts: `artifacts/perf-hitches/unthrottled-r{1,2,3}.json`, `cpu4-r{1,2,3}.json`.

### Attribution (CDP spike profile @ 4× CPU, 45 s settled)

Inside frames with callback ≥ 50 ms (`analyseSpikeCpu`):

| share | site | path |
|---:|---|---|
| 52% | `(program)` | V8 / native (GC-ish) |
| **21%** | **`getBoundingClientRect`** | **`announceLane` ← `announceLaneTick` ← `updateHud` ← `tickBody`** |
| ~1% | `vpW` / `hText` / `updateHud` | same HUD path |
| <1% each | `updateCar`, `present`/`tlx`, race-control | FORBIDDEN / Handling |

Artifact: `artifacts/perf-hitches/spike-profile-cpu4.json`.

LoAF entries name only anonymous `FrameRequestCallback` (IIFE); the sampling profile supplies the function names.

### Verdict

**Biggest attributable JS cause:** layout thrash from `announceLane` / `announceLaneTick` in `js/ui/hud.js` (many `getBoundingClientRect` reads). The lane memo (`_laneWait`) still re-keys when gap text lengths change, so the clip pass returns during a race.

**FORBIDDEN** for this job: `js/ui/hud*` (and css/**). Also overlapping live HUD work: PR **#1501** (`cursor/hud-announce-stack-577d`), **#1504** radio top-right, claims on hud-announce / hud-stable-controls.

### Proposed fix (owner: HUD / #1501 lane)

1. Stop putting gap `textContent.length` in the announce-lane memo key (or bucket to empty/non-empty) so digit rolloff does not force a full rect pass.
2. Cache clipper rects until `ResizeObserver` / orientation / fit-key change; never call `getBoundingClientRect` from the 10 Hz HUD tick on an unchanged layout.
3. Keep `radioTopSlot` off the hot path unless the radio card is actually relocating.
4. Optional: `content-visibility` / contain on announce + docks so a dirty subtree does not flush the whole HUD.

`(program)` 52% may fall once layout stops allocating; re-measure after the HUD fix before chasing GC.

## (B) Monza → Spa switch — phase breakdown only

**No edits** to `lazy-bundles` / `ensureScenery` / manifest / sw (boot-wall job; live claim exists).

### Measured on this box (localhost, soft GL, modules already in HTTP cache)

Wall ≈ **0.9 s** (not Grok's ~29 s — cold CDN + real-GPU warm not reproduced here).

| phase | ms (local) | share | notes |
|---|---:|---:|---|
| `ensureScenery` | ~31 | 3% | Would dominate a cold first visit to Spa on the network |
| `loadTrack` (body:yield → warm:request) | ~810 | 88% | Stepped track build |
| `warmCarAssets` | ~0.3 | — | Already warm after Monza |
| `debrisPrime` | ~52 | 6% | |
| `mirrorPrepare` | ~0.2 | — | |
| **session:committed wall** | **~920** | 100% | |

Legs (`raceProfile`): scenery 31 · resets 0.3 · **loadTrack 810** · makeCars 11 · settings 0.4 · gridUp 3 · finish 0.2.

Artifacts: `switch-monza-spa.json`, `switch-monza-spa-slow4g.json` (Slow-4G CDP still ~0.86 s — cache hits).

### Mapping to Grok's ~29 s

On live Chrome with a cold Spa scenery/circuit fetch + GPU pipeline warm, expect **`ensureScenery` + first-draw warm** to soak most of the 29 s; this box's phase table still ranks **loadTrack** as the big local CPU slice once bundles are resident. Owner for that wall: **boot-wall / lazy-bundles** job (FORBIDDEN here).

## OWNED

**None claimed.** Cause (A) is `js/ui/hud.js` (FORBIDDEN). (B) is report-only.

## Captures

≤ ~12 instrumented browser boots (LoAF chrome session, 6×60 s measures, frame-hitch, spike profile, 2× switch). No nested subagents.
