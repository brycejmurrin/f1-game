---
name: playwright-probe
description: Drive the game headless with Playwright to validate cameras, game modes, tracks, and physics at scale — starting multiple static servers in parallel and fanning pages across them for fast probing + screenshot capture. Covers the two committed tools (apex-eval for one-off __apex expressions, apex-capture for parallel screenshot validation) and the environment gotchas (preinstalled Chromium executablePath, project-resolved playwright, free-port servers). Use for "test a bunch of stuff", "screenshot all camera modes / tracks", "validate game modes", "run a parallel sweep", "exercise the debug hooks".
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
node tools/apex-capture.mjs cameras [track] [outdir]   # 12 camera modes
node tools/apex-capture.mjs modes   [outdir]           # menu / race day,wet,night / results / time-trial
node tools/apex-capture.mjs tracks  [outdir] [id ...]  # one orbit shot per circuit
```

`apex-capture` exits non-zero and lists any shot that came back `blank:true`
(< ~5 KB) — so a broken render fails CI-style without opening every file. Both
tools start their own server(s) + Chromium; no setup beyond `npm install`.

## Why parallel servers

`python3 -m http.server` is single-threaded. For sweeps (12 camera modes, 24
tracks, day/night/wet variants) fan pages across **multiple servers** so a slow
asset fetch on one page doesn't stall the others. Verified: 4 servers + 4 pages
profiled 4 circuits in ~10 s, and captured all 12 camera modes well under a
minute. `apex-capture` already does this (`startServers(4)` + `fanout`).

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
   const require = createRequire("/home/user/f1-game/");
   const { chromium } = require("playwright");
   ```
3. **Free ports**, don't hardcode — bind `:0` and read back the port, or you'll
   collide with a leftover server.
4. **Wait for readiness**: `waitForFunction(() => window.__apex != null)` then
   `race(id)` then `waitForFunction(() => __apex.info().track === id)` then a
   ~1.6 s settle for the mesh build before probing/shooting.
5. **Viewports**: in-race shots use **landscape** `{844,390}` (avoids the
   `#rotate-device` overlay); DOM screens (menu/results) use a larger viewport.

## Custom-harness skeleton

```js
import { createRequire } from "node:module";
const require = createRequire("/home/user/f1-game/");
const { chromium } = require("playwright");
// startServers(n) -> ports; open(browser,port) -> page; race(page,id);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-angle=swiftshader","--enable-unsafe-webgpu"] });
const results = await Promise.all(ports.map(async (p, i) => {
  const page = await open(browser, p);
  await race(page, TRACKS[i]);
  return page.evaluate(() => ({ corners: __apex.corners().length, light: __apex.lightState().numLights }));
}));
```

Use this to validate work from the camera / track / state debug skills
(`debug-cameras`, `debug-tracks`, `debug-state`) at scale. For single deterministic
screenshots, the `inspect-scene` skill's `shot.mjs` is simpler.

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
