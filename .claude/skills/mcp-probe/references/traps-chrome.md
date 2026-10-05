# MCP probe traps — chrome

Load from traps.md when debugging this class of failure.

## Contents
- THE trap: never render in the MCP browser while Playwright is running
- Garage tab clicks and the black-canvas trap combine
- A car drawn off the road after `jump()`/`park()`: check the render anchors first

## THE trap: never render in the MCP browser while Playwright is running

A live game page in the MCP browser holds ~20% CPU. On this 4-core box that is
enough to starve a concurrently-running Playwright render and produce **false
failures**, not just timeouts. So:

- **Check `node tools/ci/test-bg.mjs --status` before you render here.** If a group
  is running, wait — or accept you will re-run its false-fails solo.
- **Before every `test-bg.mjs` invocation, `navigate_page(about:blank)`
  unconditionally** — even when you think you already parked. Make parking a
  precondition of starting Playwright, not something you remember afterward.
- **Parking is necessary but not sufficient — verify by CPU, then kill by age.**
  `about:blank` can leave the MCP GPU process spinning (emulation overrides
  often survive navigation). Park, then CHECK, then kill:

  ```sh
  # Ages separate the two trees: the run you just started is seconds old,
  # an MCP browser is minutes old.
  ps -eo pid,etimes,pcpu,comm | awk '$4 ~ /chrome/ {print $1, $2"s", $3"%"}'
  for p in $(ps -eo pid,etimes,comm | awk '$2>120 && $3 ~ /chrome/ {print $1}'); do
    kill -9 $p 2>/dev/null            # >120s = pre-dates the run; MCP's, not Playwright's
  done
  ```

  Do this AFTER `test-bg.mjs` has started (so its own processes are the young
  ones) and confirm every survivor shares the run's age.
- A screenshot returned with the left ~400 px solid black = the WebGL canvas, not
  the MCP. HeadlessChrome GLX hides `#game` (opacity 0) and blits onto
  `#game-soft` — a `#game` locator shot is that black gap. Await
  `GLX.awaitSoftPresent()` then capture `#game-soft` (or a compositor clip of
  its box). For UI (not 3D) work, `headless(true)` + hide `#game` first — that's
  survey-ui-matrix's department.

---

## Garage tab clicks and the black-canvas trap combine

Driving the GARAGE screen (`#carsetup`) with `chrome_click` on a category tab
(`role=tab`, e.g. LIVERY) — or a livery swatch button — hit two issues back to
back, both reproduced twice in the same session:

- **`click()` on a `role=tab` control timed out** ("did not become interactive
  within the configured timeout") even though `take_snapshot` showed it as
  `selectable`, not disabled, and not obscured (`#game-soft`'s computed style
  is `pointer-events: none`, so it isn't the overlay eating the click). Root
  cause not isolated — worked around by dispatching a real DOM click instead:
  find the element by its visible text and call `.click()` on it from
  `evaluate_script`, e.g. `Array.from(document.querySelectorAll('*')).find(e
  => [...e.childNodes].some(n => n.nodeType===3 &&
  n.textContent.trim()==='LIVERY'))`, then walk `.parentElement` up to the
  nearest `BUTTON` before clicking. Immediate and reliable both times; try the
  MCP `click` tool first, fall back to this rather than retrying it.
- **Every UI-driven scene change (a livery swap, not just `jump()`/`park()`)
  needs its own present-wait** before the next screenshot, same as the
  black-canvas trap above — the frame on `#game-soft` is one blit behind the
  DOM state until you await a new generation. Confirmed **you do not need
  `snapCam()`/`invalidateSoftPresent()` first**: calling
  `await __apex.awaitPresent(8000)` (added 2026-09-15 as the `__apex` front
  door for what was `GLX.awaitSoftPresent()` — same wait, right whichever
  backend is bound, no need to know `GLX` is a bare global) on its own is
  enough to arm the wait (`softBlit()`'s guard is
  `_softPresentWaiters.length || _softCaptureDue`, and the underlying
  `awaitSoftPresent()` itself pushes a waiter) — `gen` advanced by exactly one
  on every click-then-await round-trip in this session, with no camera helper
  called in between. Loop per interaction: click (DOM-dispatch if
  `chrome_click` times out) → `await __apex.awaitPresent(8000)` in one
  `evaluate_script` call → `take_screenshot`.

---

## A car drawn off the road after `jump()`/`park()`: check the render anchors first

The HUMAN car is drawn from the world-space render anchors `c.rPrevPx`/`c.rPrevPz`
blended toward `c.px`/`c.pz` by `renderAlpha` (`playerAnchor()`/`renderPosOf()`,
js/game.js), not from the arc anchors that feed the AI branch. `jump()` syncs them
through `AgentView.syncRenderAnchors(G.player)`, so a teleport renders grounded at
the `physState()` position. If a screenshot ever shows the car detached from the
road, compare `rPrevPx` with `px` before distrusting the shot: `physState()` and
`groundY()` read the physics position and stay correct even when the drawn mesh
is wrong.
