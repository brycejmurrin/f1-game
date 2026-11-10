# Phone perf, the half that needs no real phone (2026-11-10)

Kind: measurement · Re-measure-by: 2026-12-15

Continues `PHONE-PERF-HUNT-2026-11-09.md` §6. Session `claude:session_01BEw9UFX6oYgayDZxfwkXtC`. Rule for this
note: no earlier number is quoted as true; every row states its method and its device class.

**Device classes used here.** `software` = this container, 4 cores, no GPU: Chromium's WebGPU on a CPU rasteriser
(Dawn over SwiftShader/Lavapipe) or WebGL2 on SwiftShader. `software ×N` = the same with CDP
`Emulation.setCPUThrottlingRate(N)` on the page's main thread. `apple-ci` = GitHub's `macos-latest` runner (Apple
GPU through Metal, paravirtual), reached by the `live-frame` census request. `real phone` = none: no row in this note.

## 1. Instrument

`tools/gfx/live-frame-census.mjs` (phone shape 844×390, touch, driven race, helmet camera) gained:

- `--dsf N` (the page's DPR), `--cpu-throttle N`, `--lab dpr3|dpr2` (the URL lab below), `--row-cap s`;
- `--sweep 3,2,1.5`: after the main window, with the governor's ladder held (`govHold`), each DPR cap (descending,
  `capDpr` only lowers) × scale 1 / 0.75 / 0.5 for `--step` s: canvas px, rAF interval, rAF callback wall, GPU timer;
- per-frame counts over the window (WebGPU): `createBuffer`, `createTexture`, `createBindGroup`, `writeBuffer`,
  draws, render passes; boot and race-entry wall.

The same options ride the census request's `ls` field as `lf.*` pseudo-keys, so the `apple-ci` leg needs no
workflow edit.

`?lab=dpr2` / `?lab=dpr3` (`js/render/three/tlx.js` `labDprCap`) replaces TLX's DPR cap for one boot. No lab: the
cap is the tier's (1.5 phone, 2 desktop), unchanged. It exists so the cost of a sharper picture can be measured, on
the census and on Bryce's own phone (`https://brycejmurrin.github.io/f1-game/?lab=dpr2`).

## 2. Results

Filled in as the runs land; see the PR body for the run log until then.
