---
name: mcp-probe
description: Use when driving the LIVE game or the DEPLOYED site interactively with the Chrome DevTools MCP or the tinyfish MCP — booting the working tree to render a 3D frame or poke __apex live (the interactive alternative to writing a scratch/*.mjs), heap/perf/console inspection during a bug hunt, or a post-deploy liveness check that GitHub Pages is serving the expected build. For UI-layout matrix review use survey-ui-matrix (canvas hidden); for a repeatable batch screenshot in CI use playwright-probe.
---

# Probing the live game with the MCPs

Two MCP browsers sit alongside the Playwright suite. Neither replaces it — the
suite is 111 specs + 61 node suites, parallelised, asserted, retried, CI-gated.
These are **interactive** instruments: one browser, driven a call at a time, for
the question you can't be bothered to write a `scratch/*.mjs` for, and for the one
thing the suite never checks — the **deployed artifact**.

- **Chrome DevTools MCP** (`mcp__chrome-devtools__*`) — a real `HeadlessChrome`
  with **WebGL2 via SwiftShader** (the same renderer the suite uses; measured:
  `ANGLE (…SwiftShader…)`). It reaches **both** `http://127.0.0.1:<port>` (your
  working tree) **and** the deployed site. This is the canvas-**visible** probe:
  render a track/car, drive `__apex`, screenshot, take a heap snapshot, read the
  console. The interactive twin of `scratch/ai-shot.mjs` / `playwright-probe`.
- **tinyfish MCP** (`mcp__tinyfish__*`) — `fetch_content` / `search` over the
  public web. For us its one testing job is the **post-deploy liveness check**:
  read the live `version.json` / `index.html`. It cannot see the working tree
  (only public URLs), so it is useless for pre-ship verification.

---

## THE trap: never render in the MCP browser while Playwright is running

A live game page in the MCP browser holds ~20% CPU (survey-ui-matrix measured
21.7%). On this 4-core box that is enough to starve a concurrently-running
Playwright render and produce **false failures**, not just timeouts. Measured
2026-08-12: rendering one Portimão frame here while `test:webgl` ran turned two
passing specs red — a 120 s timeout AND an assertion miss (`dynamic player shadow`
read a stale-frame transform, delta 694 vs `< 5`). Both passed clean solo. So:

- **Check `node tools/test-bg.mjs --status` before you render here.** If a group
  is running, wait — or accept you will re-run its false-fails solo.
- **Park to `about:blank` (`navigate_page`) the moment you're done**, so the warm
  page doesn't tax the next `test-solo`.
- A screenshot returned with the left ~400 px solid black = the WebGL canvas, not
  the MCP. For UI (not 3D) work, `headless(true)` + hide `#game` first — that's
  survey-ui-matrix's department.

---

## Chrome DevTools MCP — live 3D / __apex debugging

### Setup (canvas visible — you WANT the render here)

```
# 1. serve the working tree yourself (Playwright's own server uses a random port)
python3 -m http.server 3456        # background it
```
```
mcp__chrome-devtools__navigate_page   http://127.0.0.1:3456/?v=<N>   # N = version.json
```
Then wait for the API and position the shot with the same `__apex` hooks a scratch
script uses (`docs/DEBUG-HOOKS.md`):

```js
// mcp__chrome-devtools__evaluate_script
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i=0;i<60 && !window.__apex;i++) await wait(250);
  __apex.race('portimao');
  for (let i=0;i<80 && !(__apex.info()&&__apex.info().track);i++) await wait(200);
  __apex.go();
  __apex.jump(0.315, 40, 0);   // arc s, speed, lateral — put the car at the feature
  __apex.snapCam();            // REQUIRED after jump()/park() before a shot
  await wait(400);
  return __apex.info();
}
```
```
mcp__chrome-devtools__take_screenshot   filePath: scratch/<name>.png
```

`snapCam()` after every `jump()`/`park()` or the frame is stale (same rule as the
scratch scripts). Screenshots and human-reviewed captures go under `scratch/`,
never the repo root (CLAUDE.md).

### When this beats a scratch script

- **"Does this visual change look right?"** — one navigate + eval + screenshot,
  no write→run→read-png loop. (This session confirmed the `models.js` grounded-wall
  fix by eye this way: terraces standing above grade at Portimão.)
- **Live `__apex` REPL** during a bug hunt — `physState()`, `cars()`, `scene()`,
  `world()` against the running game, iterating in the same page.
- **DevTools-only instruments the suite never wires up:**
  - `take_heapsnapshot` + `get_heapsnapshot_*` — leak hunting (the mesh-cache
    "frees every cached variant" question, GPU-buffer eviction).
  - `performance_start_trace` / `performance_analyze_insight` — frame-budget /
    GC-jitter profiling (overlaps `perf-profile`, but live).
  - `list_console_messages` (`types:["error","warn"]`) — did the page throw.
  - `take_snapshot` — the a11y tree as cheap text (see survey-ui-matrix).

### When NOT to use it

Regression coverage, anything that must assert-and-gate, the 111-spec batch, or
anything in CI. It is one stateful browser driven by the model — no assertion
framework, no parallelism, no reporter. Use Playwright (`tools/test-bg.mjs`).

---

## tinyfish MCP — post-deploy liveness check

The whole suite tests the working tree; **nothing verifies the shipped artifact**.
After a Pages deploy, confirm the live site actually serves the build you shipped:

```
mcp__tinyfish__fetch_content
  urls: ["https://brycejmurrin.github.io/f1-game/version.json"]
```
Expect `{ "build": <N> }` matching the `version.json` you pushed. A stale build
here means the Pages deploy lagged or failed (measured 2026-08-12: live was 971
while the repo was 1089 — a real lag the local suite could never have caught).
Fetch `index.html` too and grep the `?v=` tags if you suspect a partial deploy.
`run_web_automation` can go further — boot the deployed page and assert `__apex`
responds — but for a smoke check the static fetch is enough and far cheaper.

tinyfish `search` is for external grounding (research), not testing.

---

## The one-line summary

Playwright asserts the working tree in batch; **Chrome DevTools MCP looks at the
working tree live**; **tinyfish looks at the deployed site**. Keep the first in
CI, reach for the second when a scratch script is overkill, reach for the third
after every ship — and never let the second render while the first is running.
