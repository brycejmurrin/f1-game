# Long-session memory hunt (P5), 2026-10-17 — round 1, dry

Lane: heap/listener/timer growth across the cycles a phone player repeats; audio and replay CPU.
Branch `cursor/perf-hunt-session-mem-7d4e`. Box: SwiftShader, no `/dev/dri`, idle at start (loadavg 0.3),
TLX backend, viewport 844x390 touch. No fix landed: nothing cleared the evidence rule.

## Method

`scratch/cycleprobe.mjs` (untracked): headless Chromium, `HeapProfiler.collectGarbage` twice before every
read (`tools/lib/mem-census.mjs`), per-cycle `{heapMB, DOM nodes, live setTimeout/setInterval, live
listeners}`. Listeners are counted by wrapping `EventTarget.prototype.add/removeEventListener`, keyed by
target id/class + type. Cycle 1 is the warm-up reference; growth is cycle N minus cycle 1.

Trap in the harness: `__apex.race()` only queues the build (`info().state` stays `menu` ~15 s), so
`go()`/`finishRace()` straight after it do nothing. Wait for `state === "count"`, call `go()`, wait for
`"race"`, then `finishRace()` and wait for `#res-menu` to be visible.

## Results (one page per scenario; the >=3 fresh-page rule is NOT met, so these are "unproven", not "leak")

| scenario | cycles | heap MB (after GC) | DOM nodes | timers / intervals | listeners | verdict |
|---|---|---|---|---|---|---|
| race (monaco) -> results -> MENU | 4 | 139.7, 147.8, 151.9, 153.7 | 5106 -> 5125 | flat (<=2) | +6 net (win:resize, hud-mirror x2, WakeLockSentinel:release x3) | warm-up, decelerating (+8.1, +4.1, +1.8); not a leak call |
| DATA HUB open, every tab, close | 8 | 50.5, 50.4, 50.5, 50.5, 50.6, 50.7, 50.7, 50.7 | flat 5736 | flat | +624/cycle on `dh-*` rows/pills/selects | REFUTED: tracker counts listeners on rebuilt nodes that GC reclaims; heap and node count are flat |
| GARAGE open/close | 6 | 48.2, 49.9, 50.1, 50.2, 50.6, 50.9 | flat 5545 | flat | 0 | unproven: +0.3..0.4 MB/cycle late, under the noise a single page can prove |

Do-not-re-report rows:

- `js/audio/panel.js:944` pause-menu `setInterval(syncAudioPanel, 1000)` is cleared when `#pausemenu` hides.
- `js/data/hub.js:226/236` document listeners are added once in the build, not per open.
- `WakeLockSentinel:release` x1 per race: the sentinel is dropped and collected; no retained listener.
- three `geometries`/`renderObjects` rose 20 -> 228 / 41 -> 450 across 4 race cycles. That is the renderer
  (P2/P4/#2637 own it) and the box was still warming; not claimed here.

## Not done (say so)

- WATCH / Highlights replay seek-and-exit cycles (needs the OpenF1 fixtures path; not started).
- Audio graph and replay CPU: `profile.mjs monaco --mode spans --repeat 3` has no audio or replay row
  (frame p50 27.2 ms, physics 11.8, ai 1.7 — all in `game.js`/physics, not mine). `--mode cpu` timed out in
  `waitForFunction` (20 s) on this box, so there is no audio self-time number and no CPU claim.
- GL create/delete census for #34597: the orchestrator cancelled the lead (another session owns #2651);
  the probe was stopped before its first switch.

## Next round, if any

1. Repeat the garage and race scenarios on >=3 fresh pages with 10 cycles and a heap snapshot diff of
   cycle 2 vs cycle 10 to name a retainer; only then is a leak claim allowed.
2. Add a `PerfSpans` row for `GameAudio.setEngine` (needs a `game.js` claim; P1 owns the file).
3. WATCH replay seek/exit with a stubbed OpenF1 script.
