# Phone bridge commands and results

Every command is one comment holding one fence. The reply is one comment:

````
```apex-result
{"re": <your comment id>, "cmd": "frames", "ok": true, "ms": 10012.4, "value": {…}}
```
````

Parse: take the text between ` ```apex-result\n ` and the closing fence, `JSON.parse` it, match `re`. A value over
60,000 chars comes back as `{value: null, truncated: <chars>, head: <first 2000>}`: ask for less.

## Commands

| cmd | args | value |
|---|---|---|
| `ping` | — | `{pong, t}` |
| `facts` | — | `{sha, ua, dpr, w, h, gpu, cores, info, render:{backend, threePath, live, engine, fallbackWhy}}` |
| `frames` | `seconds` 1–60 | `{frames, fps, meanMs, p50, p95, p99, maxMs, over33, longTasks, hidden}` (rAF intervals; `hidden: true` = void) |
| `call` | `method`, `args[]` | one `__apex` method in `CALL_OK` (see `js/agent/apex-bridge.js`) |
| `path` | `to` webgpu / webgl2 / auto, `reload` (default true) | `{was, pinned, reloading}`; no `to` = the `render` state alone |
| `bench` | `op` tests / start (+`test`) / stop / status / result / leg (+`i`) | BenchRun (SETTINGS > GRAPHICS > BENCHMARK) |
| `snap` | `w` 64–640 (320), `q` start quality (0.6) | `{w, h, q, from, chars, jpeg: "data:image/jpeg;base64,…"}` |
| `wait` | `ms` 0–30000 | `{waited}`; for spacing steps inside a `batch` |
| `gpuTest` | `op` start / stop / status / active | GPU TEST (`GpuTestRun`) |
| `recorder` | `op` start / stop / isOn / json | PHONE TEST recorder |
| `batch` | `steps[]` 1–10 of `{cmd, args}` | one result per step; stops at the first failure; `reload` / `path` only last |
| `reload` | — | `{reloading}`, then a new hello |

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

1. `{"cmd":"path","args":{"to":"webgpu"}}` → hello → the race recipe above.
2. `{"cmd":"path","args":{"to":"webgl2"}}` → hello → the same recipe.
3. `{"cmd":"path","args":{"to":"auto"}}` to give Bryce his setting back (or the value `was` showed).

Hands-free BENCHMARK (the game reloads per leg; one hello per reload; ~5 min for `quick`):

1. `{"cmd":"bench","args":{"op":"tests"}}` — ids and leg counts.
2. `{"cmd":"bench","args":{"op":"start","test":"quick"}}` — BenchRun restores Bryce's renderer pin at the end.
3. After the last hello: `{"cmd":"bench","args":{"op":"status"}}`, then `result`, then `leg` with `i` for detail.

Snapshot: `{"cmd":"snap","args":{"w":320}}`. Decode `value.jpeg` (strip `data:image/jpeg;base64,`) into
`scratch/phone-snap-<n>.jpg` and Read it. A black frame from `from: "game"` is a readback limit, not proof the
phone shows black: ask Bryce before calling it a render bug.
