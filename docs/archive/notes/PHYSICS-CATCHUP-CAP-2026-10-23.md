# Physics catch-up cap on phone-class CPU — 2026-10-23

Perf known-win #10 (PERF-KNOWN-WINS-2026-10-23, PR #3568; from PERF-FRESH-HUNT #5) asked whether
`tickBody`'s fixed-step catch-up cap (`steps < 5`, `js/game.js` ~8527) feeds a spiral of long frames on a
slow phone, and whether a lower or time-budgeted cap would help. **Verdict: the cap is fine; no code
change.** Measured below.

## Step cost, real Chromium V8, CPU-throttled

`node tools/perf/profile.mjs monza --mode step --repeat 2 --steps 1500 --warm 1500 --cpu-throttle N`
(`--cpu-throttle` added by this PR: CDP `Emulation.setCPUThrottlingRate` for the whole page). Monza, 22 cars,
`headless(true)` so no render in the timing. Digest `b1894a5d` identical in every arm (the throttle changes
timing, never the sim).

| CPU | p50 ms/step | p95 | p99 | max | ±p50 |
|---|---|---|---|---|---|
| 1× | 0.82 | 2.02 | 2.90 | 3.74 | 0.33 (a commit-hook guard run overlapped; PERF-SCENE-CPU measured 0.33–0.43) |
| 4× | 2.45 | 4.30 | 6.87 | 7.32 | 0.14 |
| 6× | 4.27 | 6.90 | 8.82 | 11.61 | 0.07 |

A spiral of death needs one step to cost more wall time than the 16.7 ms it simulates (each catch-up
step then adds more debt than it pays). The worst single step measured at 6× is 11.6 ms; p99 is about
half the budget. So the backlog after a hitch always shrinks.

## Hitch recovery per cap (model)

The model below (run as `node catchup-model.mjs <stepMs> <renderMs> <hitchMs>`) replays the loop: steps =
min(cap, ⌊acc/h⌋), the backlog over the cap is dropped (as `game.js` does), frame wall = render + steps × step
cost rounded up to vsync.

```js
// Frame-loop model of game.js tickBody's fixed-step catch-up after one hitch.
// frame wall = render R + steps*c, vsync-quantised; steps = min(cap, floor(acc/h)); backlog over cap is dropped.
// usage: node catchup-model.mjs <stepMs> <renderMs> <hitchMs> [vsyncMs=16.667]
const [c, R, H, V = 1000 / 60] = process.argv.slice(2).map(Number), h = 1000 / 60;
for (const cap of [2, 3, 4, 5]) {
  let acc = 0, dtPrev = H, frames = [], dropped = 0, steps = [];
  for (let f = 0; f < 12; f++) {
    acc += Math.min(dtPrev, 250); let k = 0;
    while (acc >= h && k < cap) { acc -= h; k++; }
    if (k === cap && acc >= h) { dropped += acc - acc % h; acc %= h; }
    const work = R + k * c, wall = Math.ceil(work / V - 1e-9) * V;
    frames.push(wall.toFixed(1)); steps.push(k); dtPrev = wall;
  }
  console.log(`cap ${cap}: steps ${steps.join(",")}  frames ${frames.join(" ")} ms  dropped ${dropped.toFixed(1)} ms`);
}
```

| scenario (step / render / hitch) | cap 2 | cap 3 | cap 4 | cap 5 (today) |
|---|---|---|---|---|
| 4× p50: 2.45 / 10 / 120 | frames 16.7, drops 83 ms sim | 33.3 then 16.7, drops 67 | same, drops 50 | same, drops 33 |
| 6× p50, 30 fps render: 4.27 / 25 / 120 | 50 ms frames, **permanent slow-mo** (2 steps per 3 owed), drops 267 ms | 50 ms, drops 67 | 50 ms, drops 50 | 50 ms, drops 33 |
| 6× p99 every step: 8.82 / 25 / 250 | 50 ms, slow-mo | 66.7, slow-mo | 66.7 | 83.3 ms (5 steps sustain) |

Reading: at every realistic step cost the frame after a hitch is back on cadence within one frame at
every cap, so a lower cap buys no frame time. What it does change is how much sim time is thrown away:
the race clock and the AI fall behind the wall clock (slow motion), and at a 30 fps render even cap 3
is already the steady state (3 steps per 50 ms frame is real time), so cap 2 would slow the whole race.
Only the pathological row (every step at the 6× p99 plus a 25 ms render) holds a 5-step regime, and
there a lower cap trades frame time for permanent slow motion; the governor's render sheds (lower
render ms) are the right lever for that device, and they already react to long frames.

Determinism is not at stake either way: the step size is fixed and the cap only decides how much
backlog is dropped (`PerfGov.recordSimulation` counts it as `droppedSimS`, the solo start lights run on the
wall clock, #1882).

## Close-out

Known-win #10: **measured, no change.** Re-open only if a handset trace shows physics p99 above ~12 ms
per step (`__apex.perf()` `physicsSteps` / frames > 2.3 at a steady 30 fps with `droppedSimS` climbing),
which would put one step near its own 16.7 ms budget.
