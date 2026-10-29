# Brake target (AI brakes too early / late, dives too deep)

`AiDrive.brakeTarget(ctx)` (ai-drive.js) = min over look-ahead samples of
`sqrt(vC² + 2·brake·0.85·d)`, `vC = cornerSpeed(k, latMax·bank·grip)·skill·diffCorner`
(`latMax` carries the aeroLoad scale), then multiplied by house `hold`, the craft
LATE-BRAKE (attacking with room > 1.6 m: up to ×`lerp(1, 1.07, craft)` × house attack),
`optimism` (±1.2 %) and `errMul` (a missed marker).

- "Dives too deep" = the late-brake / optimism terms.
- "Brakes too early" = too low `vC` (k, grip, `diffCorner`, `skill`), too small `0.85`,
  or `errMul`/`hold`.

`brakeDecision` turns `speed - vLim` into a pedal (soft/full band from `consistency`).
Samples and ctx are built in `game.js` (`_aiBr`, grep `AiDrive.brakeDecision`):
node-aligned `pushLook` from the car out to `look`; on-line uses `TrackLine.pathK`.

Unit pins in `ai-drive.test.mjs`: `brakeTarget: a cached bank grip…`, `brakeDecision: no
pedal under the envelope…`, `brakeDecision's P trim…`, `craft late-brake raises the
limit…`, `optimism raises brakeTarget…`, `brake planner carries the public corner
envelope…`.

No CLI prints the brake point itself: `ai-race.mjs pace` (lap time) and `line`
(approach/apex) are the closest VM proxies; for the exact point probe `__apex` live
(browser, skill mcp-probe).
