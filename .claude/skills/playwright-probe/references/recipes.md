# Playwright-probe recipes — UI shots, camera fanout, env gotchas, custom harness

Load from the SKILL.md index when the task needs this detail.

## Contents
- UI screens (DOM, not canvas)
- `apex-capture cameras` — 12 modes, no drift
- Why one server + Chromium workers
- Environment gotchas (already handled in the tools — replicate in custom harnesses)
- Custom-harness skeleton (parent-owned browser)
- Shared Playwright fixtures (`tests/helpers/fixtures.js`)

## UI screens (DOM, not canvas)

The menu/setup/results screens are DOM — follow the `tests/specs/ui-audit.spec.js`
pattern (navigate the menus, `page.screenshot` to `artifacts/galleries-<port>/<suite>/`) and
use `tests/helpers/f1-api-mock.js` so the data hub renders without network egress.
Portrait UI uses `{width:390,height:844}`; in-race shots must use **landscape**
`{width:844,height:390}` to avoid the `#rotate-device` overlay.

`apex-capture` exits non-zero and lists any shot that came back `blank:true`
(including near-black checks for soft captures; byte size alone is not proof) — so a broken render fails CI-style without opening every file. Both
tools start their own server + Chromium; no setup beyond `npm install`.

## `apex-capture cameras` — 12 modes, no drift

The harness hardcodes 12 of the game's **20** `CAM_MODES` (`js/camera/mode-switch.js`):
`chase`, `far`, `cockpit`, `hood`, `overhead`, `heli`, `reverse`, `side`,
`cinematic`, `low`, `tcam`, `rear` — **`drift`, `visor`, `trackside`, `rival`,
`pitwall`, `drone`, `tv`, `helmet` are omitted**. It also hardcodes
`park(0.1)` (10% lap) for every shot; a different fraction needs a custom sweep
with `previewCam(mode, frac)` (mode FIRST — it is validated first and the call
silently returns `false` if the arguments are swapped) or a fork of
`tools/shot/apex-capture.mjs`.

To include one of them (e.g. **drift**), append it to the `CAMS` array in `apex-capture.mjs` (or
run a one-off):

```sh
node tools/shot/apex-eval.mjs monza "(a.park(0.18), a.camera('drift'), a.snapCam())"
# then screenshot the canvas, or duplicate the cameras fanout with CAMS.push('drift')
```

For arbitrary lap fractions without forking, use `shot.mjs` with your `frac` arg
or a `previewCam` loop (see `cameras.md`).

## Why one server + Chromium workers

`tools/shot/apex-capture.mjs` uses **one async Node static server** and fans jobs
across separate Chromium worker processes. For sweeps (12 camera modes, 52
tracks, day/night/wet variants), the shared server handles concurrent asset
GETs while workers pull the next job as they finish. Extra Python servers only
helped asset fetch; they are not the current harness.

## Environment gotchas (already handled in the tools — replicate in custom harnesses)

1. **Chromium selection.** Use `launchChromium()` from
   `tools/lib/harness.mjs`, which honors `PW_CHROMIUM`, cached/system binaries
   and DISPLAY cleanup. Backend flags come from `chromiumArgsForBackend()`
   and `installProbeInit()`, never a hardcoded `/opt` executable.
2. **Resolve playwright from the project** when your script lives outside it
   (e.g. scratchpad):
   ```js
   import { createRequire } from "node:module";
   const require = createRequire(process.cwd() + "/"); // run from repo root
   const { chromium } = require("playwright");
   ```
3. **Free ports**, don't hardcode — bind `:0` and read back the port, or you'll
   collide with a leftover server.
4. **Wait for readiness**: every rendering-page `waitForFunction` needs
   `{ polling: 100 }` (default rAF polling starves under SwiftShader):
   `waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS })` then
   `race(id)` then
   `waitForFunction(t => __apex.info().track === t, id, { polling: 100, timeout: BOOT_MS })` then a
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
   never call snapCam after orbit; see `cameras.md`). Waiting longer is not a
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

## Custom-harness skeleton (parent-owned browser)

```js
import {launchChromium, shutdown, startStaticServer} from "./tools/lib/harness.mjs";
import {installProbeInit, screenshotPresentedCanvas, chromiumArgsForBackend} from "./tools/shot/probe-page.mjs";
const srv = await startStaticServer(process.cwd());
try {
  const browser = await launchChromium({args:chromiumArgsForBackend("webgl2")});
  for (const id of TRACKS) { // serialize; never Promise.all browser boots
    const page = await browser.newPage({viewport:{width:844,height:390}});
    try {
      await installProbeInit(page, {backend:"webgl2"}); // GLX; "three" = TLX (pins tlxForceGL), "webgpu" = WGX
      await page.goto(srv.url);
      await page.waitForFunction(() => window.__apex != null, null, {polling:100,timeout:45000});
      await page.evaluate(t => { __apex.seed(42); __apex.race(t); }, id);
      await page.waitForFunction(t => __apex.info().track === t, id, {polling:100,timeout:45000});
      await page.evaluate(() => { __apex.go(); __apex.jump(0.1,30); __apex.snapCam(); });
      await page.evaluate(() => __apex.awaitPresent());
      const capture = await screenshotPresentedCanvas(page);
      // capture.buf is the PNG Buffer; persist below artifacts/ and validate pixels.
    } finally { await page.close(); }
  }
} finally { await shutdown(); }
```

Use `screenshotPresentedCanvas()` / `screenshotGameCanvas()` for rendered output;
these route soft-present surfaces through bounded CDP capture and avoid live
canvas locator stability waits. A small file is only a warning: inspect near-black
pixel checks and renderer readiness before calling pixels valid. DOM-only
`page.screenshot()` remains appropriate with the game canvas hidden.

## Shared Playwright fixtures (`tests/helpers/fixtures.js`)

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

`racePage` navigates to `/` and waits for `window.__apex` (`BOOT_MS` from the fixtures) before
handing the page to the test. `pageErrors` collects every `pageerror` event.
```
