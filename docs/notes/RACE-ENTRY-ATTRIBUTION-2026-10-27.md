# Race entry and memory on the TLX WebGPU path: where the 29.8 s goes (2026-10-27)

Worker lane "boot, race entry and memory on TLX WebGPU" (parent session `session_01Ap97PUkoACNwXY4fpfa4ya`), epics #3110 and
#1650. Question: Device Farm batch #3954 timed a **29.8 s** race entry on an iPhone 14 (TLX WebGPU, Monza day, first entry
on the unit). Which parts are script load, circuit hydrate, track build, asset pack, pipeline warm and first frame, and
which of them can this lane cut? GPU-side timings are not available in this container (Dawn on SwiftShader); every number
below is CPU-side or wall time on software rendering, and is a ranking, not a device figure.

## Answer

1. **The 29.8 s is the harness's `api` entry, not the player's.** `devicefarm-iphone.mjs` defaults to `--entry api`
   (`__apex.race()`), and batch #3954 did not pass `--entry menu`. That path skips everything the menu does while the
   player reads RACE SETUP: the track build, the car prep (`prepareMenuCarAssets`) and the menu program warm
   (`tools/lib/census-entry.mjs` header). So the 29.8 s window contains the track build, the whole car warm and the whole
   cold pipeline warm in one go.
2. **On the player's path the wait splits in two.** Locally (Monza day, TLX WebGPU, 844×390 touch): the menu prep takes
   63.8 s on SwiftShader while the RACE SETUP sheet is open, then START RACE opens an 8.9 s window. Of that window
   5.3 s is `rigWarm` (pipeline compile under the cover), 1.0 s `awaitIntroWarm`, 1.1 s `flyby` (waiting for a ready
   present) and 1.2 s from `session:committed` to the cover lowering. **The CPU stages this lane owns are 0.2 s of
   it** (`gridCountdown` 0.20 s, of which `warmCarAssets` 0.15 s; `loadTrack`, `scenery`, `resets` under 3 ms each,
   because the menu did them).
3. **The device run agrees** (§The device rows): on the iPhone 14 the CPU stages are about 1.5 s of the 29.8 s, and
   `mirrorPrepare` (which wraps the program warm) is 27.9 s of it. **Earlier device prior:** Every iPhone 14 cold entry measured so far is dominated by the first-use Metal pipeline
   compile: race warm 14.0 s of an 18.4 s entry (ledger row 21, `DEVICE-FARM-ANALYSIS-2026-10-24.md`), menu warm 7.5 s.
   With the shader cache full the whole entry is 1.7–2.9 s (rows 10, 11). That warm belongs to the first-race warm-up
   lane (#3673) and the lit-WGSL stability lane (#3672); this lane does not touch it.
4. **Memory.** JS heap after two forced GCs: 22.8–61.8 MB at the title, **127–136 MB once the menu has prepared the
   race**, flat (126.8–135.3 MB) 5 s into the race. Nothing is dropped at the lights and nothing grows into the race.
   Of the ArrayBuffer bytes, the largest holders are three's CPU copies of geometry (`PERF-KNOWN-WINS` row 9, rated
   low and high-risk in `IPHONE-MEMORY-2026-10-24.md`), the lamp-bake atlas on a dark session, and the announcer voice
   pack. Script source text is 23.5 MB of the heap here, but that is the unminified dev tree; the deployed build is
   minified at staging (#3129).
5. **What #3110 left open is mostly landed.** Rows F2 (Save-Data gate) and F5 (model buffers own their arrays) shipped
   in PR #3833; F3/F4 (voice pack pick and release) are in `radio-voice.js` (`recordedPack`, `releaseUnused`). F6 (SW
   precaches unused backends) and F7 (pack tier ignores GRAPHICS: HIGH) are design decisions, not defects.

## Method

`tools/perf/race-entry-timer.mjs` (this PR adds `APEX_ENTRY=menu` and `APEX_HEAP=1`), Playwright Chromium with the
headless project's launch args, `apex26.gfxBackend=three` so TLX takes its WebGPU path on Dawn/SwiftShader (bootGfx
`[TLX] three backend: WebGPU`), local `npx serve`, one run per row, loadavg < 4 at start. CPU profiles: CDP Profiler
(0.5–1 ms), summarised with `tools/perf/cpuprofile-summary.mjs`. Heap: CDP `HeapProfiler.takeHeapSnapshot` after
`collectGarbage`, aggregated by a scratch walker over retainers (not committed). The `api` and `menu` runs below use
the same tree (`f41eb15c` plus this PR's tool change).

```sh
APEX_PIN=three APEX_PROFILE=artifacts/perf/entry.cpuprofile node tools/perf/race-entry-timer.mjs api monza
APEX_PIN=three APEX_ENTRY=menu APEX_HEAP=1 node tools/perf/race-entry-timer.mjs menu monza
```

## The device rows behind the 29.8 s

From the batch #3954 report (iPhone 14 unit 131A8714, build `01e64933`, TLX WebGPU, Monza day, first race of the
session, `api` entry; Device Farm session `e7248d2e`), relayed by the batch worker on 2026-10-27 (the report itself is
not committed). Window 29 805 ms, `blockMs` 0.

