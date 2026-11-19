# Hitches, memory and load on the phone path, 2026-11-18 (#5629, Perf lane C)

Kind: measurement · Re-measure-by: 2027-01-31

Summary: On Bryce's iPhone (three.js r187 on WebGPU, Safari tab, build 2741f973) the first `__apex.race("monza")`
entry took 5,738 ms, 4,033 ms of it first-use pipeline compilation; a second entry on the same page took 195 ms. The
first 10 s of driving had a 42 ms worst frame. Nothing measured in software found a compile after the lights, after
a camera cut, at the flag or at a rain flip. One hitch was fixed (a Time Trial PB wrote both ghost stores in the task
behind the lap-line frame on iOS, 267df2f4). What drives the iOS tab kills stays unattributed: no read of GPU memory
exists on the three path.

This note was rebuilt on 2026-11-18 from the numbers recorded in the #5629 PR body: the original note commits were
never pushed and were lost with the session that took them. The PR body's tables are the source; nothing below was
re-measured.

## On the iPhone (phone bridge #5168, evidence class: real phone)

| Reading | First Monza race | Second Monza race, same page |
|---|---|---|
| Race entry through `race("monza")` | 5,738 ms | 195 ms |
| Program warm inside it | 4,033 ms (draw 2,790, mirror 1,056, scene 155) | 40 ms (draw 24, mirror 6, scene 7) |
| First 10 s from the lights | 598 frames, p50 17, p99 21, max 42 ms, 3 over 33 ms | not clean: the page was hidden for 11.6 min inside the read |
| Governor after | tier 2, scale 0.75 → 0.65, crash strikes 0 | tier 3, auto shed 1, scale 0.65, crash strikes 0 |

- The 4 s before the first lights is first-use pipeline compilation on the `__apex.race()` entry and is gone on
  re-entry. The player's path warms in the menu instead (#5623 ran `gpu-game-check.mjs spa --backend three --path
  webgpu --lavapipe --entry menu` and got `warm:skipped-menu`). Open for a device: START tapped before the menu warm
  finishes or within 1.2 s of a settings change, and the menu warm's own cost on the phone (10.9 s in this run: post
  5,268, draw 3,027, mirror 2,227 ms).
- The first race frames are not a freeze on the device (max 42 ms). The 35–62 ms first frame on desktop is cold code.
- `texCensus` is GLX-only and no other allowed bridge read returns texture or buffer bytes, so GPU memory on the
  three path cannot be read from the bridge. Attributing the tab kills needs a new allowed read in `js/agent/*`
  plus a deploy.
- The tab survived two Monza races. Not measured (the run was stopped): Spa, Monaco, the rain flip, the WebGL2
  comparison, a race started from the picker.

## Ranked findings

Evidence class: **count** = exact in this container; **cpu** = desktop V8 time, a phone is several times slower;
**trace** = read from the code; **device** = needs a real GPU or the phone.

| # | What | Where | Size | Evidence | Status |
|---|---|---|---|---|---|
| 2 | Finish line: classification, scoring, the results sheet (280 DOM nodes) and the ceremony mount in one task | `endRace` in `js/game.js` | `finishRace()` 29.5 ms at 1×, 17.3 ms at CPU ×4 on a JIT-warm second race (GLX, 844×390); VM 24.6–44.3 ms | cpu | Open, low; the deferral point is in `js/game.js` |
| 3 | A Time Trial PB wrote the ghost stores in the task behind the lap-line frame on iOS (`setTimeout(write, 0)`), twice | `js/car/ghost.js`, `js/car/input-ghost.js` | 5–30 ms per write by the code's comment, two writes per PB | trace + unit test | Fixed 267df2f4 |
| 4 | Pack `manifest.json` is network-first with a 3,000 ms race before the cached copy; models wait on it | `sw.js` | up to +3 s on a stalled link | trace | Open; a follow-up after #5617 (which holds `sw.js`) merges |
| 5 | Phone music streams by Range request, which bypasses the service worker: never cached | `sw.js` | 3.1–3.6 MB per track, 19.3 MB for six | count | Open; after #5617 and #5589 merge, on only after a Safari check |

## Closed by measurement

- Shader compile on a dry first lap: 40 pipelines before the lights, 0 after, 5,054 m driven
  (`first-race-census --track monza --cam helmet`, four runs agree; count).
- Camera cut and finish: 0 pipelines after a helmet → chase cut and 0 after the flag with the ceremony
  (`first-race-census --cam-flip chase --finish`, 7c36bbba; count).
- Rain onset mid-race: 0 pipelines after a live dry → rain flip; 6 new material identities (`--wx-flip rain`; count).
  Their cost in ms is not measured (device).
- LIVERY picker swatch canvases: 113 canvases, 1.58 MB per team sheet at 844×390 DPR 3; both caches cap at 160, about
  4.4 MB in all (count).
- GPU handles, listeners and timers: flat over monza, spa, monaco, singapore × 3 race → menu cycles
  (`vm-leak-census` clean; count).
- Two circuits resident at race entry: no; the old world is freed before the new build (trace).
- Replay ring capped at 720 KiB (`js/camera/replay-buf.js`; trace). Hashed pack files carry across deploys
  (`sw.js` `isCarriedRuntime`; trace). Lazy bundles are all awaited under the entry cover (trace).
- Scenery fetch at START for a circuit picked after boot: 0 requests at race entry on the picker path, scenery leg
  4.3 ms at 150 ms latency and 1.6 Mbps; the 2,607 ms leg on that link belongs to the `__apex.race()` path (count).
- Canvas backing stores on iOS (WebKit bug 195325): phones paint every livery atlas into one reused scratch canvas
  (`js/car/liverytex.js`; trace).

Per-circuit bytes (gzip level 6; count): def 2.9 KB (monza), scenery 14.8 KB, all 28 models 43 KB, pack strips
570 KB at 128 px or 1,669 KB at 256 px (decoded 2.1 or 8.5 MiB), three.js island 314 KB.

Not examined: the lamp-bake atlas, peak memory at race entry, GC pauses in a browser, the three.js island's
cold-visit waterfall.
