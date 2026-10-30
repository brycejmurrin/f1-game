# Perf hunt 7 — what the player waits through, and what gets the iOS tab killed (2026-10-30)

Scope: boot → menu → race entry, garage open, track switch, race → quit, memory growth,
network / asset loading and the PWA cache. Default backend TLX (three r186, WebGPU path on
Bryce's iPhone). Branch `claude/apex-26-perf-hunt-7-818htt`, base `2220af2c` (= live apex-sha).

## Leads (macOS gpu-census run 40838027433, 2026-10-29, `entry=api`)

Read from the run's artifact (`game-webgpu-macos-latest.json` = TLX/WebGPU,
`game-wgx-macos-latest.json` = WGX), `raceEntryProfile` / `raceEntrySpans` / `gapWork`.
`entry=api` calls `__apex.race()` ~8.2 s after load, before the title's idle prefetches, so its
`resets` leg is the cold worst case, not the menu path a player takes.

| leg / mark | TLX (WebGPU) | WGX | lead as briefed |
|---|---:|---:|---|
| `scenery` | 21 ms | 29 ms | — |
| `resets` (ensureRaceSession + ensureAudio + ensureLightPresets + resets) | **4,419 ms** | 1,219 ms | engine.js onload 569 ms inside it |
| `loadTrack` (paced build) | **2,535 ms** | 1,205 ms | track build cpuTotal 1,083 ms, props/geo 478 ms |
| `warmCarAssets` span | **3,139 ms** (54 yields, max step 283 ms, CPU 3,069 ms) | — | warmCarAssets 1,219 ms |
| `mirrorPrepare` span (waits on the entry's program warm) | 14,183 ms (`warm:scene` 8,144 + `warm:draw` 5,268) | 3,697 ms rAF gap lands here | mirrorPrepare LoAF 3,766 ms |
| worst rAF gap before race() | 3,206 ms | **5,573 ms** | 5,573 ms |
| race-entry long tasks | 62 tasks, 10,495 ms blocked, longest 1,111 ms | — | 31 long tasks (3,589 ms) |

TLX `resets` LoAF: one 1,942 ms frame whose biggest script is `lazy-bundles.js`
`Scheduler.yield.then` 787 ms (bundle evaluation), plus idle work that was due at the same time
(`build-client.js kick` 189 ms, `scroll-fade.js` 148 ms, `aria-state.js` 102 ms, `garage/prebuild.js tick` 75 ms).

## The player's path: menu entry (before census 41003652401, deploy tip `2220af2c`, 2026-10-30)

`gpu-census.yml` dispatched with `entry=menu`, `mem_cycles=3`, `relaunch=true` on macos-latest
(https://github.com/brycejmurrin/f1-game/actions/runs/41003652401). On the player's RACE path, race
entry itself is about one second: the wait has moved into the menu prep behind RACE SETTINGS
("PREPARING…").

| TLX (WebGPU) | first launch | relaunch, cold profile | relaunch, warm profile | WGX |
|---|---:|---:|---:|---:|
| RACE SETTINGS → prepared (`prepWaitMs`) | **21,369 ms** | 11,092 | 10,850 | 3,996 |
| program warm (`warming` true → false) | 13,826 | 5,792 | 4,660 | — |
| selector car assets (`cpuMs` / wall) | 1,767 / 1,927 | — | 1,885 / 2,013 | — |
| garage prewarm (frames) | 4,728 of 5,178 | — | 2,949 of 3,387 | — |
| race entry after START (`entryMs`, `blockMs`) | 1,156 / 211 | 979 / 209 | 1,153 / 196 | 986 / 100 |
| worst rAF gap | 2,699 (before race()) | 2,180 (track build) | 2,695 | 5,463 (before race()) |

The program warm is the GPU driver compiling the TLX pipelines; a warm profile (shader cache) cuts it
to a third. It is not addressed here (render lane, prior art 66eb0f2b / #3713).

## Memory

- **Local, TLX on SwiftShader** (`tools/gfx/mem-census.mjs --backend three --mode race --tracks monza,spa --cycles 3`,
  post-GC): heap 114.8 / 124.3 / 125.6 MB at monza across cycles 1–3; growth over the last cycle
  **+1.3 MB monza, +0.8 MB spa**: no JS leak. Decoded music PCM reads 65.6 → 146 MB, but that is the desktop
  path only: phones stream music through `<audio>` (`soundtrack.js` `streamMusic`, M-4).
- **macOS real GPU** (census 41003652401, `game-memcycles-webgpu`, menu after each quit): textures
  149.5 / 158.2 / 151.8 MB, buffers 48.8 / 53.1 / 48.1 MB, render objects 417 / 413 / 366. GPU memory
  plateaus. The WebGL2 control's heap reads 162 / 186 / **322 MB**, which is not post-GC; three cycles is
  "too-few-cycles" for the tool's verdict. **Open**: re-run with `mem_cycles=6` before calling it a leak.

## Hunt (six code-hunter slices, read-only)

| slice | top finding | measured | status |
|---|---|---|---|
| (c) car warm | `hinged()` flap solve rebuilt the neighbour element's 33-point line for every clearance sample (~33 M `elemPoint` calls a recipe) | Node: 205 recipe×level solves **101.9 s → 2.97 s** (34×), worst **1,215 → 57 ms**, all 205 outputs byte-identical (sha256) | **fixed** |
| (a) lazy bundles | `startRaceBody` awaited race-session → audio → lighting one after another, and only after `startRace`'s scenery prep | census TLX api entry: `resets` 4,419 ms | **fixed** (started together at the picker / RACE tap) |
| (b) track build | the treeline loop (15–28 `forestEdge` calls) ran as one build step | VM second-largest step montreal 301–438 → 99–160 ms, silverstone 364–368 → 165–180 ms | **fixed**; the circuit's own `scenery(api)` closure (470–700 VM ms) stays one step |
| (e) audio | TEAM RADIO alone fetched and kept the announcer pack (fable ~4–6 MB in the JS heap) with the announcer off | — | **fixed** |
| (d) TLX/WGX lifecycle | no per-cycle growth; mirror target held through the menu; replaced chunk index buffers freed only by GC | matches the plateau above | follow-up |
| (f) service worker | first visit: the install's background pool fetches 104 circuit/scenery files before the race bundles; voice cache never pruned | — | follow-up |

## Fixes and evidence

1. `js/car/car-body-geom.js` — `elemTopAt` reads a per-(element, angle) cached line (`WeakMap`), and
   `solvePoses`' `clears` inlines `elemPoint` with cos/sin hoisted and `foilThick` tabled. Same expressions,
   so bit-identical. Scratch harness `scratch/ph7/flap-golden.mjs` (sha256 per recipe×level). Guard:
   `tests/unit/aero-flap-travel.test.mjs` "flap hinge solve…" (old code 1,029 ms → red; new ~60 ms).
2. `js/game.js` — `kickRaceBundles()` from the menu prep (only while the picker or RACE SETTINGS is open,
   lighting + race session) and from `startRace` (all three). `startRaceBody`'s awaits are unchanged and now
   join promises already in flight.
3. `js/track/scenery/build-props.js` — a step boundary after the circuit's closure and after each deferred
   treeline. `Tracks.build` drains the generator straight through, so its output is unchanged
   (`tests/unit/build-steps.test.mjs`; `verify-track` montreal / silverstone / monaco).
4. `js/audio/radio-voice.js` — `packsInUse` wants the announcer pack only when the announcer is on. Guard:
   `tests/unit/voice-pack.test.mjs` "the announcer pack is fetched only while the announcer speaks".

## Live site (deploy-research, 2026-10-30, apex-sha `2220af2c`)

Cold boot to the title: 360 requests, 1.73 MB on the wire (4.93 MB decoded). GitHub Pages serves gzip only
(0 of 372 responses br; a precompressed `.br` 404s) with `cache-control: max-age=600` everywhere, so the
service-worker cache is the only long-lived cache. curl-only fetch of the static set: 13.1 s at 6-way
concurrency, 63.6 s serial (network only, no parse/execute).

## Web research (2026-10-30)

- iOS kills a WebGL page with no `webglcontextlost` and reloads it into "A problem repeatedly occurred":
  https://bugs.webkit.org/show_bug.cgi?id=300782 ; growth to ~338 MB before the crash:
  https://bugs.webkit.org/show_bug.cgi?id=290623 . GPU-process memory counts against the tab:
  https://bugs.webkit.org/show_bug.cgi?id=256703 .
- `scheduler.yield` / `postTask` are not in Safari (https://caniuse.com/mdn-api_scheduler_posttask,
  https://github.com/WebKit/standards-positions/issues/361); `requestIdleCallback` is off by default on iOS
  (https://caniuse.com/requestidlecallback). On an iPhone every `yieldMain` here is `setTimeout(0)` and every
  `scheduleIdle` a plain timeout.
- `rel=prefetch` is off by default on iOS (https://caniuse.com/link-rel-prefetch), so `prefetchAudio()`'s
  `<link rel=prefetch>` does nothing for an iPhone player; `rel=preload as=script` works from iOS 11.3
  (https://caniuse.com/link-rel-preload). Follow-up candidate.
- Storage: from iOS 17 an origin may use up to ~60 % of disk with LRU eviction across origins
  (https://webkit.org/blog/14403/updates-to-storage-policy/).
- Brotli: Pages never serves it (https://github.com/orgs/community/discussions/21655).
- BrowserStack: a Live session on iPhone 16 / iOS 18.6 Safari started against the live site; Live is a
  manual session, so no automated timing or 3-cycle crash check came back to this session.

## Follow-ups (not in this PR)

- Prefetch audio with `rel=preload` (or through the SW) instead of `rel=prefetch`, which iOS ignores.
- Service worker: race bundles before circuits in the install's background pool; prune `VOICE_CACHE`.
- Release the TLX/WGX mirror target on quit (menu memory).
- The circuit's `scenery(api)` closure as one build step: an emitter queue is needed to split it.
- Car warm: build one body per team, not per seat (slice c: 22 builds where 11 would do, ~0.5 s Node).
- The WebGL2 control's cycle-3 heap reading (above).
