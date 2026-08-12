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

## A SECOND trap: `snapCam()` after a free-cam call cancels the free-cam

`park()`/`jump()` need `snapCam()` right after them (see `docs/DEBUG-HOOKS.md`).
`orbit()`/`view()`/`dolly()`/`eyeAt()`/`roadside()`/`cinematic()`/`sky()` do
**not** — they position the free-cam (`G.dbgCam`) instantly, no easing to settle.
Calling `snapCam()` after one of them does `G.dbgCam = null` first and snaps back
to the ordinary player camera mode, silently discarding the framing you just set.
It doesn't error — you get a real, in-focus render, just not the shot you asked
for, so a "before"/"after" pair taken this way can show two DIFFERENT camera
positions with nothing to flag it.

MEASURED 2026-08-12 (proving out lighting-tuner sliders this way): `orbit(0.16,
40, 20, 20); snapCam();` before one screenshot and the identical call before a
second gave a wide cityscape in one and a close-up car in the other — the
`snapCam()` was cancelling the orbit both times and each shot landed at a
different point in the chase cam's own spring-back. Dropping `snapCam()` (just
`orbit(...)` + a couple of `requestAnimationFrame` waits) made every subsequent
pair land on the identical framing.

```js
// WRONG — snapCam() cancels the orbit that came before it
__apex.orbit(0.16, 40, 20, 20);
__apex.snapCam();              // <- G.dbgCam = null; back to chase
// RIGHT — free-cam hooks need no snap; just let a couple of frames settle
__apex.orbit(0.16, 40, 20, 20);
await new Promise(r => requestAnimationFrame(r));
await new Promise(r => requestAnimationFrame(r));
```

`viewState().dbgCamActive` tells you which camera is actually live — check it
once when setting up a shot sequence rather than assuming.

## A THIRD trap: verify TUNE_DEFS by grep, not by memory

Proving a lighting-tuner slider "does nothing" (or "does something") means
pushing it from its shipped default to an extreme — get either number wrong and
the test is invalid regardless of how careful the rest of it is. MEASURED
2026-08-12: two knobs (`mieScatter`, `flareStreak2`) were tested against
guessed/half-remembered defaults (0.03 and 0.4) that turned out to be wrong (the
real `TUNE_DEFS` defaults are 1.0 and 0.5) — the "no visible effect" result those
produced was really "no visible effect near an arbitrary point that happened not
to be the default," not evidence about the knob. Five more knobs in the same
session had the same class of error. Always
`grep -n 'id: "<knobId>"' js/game/lighting.js` immediately before testing a knob
and read `min`/`max`/`def` off that line — never carry values between sessions
or reconstruct them from a description.

A knob that shows no effect at its documented extreme is also worth checking for
a spatially-thin effect before concluding it's dead: a whole-frame pixel-mean
diff is blind to anything confined to a narrow band (a lens-flare core streak
occupying 2–3 pixel rows, star points in a 320×180 capture). Scan horizontal (or
vertical) bands and diff each independently — the band containing the effect
reads an order of magnitude above its neighbours even when the frame-wide mean
shows nothing.

## A FOURTH trap: two same-value screenshots must diff near-zero before you trust any pair

Before comparing knob-A-vs-knob-B, take two screenshots at the SAME value and
diff them. If that "noise floor" isn't near zero, something else in the frame
is moving — most commonly a car left with nonzero speed under a free-cam
(`orbit()`/`view()`) after `jump()`, which keeps driving while you tune the
knob, changing the framing between shots. MEASURED 2026-08-12 (`cloudDef`): a
same-value repeat under a moving car diffed at MAD 5.96 — statistically
IDENTICAL to the "signal" a 0-vs-2 comparison had just shown (MAD 6.03) at the
same pixel locations. The whole "effect" was scenery scrolling past, not the
knob. Use `park()` (freezes the car, `G.frozen = true`) instead of `jump()`
before any free-cam comparison shot; it dropped the noise floor to 0.42 on the
same scene. A knob whose signal doesn't clear a same-value noise-floor check by
several times over is not proven, whichever direction it points.

For sky/cloud knobs specifically, don't reach for `sky()` — its ~58° pitch
looks close to straight up, and the cloud plane in `js/render/shaders/sky.js`
is sampled as `dir.xz / up * 0.42`: dividing by a near-1 `up` collapses the
sampled coordinate toward one point, so every pixel reads nearly the same
noise value and the sky renders as a smooth gradient with no puffy structure
to carry a cloud-*shape* knob's effect. Use `park()` + a custom
`view({eye, yaw, pitch: ~25-35, fov})` aimed lower toward the horizon instead,
and nudge `cloudCover` — the bare weather default can be near-cloudless in the
one direction `sky()` looks. A real signal here shows up as a cloud-*shaped*
blob in a saved diff-map image (`np.abs(a-b).sum(axis=2)`, contrast-boosted and
written to PNG) sitting where the visible cloud is, not a diffuse scatter.

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
  // Prefetch baked models BEFORE race() so scenery bakedModel() emits
  if (typeof Assets !== "undefined" && Assets.loadModels) await Assets.loadModels();
  __apex.race('portimao');
  for (let i=0;i<80 && !(__apex.info()&&__apex.info().track);i++) await wait(200);
  __apex.go();
  __apex.jump(0.315, 40, 0);   // arc s, speed, lateral — put the car at the feature
  __apex.snapCam();            // REQUIRED after jump()/park() — NOT after orbit/view
  await wait(400);
  return __apex.info();
}
```
```
mcp__chrome-devtools__take_screenshot   filePath: scratch/<name>.png
```

Shell one-liner (auto-starts `:3456` if needed, parks to `about:blank` after):

```sh
python3 tools/cdmcp-cli.py apex-shot monza 0.97 --az -105 --el 26 --dist 110 \
  --out /opt/cursor/artifacts/baked-models/cdmcp-monza-paddock.png
```

`snapCam()` after every `jump()`/`park()` or the frame is stale — but **never**
after `orbit()`/`view()`/`eyeAt()` (clears dbgCam; see trap above). Screenshots
go under `scratch/` or `/opt/cursor/artifacts/`, never the repo root (CLAUDE.md).

### Background Chromium measure (logged)

```
node tools/cdmcp-bg.mjs boot --port 3462
tail -f artifacts/logs/cdmcp-measure.log
# watcher: until grep -qE "= run (passed|failed|timedout|interrupted)" artifacts/logs/cdmcp-measure.log
```

Profiles `boot` / `ui` / `full`. JSON sidecar: `artifacts/logs/cdmcp-measure.json`.
See `docs/research/CHROME-DEVTOOLS-MCP.md` § Background measure.

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
  - `lighthouse_audit` (`mode:"snapshot"`) — a11y/best-practices on the current
    screen (excludes performance; use traces for that).
  - `click` / `press_key` / `wait_for` on snapshot **uids** (`1_12`, not `1`).

### File writes and roots (measured 2026-08-12)

Heap / perf / lighthouse tools validate paths against MCP **roots**. A stdio
client that never answers `roots/list` only gets `/tmp` by default — writes to
`/workspace/scratch/...` fail with `Access denied: … not within any of the
configured workspace roots`. Fix: advertise `capabilities.roots` on
`initialize`, answer `roots/list` with `file:///workspace`, **or** write
artifacts under `/tmp` and copy out.

Full recipes + measured LCP/heap/a11y numbers:
`docs/research/CHROME-DEVTOOLS-MCP.md`.

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
