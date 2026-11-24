# Phone bridge commands and results

## Contents
- Commands
- Recipes
- Menu route: nav and tap
- Cannot measure

Every command is one comment holding one fence. The reply is one comment:

````
```apex-result
{"re": <your comment id>, "cmd": "frames", "ok": true, "ms": 10012.4, "value": {…}}
```
````

Parse: keep only comments with `author_association` `OWNER`, take the text between ` ```apex-result\n ` and the
closing fence, `JSON.parse` it, match `re`. A value over `MAX_REPLY` chars comes back as `{value: null, truncated:
<chars>, head}`: ask for less. Arg ranges, caps and defaults: the source (`CMDS`, `MAX_REPLY`, `BATCH_MAX`, `SNAP_MAX`
in `js/agent/apex-bridge.js`), not this table.

## Commands

| cmd | args | value |
|---|---|---|
| `ping` | — | `{pong, t}` |
| `facts` | — | `{sha, ua, dpr, w, h, gpu, cores, mem, info, render:{backend, threePath, live, engine, fallbackWhy}}` |
| `display` | — | the CSS→device pixel ledger (#5166): `{dpr, inner, screen, client, visualViewport, standalone, vars:{root,hud} (--ui-scale, --vwz, --hud-scale…), game/soft:{css, rect, buffer, engine, chain}, hud:{chain:{steps, zoomProduct}, time, pos}, overlay, renderScale, build:{sha, build, swCaches, sw}}`; HUD painted px = fontSize × zoomProduct × visualViewport.scale × dpr; canvas backing = css × dpr × renderScale.scale |
| `geom` | — | the geometry ledger (docs/notes/GEOMETRY-TRUTH-HUNT-2026-11-09.md): `{inner, client, visualViewport, screen, orientation, dpr, standalone, units:{vh,svh,dvh,lvh,vw,svw}, insets:{left,top,right,bottom}, zoom:{currentCSSZoom, rectOf100At2, vwInZoom2, envInZoom2}, media, tiers, wish:{ui,hud,btn}, paint:{hudTop,hudBot,dock,dockLeft,sheet,kb,…}}`; `rectOf100At2` 200 = standardized zoom, 100 = legacy; `wish` ≠ `paint` = a slider past its fit cap |
| `frames` | `seconds` | `{frames, fps, meanMs, p50, p95, p99, maxMs, over33, longTasks, hidden}` (rAF intervals; `hidden: true` = void, `hidden: false` proves nothing: §Cannot measure) |
| `call` | `method`, `args[]` | one `__apex` method in `CALL_OK` (see `js/agent/apex-bridge.js`) |
| `path` | `to` webgpu / webgl2 / auto, `reload` | `{was, pinned, reloading}` (may be lost to the reload); no `to` = the `render` state alone |
| `bench` | `op` tests / start (+`test`) / stop / status / result / leg (+`i`) | BenchRun (SETTINGS > GRAPHICS > BENCHMARK); `start` reloads before it replies |
| `snap` | `w`, `q` start quality | `{w, h, q, from, chars, jpeg: "data:image/jpeg;base64,…"}` |
| `wait` | `ms` | `{waited}`; for spacing steps inside a `batch` |
| `gpuTest` | `op` start / stop / status / active | GPU TEST (`GpuTestRun`) |
| `recorder` | `op` start / stop / isOn / json | PHONE TEST recorder |
| `screen` | — | `{screen, state}`: the topmost visible screen (`title`, `select`, `setup`, `garage`, `loading`, `quali`, `results`, `pause`), else `drive-out` (the garage-out, state still `menu`) or `race` |
| `tap` | `id` (one of `TAP_OK`) or `tile` (a track id); `until` a screen, `ms` | `{tapped, screen, state, ok}`: pointerdown, pointerup and click on the real control; a hidden, disabled or unlisted control is refused |
| `nav` | `flow` tt / race, `track`, `weather`, `tod`, `entry` setup / garage / daily, `go` (default true) | `{ok, screen, state, ms, steps:[{step, ok, screen, ms}], door}`; starts on the title; `door` = `menuPrep().door` |
| `batch` | `steps[]` of `{cmd, args}` | one result per step; stops at the first failure (or a `tap` / `nav` whose `value.ok` is false); `reload` / `path` only last |
| `reload` | — | `{reloading}` (may be lost), then a new hello |

## Recipes

Idle title screen, then a race, in two round trips:

```apex-cmd
{"cmd":"batch","args":{"steps":[{"cmd":"facts"},{"cmd":"frames","args":{"seconds":10}}]}}
```

```apex-cmd
{"cmd":"batch","args":{"steps":[{"cmd":"call","args":{"method":"race","args":["monza"]}},{"cmd":"wait","args":{"ms":8000}},{"cmd":"call","args":{"method":"go"}},{"cmd":"wait","args":{"ms":3000}},{"cmd":"frames","args":{"seconds":10}},{"cmd":"call","args":{"method":"perf"}}]}}
```

`call race` replies only once the race reaches the grid (the bridge awaits it; a grid failure is `ok:false "Race start
did not reach the grid"`), so no wait is needed after it; `go` answers `{ok:true, value:false}` when it refuses. Check
`call info` / `physState` for state `race` before trusting `frames`.