| bucket | stage | ms on the iPhone 14 | owner |
|---|---|---|---|
| circuit hydrate + scenery fetch | `scenery` leg / `ensureScenery` | 204 / 202 | this lane |
| lazy bundles + resets | `resets` | 113 | this lane |
| track build | `loadTrack` | 901 | this lane |
| car prep | `gridCountdown` (`warmCarAssets` 1344–1355 ms after the kick) | 129 | this lane |
| pipeline warm | `programWarm` (1.8 → 14.0 s) | 12 176 | #3673 |
| mirror prepare, wrapping the warm | `mirrorPrepare` (1.8 → 29.7 s) | 27 907 | #3673 |

Warm detail: done, 0 failed, total 13 827 ms (scene 694, fx 465, post 2476, shadow 5, **mirror 9425**, draw 762);
cockpit rig 4577 ms (34 pairs); the mirror's own prep pass is one pass of 4362 ms, ready at 16.6 s.

Reading: **the CPU stages this lane owns are about 1.5 s of the 29.8 s on the device** (scenery 0.2, resets 0.1,
loadTrack 0.9, car prep 0.1–0.3). Everything else sits inside `mirrorPrepare`: the program warm to 14.0 s, the mirror
prep pass to 16.6 s, and then **about 13 s more until `mirrorPrepare:end` at 29.7 s** with no recorded stage in it. That
tail is the largest single unexplained block of the entry; it belongs to the warm-up lane and is reported to it (#3673).

## Stage split, `api` entry (what the 29.8 s device window measures)

Monza day, `__apex.race("monza","day","dry")` right after `__apex` appeared. Window 20.8 s locally.

| bucket | stage (RaceEntryProfile) | ms (SwiftShader) | what is inside | owner |
|---|---|---|---|---|
| circuit hydrate + scenery fetch | `ensureScenery` | 257 | LAZY_CIRCUIT payload, scenery closure, build toolkit (already parallel: `lazy-bundles.js ensureScenery`) | this lane; nothing left |
| lazy bundles | `resets` | 1863 | `ensureRaceSession` → `ensureAudio` → `ensureLightPresets`, serial, then the session resets; the title prefetches all three at idle (8–12 s), so only a tap in the first seconds pays this | this lane; see lever 3 |
| track build | `loadTrack` | 7371 | `track build done monza total=5778` (floor, road, terrain 2.3 s, props 0.9 s, pits), chunk packing | menu path does it before START |
| asset pack | (parallel) | — | pack landed +3.9 s into the build; `_unfilterRows` 317 + `_inflate` 155 + `createTextureArray` 201 ms of CPU | not on the critical path |
| car prep | `warmCarAssets` | 9209 | 22 cars × body, atlas, caster, LOD; **4.6 s of it is `copyExternalImageToTexture`** (livery atlas upload on software WebGPU), car geometry (`weld`, `smooth`, `foilThick`, `addTri`) ~2.3 s | menu path does it before START |
| pipeline warm | `warm:request` → `present:warming` | 659 | the race program warm (a software adapter skips most of it) | #3673 / #3672 |
| cockpit rig, mirror | `rigWarm`, `mirrorPrepare` | 9 | — | #3673 |

## Stage split, `menu` entry (the player's path)

Same circuit and light, title → RACE → RACE SETUP (DAY) → wait for `__apex.menuPrep()` → START RACE.

| phase | ms | notes |
|---|---|---|
| menu prep while the sheet is open | 63 800 | track build, `selector car assets ready` (cpuMs 4120), menu program warm (`menu warm drawn monza` at +56 s); CPU profile of a 73 s prep on the scratch run (Bahrain): 46.7 s idle (waiting on the software GPU), 12.2 s `copyExternalImageToTexture`, 2.3 s compile — software costs, not device evidence |
| `awaitIntroWarm` | 987 | waits for the menu warm's last stage (`warm:where:menu`) |
| `flyby` | 1068 | `flyby:start` → `present:ready` (the intro's first ready present) |
| `gridCountdown` (incl. `warmCarAssets` 146, `debrisPrime` 13) | 199 | the menu's car prep is hit, so this is the floor |
| `rigWarm` | 5253 | cockpit rig programs, 1.6 s to the first warming present, 3.7 s after it |
| `session:committed` → `handoff:lower` | 1182 | the cover waits for ready presents |
| **window** | **8920** | |

The player who taps START RACE before the prep finishes joins it (`_menuGate.join` in `startRaceBody`), so their wait is
the rest of the prep plus this window.

## Memory on the race path

Heap after two forced GCs (`APEX_HEAP=1`): Monza day, menu 61.8 → prepared 136.1 → race +5 s 135.3 MB. Composition from
a snapshot 8 s into a race on the default circuit the picker chose (Bahrain, night: the first scratch run did not preset
the circuit, so its lamp bake is legitimately on), 153.8 MB of self size:

| holder | MB | note |
|---|---|---|
| ArrayBuffer backing stores | 78.2 | below |
| — three geometry CPU copies (`BufferGeometry.attributes` colour, position, normal, mat, trk) | ~22.5 | `PERF-KNOWN-WINS` row 9; four failed attempts, rated low by `IPHONE-MEMORY-2026-10-24.md` |
| — TLX chunked prop attributes (`tlx-chunked.js` scope) | ~10 | same family as row 9; `ChunkBins` idx already nulled after upload |
| — lamp-bake atlas (`tsl-lit.js _bakeSrc`, `LampBake._bake`, the DataTexture) | 8.9 | one array, three holders; desktop budget. Phones bake at `MAX_TEXELS` 300 000 (about 4.6 MB). Kept on purpose: the 120-frame off path re-creates the texture from it |
| — announcer voice pack (`fable.bin`) | 3.8 | the announcer channel is on by default |
| external strings (script source) | 23.5 | unminified dev tree; minified on Pages (#3129) |
| code | 18.5 | compiled JS |

On the device, the only footprints are from navigations (`IPHONE-MEMORY-2026-10-24.md`): iPhone 14 386 MB at the menu,
JS heap 154 MB; the GPU process limit (300 MB soft on the iPhone 14) is the tighter one and has never been sampled.

## Levers, ranked for this lane

| rank | lever | evidence | expected gain on the phone | status |
|---|---|---|---|---|
| 1 | **Measure the player's path on the device.** Re-run the Monza day entry with `--entry menu` next to `--entry api` in the next approved batch, and record the menu prep time | §Answer 1–2 | turns the 29.8 s into the number a player waits; no code | asked on #3954 |
| 1b | **Explain the ~13 s tail of `mirrorPrepare`** after the mirror's prep pass is ready (16.6 → 29.7 s on the iPhone 14) | §The device rows | up to 13 s of the cold entry | **not this lane**: reported to #3673 |
| 2 | Shorten the menu prep wall on hardware: its local cost is software GPU idle and texture copies, so the device split is unknown | menu table | unknown until rank 1 runs | needs rank 1 |
| 3 | Fetch the three race bundles (`LAZY_RACE_SESSION`, `LAZY_AUDIO`, `LAZY_RACE`) in one wave when RACE! is tapped before the idle prefetch ran | `resets` 1.86 s on `api` | one or two network round trips on a cold first tap; zero for a player who sat on the title for 12 s | not done: the evaluation order between the groups is load-bearing (`onRaceSessionReady`, `onAudioReady`), and the gain exists only on a cold fast tap |
| 4 | Three's CPU geometry copies (~32 MB with chunked props) | heap table | 2–3 % of the iPhone 14 WebContent limit | left low, as `IPHONE-MEMORY-2026-10-24.md` ranks it |
| 5 | Pipeline warm (`rigWarm`, `awaitIntroWarm`, `flyby`, the cover wait) | both tables | the largest share of every entry | **not this lane**: #3673 (first-race warm-up), #3672 |

## What a future device batch should measure for this lane

Posted on #3954. One iPhone 14, TLX WebGPU, Monza day, fresh unit:

1. `--entry menu` once and `--entry api` once, both on the same unit, so the menu prep and the START RACE window are
   separate numbers; the `menu.prepWaitMs` field and the `entry.stages` rows (≥ 50 ms) for each.
2. Peak memory: end each scenario with a reload so WebKit prints the WebContent footprint at the menu, at "prepared"
   and at the end of the race (`IPHONE-MEMORY-2026-10-24.md` §Next steps 1), and parse the syslog with
   `tools/perf/devicefarm-syslog.mjs`.

## Caveats

One run per row on a 4-core container shared with a static server. SwiftShader makes GPU-bound waits (idle time,
texture copies, pipeline compiles) far longer than on the phone, and the desktop-UA context uses the desktop pack and
livery tiers. The heap composition snapshot is Bahrain night, the heap totals are Monza day.
