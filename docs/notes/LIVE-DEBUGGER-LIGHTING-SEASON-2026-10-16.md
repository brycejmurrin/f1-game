# Live debugger hunt — lighting and standalone Season (2026-10-16)

Lane: `cursor/live-debug-lighting-season-8d2f`. Debug Chrome (SwiftShader, headless=new) on
`http://127.0.0.1:3456/`, driven through the `js-debugger` MCP. Software-browser evidence only: no
claim about a player's GPU.

## Status: in progress (skeleton)

## Lighting — captures so far

| probe | result |
|---|---|
| 10 circuits x day/dusk/night/dawn, `race()` then wait for `info().track === id`, `lightState()` NaN scan | no NaN in any field; `floodEmit` 0 / 0.069 / ~0.145 / ~0.233 for day / dawn / dusk / night; 31 of 40 rows built in the 10 s wait (the other 9 timed out on SwiftShader and are not evidence) |

## Season — captures so far

| probe | result |
|---|---|
| saved season, calendar `[t0, ghost, t1, t2, t3]`, round 3, stage `race`, drop 2 | `resume()` maps to round 2 (t2) and compacts `roundPts` to `[5,3,2]`: correct |
| tie on 20 points, countback, drop 2 of 6 | order a, c, b: correct |
| sprint-per-round + classic + flPoint, 12-car order | sprint 8 pts, then GP 10 + FL 1 (d4: 4 + 2 + 1 = 7): correct |
| short race 2 of 5 laps at a sprint round | 0 points (under 50 %): by design |

## Observations (not defects)

- O1 `SeasonCal.resume()` of a save whose calendar holds ONLY unknown circuit ids: `remap` is null, the
  config normalises to the full default calendar and the stored round is kept as is, so a finished
  2-round season reads as round 2 of 24. The load is flagged lossy, so it cannot be written back.
  Reachable only with a stale cached shell.
- O2 Debugger harness: `Runtime.evaluate` of a long `awaitPromise` loop times out with `headless(false)`
  on SwiftShader; the page then also refuses `Debugger.enable` until the render settles.
  `headless(true)` plus a stored `window.__x` result read afterwards is reliable.

## Not yet covered

Lamp cap and floodlight gate, `lightTune` extremes, LightPresets/LightEdits baking, lamp-bake across
10 switches, frame-lights allocations, Season SETUP screen, caught-exception pauses.