WebGPU vs WebGL2 A/B (each `path` reloads; wait for each new hello and check `facts.render.live`
and `facts.render.engine`: `live` reads `webgl2` for both three.js-on-WebGL2 and a silent GLX fallback):

0. `{"cmd":"path"}` — record Bryce's pin now; the `was` in a reloading `path` reply may never arrive.
1. `{"cmd":"path","args":{"to":"webgpu"}}` → hello → the race recipe above.
2. `{"cmd":"path","args":{"to":"webgl2"}}` → hello → the same recipe.
3. `{"cmd":"path","args":{"to":"auto"}}` to give Bryce his setting back (or the pin step 0 recorded).

Hands-free BENCHMARK (the game reloads per leg; one hello per reload; duration: the test's `help` in `TESTS`,
`js/perf/bench-run.js`):

1. `{"cmd":"bench","args":{"op":"tests"}}` — ids and leg counts.
2. `{"cmd":"bench","args":{"op":"start","test":"quick"}}`, alone (not in a `batch`): the page reloads before it
   replies, so the next hello is the ack. BenchRun restores Bryce's renderer pin at the end.
3. After the last hello: `{"cmd":"bench","args":{"op":"status"}}`, then `result`, then `leg` with `i` for detail.

Snapshot: `{"cmd":"snap","args":{"w":320}}`. Decode `value.jpeg` (strip `data:image/jpeg;base64,`) into
`scratch/phone-snap-<n>.jpg` and Read it. A black frame from `from: "game"` is a readback limit, not proof the
phone shows black: ask Bryce before calling it a render bug.

## Menu route: nav and tap

#6383. `call race` / `tt` jump to the grid and skip the menus and the garage drive-out; `nav` walks
the player's route instead, tapping the same buttons a thumb does and waiting (20 s a step, 60 s for RACE!) for each
screen; RACE! answers as soon as the garage drive-out is on screen (`screen: "drive-out"`), so a `snap` right after it
shows the world outside the door. It never sets state: weather and hour are stepped on the SESSION SETUP chevrons. Read `value.ok` and the last
step's `error`: the outer `ok` only says the command ran. A synthetic tap has no user activation, so audio unlock,
haptics, tilt permission and fullscreen behave as before the first real touch. `door` is the world behind the garage
door: `built` (the circuit id built), `dark`, `readyFor` (the circuit, tod and weather the menu prep readied) and
`want` (the session asked for) and `driveOut`; `readyFor` ≠ the asked tod / weather is the wrong world.

#5835 drive-out world, all three entries (one comment each; Bryce on the title screen first, a `reload` between):

```apex-cmd
{"cmd":"batch","args":{"steps":[{"cmd":"nav","args":{"flow":"tt","track":"monza","weather":"rain","tod":"night","entry":"setup"}},{"cmd":"wait","args":{"ms":1000}},{"cmd":"snap","args":{"w":320}}]}}
```

Then the same with `"entry":"garage"` (picker → YOUR CAR → garage DONE → SESSION SETUP → RACE!) and
`{"cmd":"nav","args":{"entry":"daily"}}` (DAILY pins its own circuit, weather and hour). For the case that used to
fail, run one entry right after a session with a different weather or hour: finish or quit it (`tap` `pausebtn`, then
`pm-quit`) and `nav` again without a reload. END TIME TRIAL: drive into the box, then
`{"cmd":"tap","args":{"id":"hud-end-session"}}`, `cs-arrival-skip` for SKIP, `cs-done` for VIEW RESULTS.

## Cannot measure

Read on iPhone Safari and the Home Screen app, these fields do not mean what their names say (code:
`js/agent/apex-bridge.js` `frames` and `facts`).

- **A suspension.** `frames.hidden` is sampled once, in the last rAF tick, which only runs once the page is visible
  again; nothing listens for `visibilitychange`. A run that was backgrounded still reads `hidden: false`. Trust a
  run only when the reply's outer `ms` is about `seconds` x 1000 and `maxMs` is under 1000; a larger `maxMs` is the
  hole, and it sits inside `fps` and `meanMs`.
- **Long tasks.** WebKit has no `longtask` or `long-animation-frame` entry type. `frames` observes without a
  support check, so `frames.longTasks` reads 0; `frametimeBench` `longTasks` reads 0; `raceEntryProfile` reads
  `longTasks: []`, `blockMs: 0` with `supported: false`; `perf` reads `loaf: {supported: null}` until
  `perf({on:true})`, then `{supported: false}`. A 0 from the phone is "not measured"; use `maxMs` and `over33`.
- **Memory in bytes.** `texCensus` is `{supported: false, bytes: null}` on the three path, Safari has no
  `performance.memory` (heap fields read null or "unsupported"), and `facts.mem` (`navigator.deviceMemory`) is
  always null. `memState` numbers (through `recorder` or `bench result`) are three.js object counts and its own
  array-size estimates, not GPU-resident memory.
- **Frames drawn.** `fps` is the rAF cadence, not the render rate: RenderRate skips `render()` on some rAFs without
  changing it (`js/perf/render-rate.js`). Safari delivers 60 Hz rAF on a 120 Hz screen and Low Power Mode caps it
  at 30, so a `p50` near 33.3 is the OS cap, not GPU load.
- **The adapter.** `facts.gpu` is only `!!navigator.gpu`; the path and engine are `facts.render`.
