---
name: playwright-probe
description: Use when the user asks to screenshot/show a track or car in-game, check whether a visual change looks right, capture before/after, frame Monaco/Spa/etc., validate camera modes/screens/tracks, run Playwright headless probes, exercise __apex hooks, or inspect blank renders.
---

# Headless Playwright probing (parallel)

The renderer runs deterministically headless under SwiftShader, so you can drive
the real game and the `__apex` API from Node to validate cameras, modes, tracks,
and physics — and capture screenshots to prove it visually. Two committed tools
cover most needs; drop to a custom harness for bespoke sweeps.

## Committed tools (use these first)

```sh
# One-off: boot the game, evaluate an __apex expression, print JSON.
node tools/apex-eval.mjs <track> "<expr>"        # `a` = __apex; async ok; --raw for full JSON
node tools/apex-eval.mjs monaco "a.camera()"
node tools/apex-eval.mjs spa    "({c:a.corners().length, w:a.wallStats()})"

# Parallel screenshot validation (writes PNGs + a blank/fail manifest):
node tools/apex-capture.mjs cameras [track] [outdir]   # camera-mode sweep (12 of the game's 13 modes)
node tools/apex-capture.mjs modes   [outdir]           # menu / race day,wet,night / results / time-trial
node tools/apex-capture.mjs tracks  [outdir] [id ...]  # one orbit shot per circuit
```

## Single framed screenshot (`shot.mjs`)

For ONE deterministic shot, use the helper in this skill folder — it boots a
server, waits for `__apex`, freezes the scene, frames the camera, writes a PNG:

```sh
node .claude/skills/playwright-probe/shot.mjs <trackId> <frac> [cam] [out.png]
# cam = orbit | eye | cinematic | trackside | park
node .claude/skills/playwright-probe/shot.mjs monaco 0.18 orbit  scratch/captures/playwright-probe/monaco-chicane.png
node .claude/skills/playwright-probe/shot.mjs spa    0.07 eye    scratch/captures/playwright-probe/eau-rouge.png
```

**Viewport gotcha:** `shot.mjs` uses **1280×720** (wide survey frame). In-race
Playwright **specs** use landscape **844×390** to avoid the `#rotate-device`
overlay — don't copy the spec viewport into `shot.mjs` or vice versa.

**Corner fractions:** don't hardcode folklore chicane numbers — probe first:
`__apex.trackInfo({what:"corners"})`, `__apex.corners()`, or `js/track/markings.js`
(`CircuitMarkings` curated apexes). Official FIA turns ≠ curvature peaks (see
**debug-tracks**).

