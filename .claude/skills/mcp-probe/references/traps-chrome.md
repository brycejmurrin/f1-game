# MCP probe traps — chrome

Load from traps.md when debugging this class of failure.

## THE trap: never render in the MCP browser while Playwright is running

A live game page in the MCP browser holds ~20% CPU (survey-ui-matrix measured
21.7%). On this 4-core box that is enough to starve a concurrently-running
Playwright render and produce **false failures**, not just timeouts. Measured
2026-08-12: rendering one Portimão frame here while `test:webgl` ran turned two
passing specs red — a 120 s timeout AND an assertion miss (`dynamic player shadow`
read a stale-frame transform, delta 694 vs `< 5`). Both passed clean solo. So:

- **Check `node tools/ci/test-bg.mjs --status` before you render here.** If a group
  is running, wait — or accept you will re-run its false-fails solo.
- **Park to `about:blank` (`navigate_page`) the moment you're done**, so the warm
  page doesn't tax the next `test-solo`.
- **"The moment you're done" is a promise you WILL break once you get absorbed in
  something else — make parking a precondition of starting a Playwright run, not
  a thing you remember to do first.** MEASURED 2026-08-13: after a multi-shot MCP
  session proving out a shadow-acne fix, the very last verification screenshot's
  `navigate_page(about:blank)` call got skipped — attention had moved to writing
  up the finding — and the live game page sat there actively rendering (frozen
  car, but the render loop keeps running) through a `test-bg.mjs gfx` (then `ab webgl`)
  launch. Load average climbed to 8–12 (guidance: < 3) and produced a real
  `page.screenshot: Timeout 60000ms exceeded` failure plus several more in the
  second group — a genuine false failure that took a `ps -eo pid,etimes,args`
  audit to trace back to 4+ lingering Chromium renderer processes from the MCP
  session, not to orphans from a killed run (the first, wrong hypothesis — those
  look identical in `pgrep -cf pw-browsers` and only `ps` with full args
  distinguishes `chrome-devtools-mcp`'s own tree from Playwright's). **Before
  every `test-bg.mjs` invocation, `navigate_page(about:blank)` unconditionally**
  — even (especially) when you're confident you already parked. It's one call;
  the cost of skipping it once is a full contaminated test run.
- **Parking is NECESSARY BUT NOT SUFFICIENT — verify by CPU, then kill by age.**
  The bullet above reads as though `about:blank` ends the problem. It does not.
  MEASURED 2026-08-14: after a mobile-emulation session, `navigate_page` to
  `about:blank` returned success and the page WAS blank, yet the MCP browser's
  GPU process still held **174% CPU** five minutes later, and a `test:webgl`
  launched on top of it inherited that load. (A plausible contributor: CPU
  throttling / device-metrics overrides set via `emulate` survive the
  navigation — the emulation banner is re-printed on every subsequent call —
  so the compositor keeps working even with nothing to draw.) So park, then
  CHECK, then kill:

  ```sh
  # Ages separate the two trees far more reliably than args do: the run you
  # just started is seconds old, an MCP browser is minutes old.
  ps -eo pid,etimes,pcpu,comm | awk '$4 ~ /chrome/ {print $1, $2"s", $3"%"}'
  for p in $(ps -eo pid,etimes,comm | awk '$2>120 && $3 ~ /chrome/ {print $1}'); do
    kill -9 $p 2>/dev/null            # >120s = pre-dates the run; MCP's, not Playwright's
  done
  ```

  Do this AFTER `test-bg.mjs` has started (so its own processes are the young
  ones) and confirm every survivor shares the run's age. A parked-but-spinning
  MCP browser is indistinguishable from a healthy box by load average alone,
  which is why the check has to be per-process.
- A screenshot returned with the left ~400 px solid black = the WebGL canvas, not
  the MCP. HeadlessChrome GLX hides `#game` (opacity 0) and blits onto
  `#game-soft` — a `#game` locator shot is that black gap. Await
  `GLX.awaitSoftPresent()` then capture `#game-soft` (or a compositor clip of
  its box). For UI (not 3D) work, `headless(true)` + hide `#game` first — that's
  survey-ui-matrix's department.

---

## A SIXTH trap (FIXED 2026-08-13): `jump()`/`park()` used to render the car mid-air

`playerAnchor()`/`renderPosOf()` (js/game.js) draw the HUMAN car from
`c.rPrevPx`/`c.rPrevPz` (WORLD-space render-interpolation anchors) blended
toward `c.px`/`c.pz` by `renderAlpha` — NOT from `c.rPrevS`/`c.rPrevX` (the
arc-based anchors, which only feed the AI-car branch). `jump()`
(`js/agent/apex.js`) reset `rPrevS`/`rPrevX` on teleport but never touched
`rPrevPx`/`rPrevPz`, so the player mesh kept rendering a straight-line lerp
between wherever it was BEFORE the teleport and the new spot. Under `park()`'s
`G.frozen` (physics never steps again, so `renderAlpha` never advances) that
lerp never resolved — the car sat at a permanent mid-blend position, which on
a curved track can be off the road, mid-air, or nowhere near either endpoint.
MEASURED: `park(0.10)` on Monaco (a track with a ~36 m road-over-terrain
viaduct gap right there) rendered the car airborne against the skyline, no
road visible under it, in BOTH the chase cam and a free-cam aimed exactly at
`physState().px/pz` — the free-cam shot showed no car at all, because the
render position wasn't near the aim point either. `physState()`/`groundY()`
read correctly the whole time — only the drawn mesh was wrong, which is why
this reads as "the car is floating," not as an obvious data bug. Fixed by
also syncing `G.player.rPrevPx = G.player.px; G.player.rPrevPz = G.player.pz;`
in `jump()` — verified: same `park(0.10)` now renders the car grounded,
correctly oriented, at the exact `physState()` position. If a screenshot ever
shows the car detached from the road again, checking `rPrevPx` vs `px` is the
first move, not distrusting the shot.

