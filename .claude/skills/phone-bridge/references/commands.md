# Phone bridge commands and results

## Contents
- Commands
- Recipes
- Menu route: nav and tap
- Any control: tap, set, key, scroll
- Driving: drive
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
| `call` | `method`, `args[]` | any `__apex` method but the deny-list (`CALL_DENY`, `CALL_DENY_PREFIX` in `js/agent/apex-bridge.js`: saves and files, career, lobby / net, `garageParts`, `loadCarModel`) |
| `path` | `to` webgpu / webgl2 / auto, `reload` | `{was, pinned, reloading}` (may be lost to the reload); no `to` = the `render` state alone |
| `bench` | `op` tests / start (+`test`) / stop / status / result / leg (+`i`) | BenchRun (SETTINGS > GRAPHICS > BENCHMARK); `start` reloads before it replies |
| `snap` | `w`, `q` start quality | `{w, h, q, from, chars, jpeg: "data:image/jpeg;base64,…"}` |
| `wait` | `ms` | `{waited}`; for spacing steps inside a `batch` |
| `gpuTest` | `op` start / stop / status / active | GPU TEST (`GpuTestRun`) |
| `recorder` | `op` start / stop / isOn / json | PHONE TEST recorder |
| `screen` | — | `{screen, state}`: the topmost visible screen (`title`, `select`, `setup`, `garage`, `loading`, `quali`, `results`, `pause`), else `drive-out` (the garage-out, state still `menu`) or `race` |
| `tap` | one of `id`, `text` (the visible label, exact or prefix, case-blind), `data` ({name: value} for `data-<name>`), `tile` (a track id); `within` an id, `nth`; `until` a screen, `ms` | `{tapped, screen, state, ok}`: pointerdown, pointerup and click on the real control; hidden, disabled, not a control, ambiguous (add `nth`), or inside a denied area (§Any control) is refused with the reason |
| `set` | a control (`id` / `text` / `data`) and `value`; or `key` (a SETTINGS FILE key) and `value` | control: `{set, value, screen}` through its own UI (a SettingRow's chevron, a select's change, a checkbox's click, a range's input + change); key: `{key, was, now, reload: true}` |
| `key` | `key` (Escape, Enter, Space, Tab, arrows, Home, End, PageUp, PageDown, Backspace), `id`, `shift` | `{key, to, prevented, screen}`: keydown + keyup on the focused element (or `id`) |
| `scroll` | `id` (else the page) and one of `by` px, `to` top / bottom, `into` true | `{scrolled, top, height, view}` |
| `nav` | `flow` tt / race, `track`, `weather`, `tod`, `entry` setup / garage / daily, `go` (default true) | `{ok, screen, state, ms, steps:[{step, ok, screen, ms}], door}`; starts on the title; `door` = `menuPrep().door` |
| `drive` | ONE of `to` "box", `laps` 1-5, `seconds` 1-600; `ms` cap (240 000); `wait` false; or `stop` / `status` true | `{ok, screen, state, reason, inBox, pit, laps, steps:[{phase, t, s, kph}], pitActions}` (outer `ms` too): `value.ok` = goal met; `reason` box / laps / seconds / timeout / missed / lane-closed / touch / paused / state:… (§Driving) |
| `batch` | `steps[]` of `{cmd, args}` | one result per step; stops at the first failure (or a `tap` / `nav` / `drive` whose `value.ok` is false); `reload` / `path` only last |
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
`pm-quit`) and `nav` again without a reload. END TIME TRIAL with no human: §Driving.

## Any control: tap, set, key, scroll

Bryce, 2026-11-25: "Let's just make it so Claude link can basically drive the whole game or do anything it wants to
test", then he picked a broad allow-list over eval. So the bridge presses or sets ANY visible, enabled control and calls
any `__apex` method, EXCEPT the deny-lists. `TAP_DENY` covers career, saves and data, the garage and career files, VS
FRIEND and phone pairing, and the link's token form and badge. It matches an id, its `<id>-…` family and every element
inside one, so the doors (`mb-career`, `pm-open-files`) are refused along with what is behind them. A control inside one
is never even FOUND by `text` or `data`. `CALL_DENY` covers save / persist / settingsFile / garageFile, every career,
lobby and net hook, `garageParts` and `loadCarModel`. Still no eval: no command evaluates a string, and JSON carries
no function.

