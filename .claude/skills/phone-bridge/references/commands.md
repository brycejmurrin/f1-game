# Phone bridge commands and results

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
| `facts` | — | `{sha, ua, dpr, w, h, gpu, cores, info, render:{backend, threePath, live, engine, fallbackWhy}}` |
| `display` | — | the CSS→device pixel ledger (#5166): `{dpr, inner, screen, client, visualViewport, standalone, vars:{root,hud} (--ui-scale, --vwz, --hud-scale…), game/soft:{css, rect, buffer, engine, chain}, hud:{chain:{steps, zoomProduct}, time, pos}, overlay, renderScale, build:{sha, build, swCaches, sw}}`; HUD painted px = fontSize × zoomProduct × visualViewport.scale × dpr; canvas backing = css × dpr × renderScale.scale |
| `geom` | — | the geometry ledger (docs/notes/GEOMETRY-TRUTH-HUNT-2026-11-09.md): `{inner, client, visualViewport, screen, orientation, dpr, standalone, units:{vh,svh,dvh,lvh,vw,svw}, insets:{left,top,right,bottom}, zoom:{currentCSSZoom, rectOf100At2, vwInZoom2, envInZoom2}, media, tiers, wish:{ui,hud,btn}, paint:{hudTop,hudBot,dock,dockLeft,sheet,kb,…}}`; `rectOf100At2` 200 = standardized zoom, 100 = legacy; `wish` ≠ `paint` = a slider past its fit cap |
| `frames` | `seconds` | `{frames, fps, meanMs, p50, p95, p99, maxMs, over33, longTasks, hidden}` (rAF intervals; `hidden: true` = void) |
| `call` | `method`, `args[]` | one `__apex` method in `CALL_OK` (see `js/agent/apex-bridge.js`) |
| `path` | `to` webgpu / webgl2 / auto, `reload` | `{was, pinned, reloading}` (may be lost to the reload); no `to` = the `render` state alone |
| `bench` | `op` tests / start (+`test`) / stop / status / result / leg (+`i`) | BenchRun (SETTINGS > GRAPHICS > BENCHMARK); `start` reloads before it replies |
| `snap` | `w`, `q` start quality | `{w, h, q, from, chars, jpeg: "data:image/jpeg;base64,…"}` |
| `wait` | `ms` | `{waited}`; for spacing steps inside a `batch` |
| `gpuTest` | `op` start / stop / status / active | GPU TEST (`GpuTestRun`) |
| `recorder` | `op` start / stop / isOn / json | PHONE TEST recorder |
| `batch` | `steps[]` of `{cmd, args}` | one result per step; stops at the first failure; `reload` / `path` only last |
| `reload` | — | `{reloading}` (may be lost), then a new hello |

## Recipes

Idle title screen, then a race, in two round trips:

```apex-cmd
{"cmd":"batch","args":{"steps":[{"cmd":"facts"},{"cmd":"frames","args":{"seconds":10}}]}}
```

```apex-cmd
{"cmd":"batch","args":{"steps":[{"cmd":"call","args":{"method":"race","args":["monza"]}},{"cmd":"wait","args":{"ms":8000}},{"cmd":"call","args":{"method":"go"}},{"cmd":"wait","args":{"ms":3000}},{"cmd":"frames","args":{"seconds":10}},{"cmd":"call","args":{"method":"perf"}}]}}
```

`race` returns before the track is built on a slow phone; if `go` answers `ok:false`, raise the wait. Check
`call info` / `physState` for state `race` before trusting `frames`.

WebGPU vs WebGL2 A/B (each `path` reloads; wait for each new hello and check `facts.render.live`):

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