A blank/dark canvas comes out < ~5 KB; a real 3D frame is tens of KB (the
suite's non-blank heuristic). For the full camera-hook reference
(park/freeze/eyeAt/orbit/view/cinematic/carOrbit/previewCam) see
**debug-cameras**; add `setTimeOfDay`/`weather` calls for lighting variants.
For before/after: capture with the same `(track, frac, cam)` args on each side
of the change so only the pixels you care about differ. Output goes under `scratch/captures/playwright-probe/` by default (and `apex-capture` defaults to `scratch/captures/apex-capture/<purpose>/`) — don't commit throwaway screenshots; visual-regression baselines
under `tests/` are updated only via `npx playwright test --update-snapshots`.

## UI screens (DOM, not canvas)

The menu/setup/results screens are DOM — follow the `tests/ui-audit.spec.js`
pattern (navigate the menus, `page.screenshot` to `artifacts/galleries-<port>/<suite>/`) and
use `tests/f1-api-mock.js` so the data hub renders without network egress.
Portrait UI uses `{width:390,height:844}`; in-race shots must use **landscape**
`{width:844,height:390}` to avoid the `#rotate-device` overlay.

`apex-capture` exits non-zero and lists any shot that came back `blank:true`
(< ~5 KB) — so a broken render fails CI-style without opening every file. Both
tools start their own server + Chromium; no setup beyond `npm install`.

## Why one server + Chromium workers

`tools/apex-capture.mjs` uses **one async Node static server** and fans jobs
across separate Chromium worker processes. For sweeps (12 camera modes, 40
tracks, day/night/wet variants), the shared server handles concurrent asset
GETs while workers pull the next job as they finish. Extra Python servers only
helped asset fetch; they are not the current harness.

## Environment gotchas (already handled in the tools — replicate in custom harnesses)

1. **Chromium version mismatch.** The npm `playwright` build may not match the
   image's preinstalled browser (`npx playwright install` is blocked / wasteful).
   Launch with the preinstalled binary:
   ```js
   chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
     args: ["--use-angle=swiftshader", "--enable-unsafe-webgpu"] });
   ```
2. **Resolve playwright from the project** when your script lives outside it
   (e.g. scratchpad):
   ```js
   import { createRequire } from "node:module";
   const require = createRequire(process.cwd() + "/"); // run from repo root
   const { chromium } = require("playwright");
   ```
3. **Free ports**, don't hardcode — bind `:0` and read back the port, or you'll
   collide with a leftover server.
4. **Wait for readiness**: `waitForFunction(() => window.__apex != null)` then
   `race(id)` then `waitForFunction(() => __apex.info().track === id)` then a
   ~1.6 s settle for the mesh build before probing/shooting.
5. **Viewports**: in-race shots use **landscape** `{844,390}` (avoids the
   `#rotate-device` overlay); DOM screens (menu/results) use a larger viewport.
6. **THE CAMERA LAGS — call `snapCam()` after `park()`/`jump()`.** The game camera
   eases toward its rig target exponentially, so after a teleport it spends a second
   or more *flying* to the car. Screenshot in that window and you get an empty
   frame, the car half out of shot, or scenery from 300 m back.
   ```js
   __apex.park(0.12);   // stationary + frozen: the deterministic-shot hook
   __apex.snapCam();    // REQUIRED for park/chase — bypasses damping
   ```
   **`shot.mjs` calls `snapCam()` automatically for `park` mode**; for `orbit` /
   `eye` / `cinematic` / `trackside` it sets `dbgCam` directly (no snapCam — and
   never call snapCam after orbit; see **debug-cameras**). Waiting longer is not a
   fix (the ease is slow and `freeze()` can hold it). Symptom: eye-to-car distance
   in the hundreds of metres when chase should read ~5.8 m.

   If you are comparing camera BEHAVIOUR (does the rig follow the car or the
   road?), note that `park()` cannot tell them apart: it puts the car on the
   centreline with heading == tangent, exactly where every rig coincides. Yaw the
   car off the road first (steer for ~45 ticks), then `freeze()` + `snapCam()`,
   and compare the eye→target bearing against `physState().head` vs the road
   tangent (`head + probe().angle`).
7. **There are TWO camera call sites.** The live rig is solved in `render()`;
   `snapCam()`/`startRace()` go through `snapGameCam()`, and `previewCam()`
   through its own `camVantage()` call with an empty `extra`. They are meant to
   frame identically — if you add anything to the camera's inputs, wire all of
   them, or a snapped/preview shot will silently disagree with the live view.

## Custom-harness skeleton

```js
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/"); // run from repo root
const { chromium } = require("playwright");
// startStaticServer() -> port; open(browser, port) -> page; race(page,id);
const port = await startStaticServer();
const results = await Promise.all(TRACKS.map(async (id) => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-angle=swiftshader","--enable-unsafe-webgpu"] });
  try {
    const page = await open(browser, port);
    await race(page, id);
    return page.evaluate(() => ({ corners: __apex.corners().length, light: __apex.lightState().numLights }));
  } finally {
    await browser.close();
  }
}));
```

Use this to validate work from the camera / track / state debug skills
(`debug-cameras`, `debug-tracks`, `debug-state`) at scale. For single
deterministic screenshots, `shot.mjs` (above) is simpler.

## Shared Playwright fixtures (`tests/fixtures.js`)

When writing specs rather than ad-hoc scripts, import from the shared fixtures
file instead of `@playwright/test` directly — it mocks Jolpica/OpenF1 API calls
(so tests run offline), injects `window.__TEST_MODE`, and provides two extras:

```js
import { test, expect } from './fixtures.js';

test('example', async ({ page, pageErrors, racePage }) => {
  // racePage: page already navigated to '/' with __apex available (saves boilerplate)
  // pageErrors: string[] of uncaught JS errors — assert .toHaveLength(0) after exercising logic
  await racePage.evaluate(() => __apex.race('monza'));
  // ...
  expect(pageErrors).toHaveLength(0);
});
```

`racePage` navigates to `/` and waits for `window.__apex` (10 s timeout) before
handing the page to the test. `pageErrors` collects every `pageerror` event.
```