- Find by what Bryce sees: `{"cmd":"tap","args":{"text":"MUSIC & SOUND"}}`. A label shared by two controls answers
  `2 controls match … (ids)`; add `nth` or `within`.
- `set` by control goes through the control's own handlers, so it stores and applies exactly as a thumb would:
  `{"cmd":"set","args":{"id":"rs-weather-sel","value":"rain"}}`. `set` by key writes a SETTINGS FILE key (a SPEC row in
  `js/ui/settings-export.js`) under the import's own rules: no migration-version or `noImport` row, `normalize`
  first, then its type and `oneOf`, and no tables. Most screens read a stored key at load, so the reply
  says `reload: true`: put a `reload` last.
- `key` events are synthetic. A handler that checks `isTrusted` ignores them, the browser does not move focus on a
  synthetic Tab, and they never end a `drive` (only Bryce's real touch does).

## Driving: drive

#6397. `drive` gives the player car to SoakRun's driver (`js/perf/soak-run.js`: the AUTO SOAK law, and on the pit
lane PitLane's own lines, the ones the AI follows). It is agent control through the `setInput` seam, never a player
assist: it starts only from this command and lets go on `stop`, a pause, a quit, a hidden page, a REAL touch or key
(Bryce taking over; the bridge's own taps do not count) and when the link ends. It waits up to 30 s for the session
(`nav`'s RACE! answers during the garage drive-out), and refuses a menu, a paused game and VS FRIEND.

- `{"to":"box"}`: on from wherever the car is, round to the pit entry, down the entry road and the lane at the
  limiter, square into this car's box. About 60-110 s from mid-lap (every circuit reached its box in the VM,
  `docs/notes/BRIDGE-DRIVE-2026-11-25.md`); a whole lap more when the car starts past its box. Ends `box` with
  `pitActions` naming the pit buttons on screen. `lane-closed` = no stops this session (a race with wear off).
- `{"laps":1}` / `{"seconds":30}`: an autopilot lap at a safe pace, then hand back.
- The bridge serves one command at a time, so a `drive` that waits blocks `stop`. For a long drive send
  `{"wait":false}` (answers `{started}` at once), then `{"status":true}` and `{"stop":true}`.
- A TIME TRIAL holds the car in its box for the stop plus 4 s, and END TIME TRIAL exists only then: tap it in the SAME
  batch (a separate comment is a 4 s poll plus GitHub's lag, too late).

END TIME TRIAL, no human (Bryce on the title screen; one comment, ~2-3 min to the reply):

```apex-cmd
{"cmd":"batch","args":{"steps":[{"cmd":"nav","args":{"flow":"tt","track":"monza"}},{"cmd":"drive","args":{"to":"box"}},{"cmd":"tap","args":{"id":"hud-end-session","until":"garage","ms":10000}},{"cmd":"wait","args":{"ms":1500}},{"cmd":"tap","args":{"id":"cs-arrival-skip"}},{"cmd":"wait","args":{"ms":1000}},{"cmd":"screen"},{"cmd":"snap","args":{"w":320}}]}}
```

From ANY screen (a race running, the pause menu, a sheet open), the same check with no human at all. First, back
to the title: `{"cmd":"batch","args":{"steps":[{"cmd":"key","args":{"key":"Escape"}},{"cmd":"wait","args":{"ms":800}},{"cmd":"screen"}]}}`.
If that reads `pause`, `{"cmd":"tap","args":{"id":"pm-quit","until":"title","ms":15000}}`; if `results`,
`{"cmd":"tap","args":{"id":"res-menu","until":"title","ms":15000}}`. Then the recipe above.

Read `steps[1].value.inBox` and `pitActions` (the box was reached and END TIME TRIAL was up), `steps[2].value.ok`
(the garage opened), then the screen and snap; `cs-done` is VIEW RESULTS from there. As `__apex` calls (the sim
stepped inside one call, so the screen freezes while it runs): `call rollout` with
`[{"policy":"box","seconds":120}]`; `stoppedEarly.reason` `policy:box` is the box. No `to:"grid"`: nothing in the game
reads a car parked on its grid slot (the note above).

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
