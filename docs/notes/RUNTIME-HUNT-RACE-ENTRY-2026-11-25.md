# Runtime hunt: where RACE! → race goes (introBuild 12–14 s), 2026-11-25

Kind: measurement · Re-measure-by: 2027-01-31

Summary: `introBuild`'s 12.5 s on Bryce's MacBook is not build, CPU or shader compile. The span wraps the garage
drive-out (`studioOpen` → `studioDone`, `js/game.js:3924`), which measured 11,730 ms of it. The drive-out is
10.56 s long by design. Then the flyby plays for its fixed 20.0 s (`FLY_MS`). Of the 32.6 s RACE! → race on
the MacBook (#6417, build `2d63d699`), **30.6 s is the two fixed-length cinematics, ~1.2 s is drive-out overrun, and
under 1 s is real work** (`loadTrackStepped` 390 ms, `introPrepare` 336 ms, `awaitIntroWarm` 201 ms). The phone's
38–40 s (#5835) sits on the same 30.6 s floor, so its extra ~8 s is the part worth measuring there (§Bridge commands).
Earlier hunt rows #1–#6 (`RUNTIME-HUNT-PERF-2026-11-24.md`, fixes in #6404 and #6419) are not repeated here.

## Evidence

### MacBook, installed app, Chrome 159 WebGPU (#6417 clean run, `raceEntryStages()`)

| stage | ms | what it is |
| --- | --- | --- |
| introBuild (span) | 12,465 | selfMs 4.2; its children follow |
| ensureScenery | 0.1 | |
| awaitIntroWarm (first) | 0 | |
| loadTrackStepped | 390 | real work |
| prepareMenuCarAssets | 5 | |
| introPrepare → introPlan → introWarmPrograms | 336 | real work (plan 94 self, programs 241) |
| awaitIntroWarm (second) | 201 | the warm's tail |
| **studioOpen / studioDone** | **11,730** | **the drive-out, nested inside introBuild** |
| **flyby** | **20,006** | **FLY_MS** |
| rigWarm | 196 | after the flyby |
| window total | 32,761 | |

Add introBuild's children up: about 0.93 s of work plus 11.73 s of drive-out is 12.47 s, the whole span.

### This container (headless Chromium 158, three.js WebGPU on SwiftShader, 852×393, `__apexFullIntro`)

- `GarageArrival.wallSeconds(settings(null,"raceStart"), "out")` = **10.559 s**: door 1.8, hold 1.1, run 5,
  accel 1.2, settle to 10.26, base 10.56. No slow-mo window. The crew is `current`.
- Full intro, the menu world already built (the `introGarage` path): RACE! → race **40.8 s**, `studioDone`
  **39.3 s**, flyby 0.7 s. The soft rasteriser is the cause. `stepDriveOut` advances at most 0.1 s per frame
  (`js/garage/setup-camera.js:207`), so at SwiftShader frame rates the drive-out ran out to its 3× cap
  (`js/game.js:3797`, 31.7 s), plus the wait for the first garage frame. This is a relative number, but it shows
  the mechanism.
- Drive-out off (`apex26.garageArrival = {raceStart:false}`) and `flySkips = 3`: RACE! → race **9.8 s**, of which
  `awaitIntroWarm` was 8.5 s (SwiftShader shader compile, relative only; 0.2 s on the Mac), `resets` 116 ms,
  `warmCarAssets` 72 ms, maxBlock 192 ms. With the cinematics gone, compile is the only large cost left.

## Findings (ranked)

| # | where | mechanism | cost | proposed fix (Bryce picks) | test | confidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `js/garage/setup-camera.js:175-192` (`startDriveOut`), awaited at `js/game.js:3924` | Every RACE! plays the full drive-out, 10.56 s at the default timeline. On the cold-build path (`introBuild`) it starts only after all preparation is done, so it runs strictly in series with the work and the flyby. The habitual-skipper rule (`SKIP_STREAK`) shortens only the flyby, never the drive-out. | **10.56 s** fixed on every entry, every device (Mac: 11.73 s measured) | (a) let the skip streak shorten or drop the drive-out as it does the flyby; (b) tighten the default out-timeline (door 1.8 + hold 1.1 + run 5 + settle); (c) one combined intro budget (drive-out + flyby) instead of two back-to-back fixed lengths. A tap already skips it. | arrival unit: `wallSeconds(settings(null,"raceStart"),"out")` ≤ the new target; loading-card unit: a streak of 3 gives the short drive-out | high (measured both sides + code) |
| 2 | `js/ui/loading-card.js:15` (`FLY_MS = 20000`), `:40-42` (`SHORT_FLY_MS`, `SKIP_STREAK`) | The flyby budget is 20 s. Its comment says it cannot go lower or grid-mine's radio window drops under `RADIO_MIN_S`. The short cut (10 s) only arrives after 3 consecutive skips. | **20.0 s** fixed (Mac 20,006 ms) | Lower FLY_MS and re-fit the radio shot, or take the short cut on the 1st or 2nd skip, or (with #1c) share one budget | `loading-card` unit: `flyMsFor` table | high |
| 3 | `js/garage/setup-camera.js:207` (`Math.min(0.1, gap)`), cap `js/game.js:3797` | The drive-out clock advances by at most 0.1 s per frame. Any frame over 100 ms (a long task, a compile, a GC, a slow phone frame) lengthens the wall time instead of being absorbed. The ceiling is 3× the animation (31.7 s) plus up to 30 s waiting for the first garage frame. | Mac +1.17 s over design; container 39.3 s (3×); **phone unknown: the likeliest home of its extra ~8 s** | Let the clock catch up after a stall: allow a larger gap (say 0.25 s) or a debt that drains over the next frames. Or keep the 0.1 s step for smoothness but cap the total stretch at ~1.2× | unit on `stepDriveOut` with a fake clock: 10 frames of 300 ms advance ≥ 2.5 s; `runtime: needs-browser` for the phone number | high (mechanism); phone cost `runtime: needs-browser` |
| 4 | `js/game.js:3906` (span) wraps `:3924` (`studioOpen`/`studioDone`) | Instrumentation. `raceEntryStages()` reports the drive-out inside `introBuild`, so "introBuild 12.5 s" reads as build time. That reading sent this hunt looking for a 12 s build. | Misread only | Close the `introBuild` span before `studioOpen`, or report `studioDone` as a sibling stage. | `race-entry-profile` unit: the stage list nests `studioDone` outside `introBuild` | high |
| 5 | `js/game.js:3769` (`studioShown`), `:3790` (`studioDone`) | Instrumentation. There is no mark when the garage's first frame shows (`cardUp` → false). `studioDone` therefore mixes "waiting for the first garage frame" (prep cover, soft-present, first-frame compile) with drive-out playback and its stretch (#3). | It hides how much of the phone's extra ~8 s is first-frame wait and how much is stretch | Add `RaceEntryProfile.mark("studioShown")` in `studioShown()`, and record `driveOut wall − design` at `studioDone`'s exit | profile unit: marks present in order | high |
| 6 | `awaitIntroWarm` `js/game.js:3701` | Shader/pipeline compile under the cover. 0.2 s on the Mac and 8.5 s on SwiftShader. On a phone's first race (Metal pipeline compile) this is the other candidate for the extra seconds. | Mac 0.2 s; phone `runtime: needs-browser` | Nothing yet. Measure it first (bridge A below). | — | medium |

What the time is: **neither CPU nor GPU compile on the MacBook; it is fixed-length cinematics** (#1 + #2 = 30.6 s
of 32.6 s), with a ~1.2 s overrun (#3). Real work is under 1 s. On the phone the same 30.6 s floor holds, and the
remaining ~8 s is split between #3 (stretch), the first-garage-frame wait (#5) and compile (#6). The phone readings
below settle which.

## Bridge commands for the orchestrator

Phone (#6378), Bryce's iPhone, TLX WebGPU. A cold page: `reload` first, then:

A. Stage split (the main read):
```
{"cmd":"batch","args":{"steps":[{"cmd":"nav","args":{"flow":"tt","track":"monza","weather":"dry","tod":"day","entry":"setup"}},{"cmd":"call","args":{"method":"raceEntryStages"}},{"cmd":"call","args":{"method":"raceEntryProfile"}}]}}
```
Read `studioDone` − 10,559 (the drive-out overrun plus the first-frame wait), `flyby` − 20,000, `awaitIntroWarm`,
`loadTrackStepped`, `introPrepare`, and `raceEntryProfile().longTasks` inside the studio window. Expect `studioDone`
well over 10.6 s if #3 is the phone's cost.

B. The same, a second time without a reload (warm compile cache): if `awaitIntroWarm` collapses and `studioDone`
does not, the stretch (#3) is frame-rate driven, not compile.

Desktop (#6417), the installed app: repeat A twice. The first run confirms the 11.7 / 20.0 split. Optionally Bryce
sets GARAGE ARRIVAL › race start OFF (a setting; the bridge has no store writer) and runs A a third time: entry should drop by
~11.7 s to ~21 s, which proves #1's size directly.

No fix is in this PR: it is a docs-only measurement note. Bryce picks from #1–#5. #4 and #5 are small
instrumentation changes and need no design decision.
